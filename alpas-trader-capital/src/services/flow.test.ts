import { describe, expect, it } from "vitest";
import { verifyCertificate } from "@/domain/certificates";
import { usd } from "@/domain/money";
import { canTransition } from "@/domain/payout";
import { DAY_MS, zonedToUtc } from "@/domain/time";
import * as A from "./actions";
import { createSeedState, DEMO_USERS, SCENARIO_ACCOUNTS } from "./seed";
import { evaluateAccount, getAccount, getChallenge, type DemoState } from "./state";

const OPS: A.Actor = { role: "ops", id: "ops.test" };
const T0 = zonedToUtc(2026, 11, 10, 9, 0, "America/New_York"); // Tuesday 09:00 NY

function fresh() {
  const s = createSeedState(T0);
  return { s, now: T0 + s.clockOffsetMs };
}

function newTrader(s: DemoState, now: number) {
  const r = A.registerUser(s, { name: "Test Trader", email: "t@example.com", password: "password1", country: "DE", locale: "en", acceptTerms: true }, now);
  if (!r.ok) throw new Error(r.error);
  return { role: "trader", id: r.value.userId } as A.Actor;
}

const purchase = (s: DemoState, actor: A.Actor, now: number, programId: "ascent" | "ridge" = "ascent", size = usd(10_000)) =>
  A.purchaseChallenge(
    s,
    actor,
    { programId, size, platform: "mt5", billing: { name: "Test Trader", country: "DE" }, paymentMethod: "card_demo", acceptTerms: true, acceptRisk: true },
    now,
  );

describe("end-to-end lifecycle (two-step)", () => {
  it("purchase → phase 1 → phase 2 → review → KYC → contract → funded → payout → paid → certificates", () => {
    const { s } = fresh();
    let now = T0 + s.clockOffsetMs;
    const trader = newTrader(s, now);
    const p = purchase(s, trader, now);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const ch = getChallenge(s, p.value.challengeId)!;
    expect(ch.ruleSetId).toBe("ascent@1.1");
    expect(getAccount(s, p.value.accountId)!.status).toBe("ready");

    // Phase 1
    let r = A.demoCompleteObjectives(s, trader, p.value.accountId, now);
    expect(r.ok).toBe(true);
    if (r.ok) now = r.value.now;
    expect(getAccount(s, p.value.accountId)!.status).toBe("passed");
    expect(ch.accountIds).toHaveLength(2);
    const phase2 = getAccount(s, ch.accountIds[1])!;
    expect(phase2.kind).toBe("phase2");
    expect(phase2.status).toBe("ready");
    expect(ch.fundedAccountId).toBeUndefined(); // passing phase 1 never creates a funded account
    expect(s.certificates.some((c) => c.challengeId === ch.id)).toBe(false);

    // Phase 2
    r = A.demoCompleteObjectives(s, trader, phase2.id, now);
    if (r.ok) now = r.value.now;
    expect(getAccount(s, phase2.id)!.status).toBe("under_review");
    expect(ch.status).toBe("under_review");
    const review = s.reviews.find((x) => x.accountId === phase2.id)!;

    // Traders cannot approve; ops can, only with verified objectives.
    expect(A.opsApproveReview(s, trader, review.id, "", now)).toMatchObject({ ok: false, error: "forbidden" });
    expect(A.opsApproveReview(s, OPS, review.id, "Checks passed", now).ok).toBe(true);
    expect(ch.status).toBe("passed");
    const cp = s.certificates.find((c) => c.type === "challenge_passed" && c.sourceId === ch.id);
    expect(cp?.status).toBe("valid");

    // Contract cannot be signed before KYC.
    expect(A.signContract(s, trader, ch.id, "Test Trader", true, now)).toMatchObject({ ok: false });
    expect(A.submitKyc(s, trader, { legalName: "Test Trader", dateOfBirth: "1990-01-01", documentType: "passport", confirmDemo: true }, now).ok).toBe(true);
    expect(A.opsDecideKyc(s, OPS, trader.id, "verified", "", now).ok).toBe(true);
    expect(ch.contract.status).toBe("ready");
    expect(A.signContract(s, trader, ch.id, "Someone Else", true, now)).toMatchObject({ ok: false, error: "signer_mismatch" });
    const sign = A.signContract(s, trader, ch.id, "test trader", true, now);
    expect(sign.ok).toBe(true);
    if (!sign.ok) return;
    const funded = getAccount(s, sign.value.fundedAccountId)!;
    expect(funded.kind).toBe("funded");
    expect(funded.status).toBe("active");
    expect(s.certificates.some((c) => c.type === "funded_trader" && c.sourceId === funded.id)).toBe(true);

    // Not eligible immediately.
    expect(A.eligibilityFor(s, funded.id, now)!.eligible).toBe(false);
    for (let d = 0; d < 6; d++) {
      const sim = A.demoSimulateSession(s, trader, funded.id, "profit", now);
      expect(sim.ok).toBe(true);
      if (sim.ok) now = sim.value.now;
      const adv = A.demoAdvanceClock(s, DAY_MS, now);
      if (adv.ok) now = adv.value.now;
    }
    const adv = A.demoAdvanceClock(s, 10 * DAY_MS, now);
    if (adv.ok) now = adv.value.now;
    const elig = A.eligibilityFor(s, funded.id, now)!;
    expect(elig.checks.filter((c) => c.status !== "met")).toEqual([]);
    expect(elig.feeRefundDue).toBe(usd(89));

    // Request: above available and duplicates are rejected; the gross is reserved.
    const before = evaluateAccount(s, funded.id, now);
    expect(A.requestPayout(s, trader, { accountId: funded.id, amount: elig.requestable + 1, method: "bank_transfer_demo" }, now)).toMatchObject({ ok: false, error: "exceeds_available" });
    expect(A.requestPayout(s, trader, { accountId: funded.id, amount: elig.minRequest - 1, method: "bank_transfer_demo" }, now)).toMatchObject({ ok: false, error: "below_minimum" });
    const req = A.requestPayout(s, trader, { accountId: funded.id, amount: elig.requestable, method: "bank_transfer_demo" }, now);
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    const payout = s.payouts.find((x) => x.id === req.value.payoutId)!;
    expect(payout.status).toBe("requested"); // never auto-paid
    expect(payout.traderShare + payout.companyShare).toBe(payout.gross);
    expect(payout.netToTrader).toBe(payout.traderShare + usd(89));
    const reservedEv = evaluateAccount(s, funded.id, now);
    expect(reservedEv.balance).toBe(before.balance - payout.gross);
    expect(reservedEv.reserved).toBe(payout.gross);
    expect(reservedEv.breach).toBeNull();
    expect(A.requestPayout(s, trader, { accountId: funded.id, amount: elig.minRequest, method: "bank_transfer_demo" }, now)).toMatchObject({ ok: false });

    // Ops lifecycle; traders cannot move it forward; no certificate before Paid.
    expect(A.opsTransitionPayout(s, trader, payout.id, "approved", "", now)).toMatchObject({ ok: false, error: "forbidden" });
    expect(A.opsTransitionPayout(s, OPS, payout.id, "paid", "", now)).toMatchObject({ ok: false, error: "invalid_transition" });
    for (const st of ["under_review", "approved", "processing"] as const) {
      expect(A.opsTransitionPayout(s, OPS, payout.id, st, "", now).ok).toBe(true);
      expect(s.certificates.some((c) => c.type === "payout" && c.sourceId === payout.id)).toBe(false);
    }
    expect(A.opsTransitionPayout(s, OPS, payout.id, "paid", "", now).ok).toBe(true);
    const poCert = s.certificates.find((c) => c.type === "payout" && c.sourceId === payout.id)!;
    expect(poCert.amount).toBe(payout.netToTrader);
    expect(ch.feeRefunded).toBe(true);

    // After payout: balance stays reduced, reserve becomes a withdrawal, account still healthy.
    const after = evaluateAccount(s, funded.id, now);
    expect(after.reserved).toBe(0);
    expect(after.withdrawn).toBe(payout.gross);
    expect(after.balance).toBe(before.balance - payout.gross);
    expect(after.breach).toBeNull();
    expect(after.maxFloor).toBe(usd(9_000));
    // The next cycle starts from this request, and the fee is not refunded twice.
    const next = A.eligibilityFor(s, funded.id, now)!;
    expect(next.eligible).toBe(false);
    expect(next.feeRefundDue).toBe(0);

    // Every critical change was logged.
    const actions = new Set(s.audit.map((a) => a.action));
    for (const a of ["order.created_demo", "phase.passed", "review.opened", "review.approved", "kyc.verified", "contract.signed_demo", "funded.activated", "payout.requested", "payout.paid", "certificate.issued"])
      expect(actions.has(a)).toBe(true);
  });
});

describe("payout reserve release", () => {
  it("rejection requires a reason and returns the reserved amount to the balance", () => {
    const { s, now } = fresh();
    const defne: A.Actor = { role: "trader", id: DEMO_USERS.defne.id };
    const before = evaluateAccount(s, SCENARIO_ACCOUNTS.funded, now).balance;
    const req = A.requestPayout(s, defne, { accountId: SCENARIO_ACCOUNTS.funded, amount: usd(1_000), method: "stablecoin_demo" }, now);
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(evaluateAccount(s, SCENARIO_ACCOUNTS.funded, now).balance).toBe(before - usd(1_000));
    expect(A.opsTransitionPayout(s, OPS, req.value.payoutId, "rejected", "short", now)).toMatchObject({ ok: false, error: "reason_required" });
    expect(A.opsTransitionPayout(s, OPS, req.value.payoutId, "rejected", "Trading days in cycle could not be verified.", now).ok).toBe(true);
    expect(evaluateAccount(s, SCENARIO_ACCOUNTS.funded, now).balance).toBe(before);
  });

  it("trader can cancel only while requested", () => {
    const { s, now } = fresh();
    const defne: A.Actor = { role: "trader", id: DEMO_USERS.defne.id };
    const req = A.requestPayout(s, defne, { accountId: SCENARIO_ACCOUNTS.funded, amount: usd(1_000), method: "bank_transfer_demo" }, now);
    if (!req.ok) throw new Error(req.error);
    A.opsTransitionPayout(s, OPS, req.value.payoutId, "under_review", "", now);
    expect(A.cancelPayout(s, defne, req.value.payoutId, now)).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(canTransition("requested", "cancelled", "trader")).toBe(true);
    expect(canTransition("requested", "cancelled", "ops")).toBe(false);
  });

  it("other users cannot request payouts on someone else's account", () => {
    const { s, now } = fresh();
    const jonah: A.Actor = { role: "trader", id: DEMO_USERS.jonah.id };
    expect(A.requestPayout(s, jonah, { accountId: SCENARIO_ACCOUNTS.funded, amount: usd(1_000), method: "bank_transfer_demo" }, now)).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("rule snapshot immutability", () => {
  it("publishing a new version changes new purchases only", () => {
    const { s, now } = fresh();
    const trader = newTrader(s, now);
    const first = purchase(s, trader, now);
    if (!first.ok) throw new Error(first.error);
    const pub = A.opsPublishRuleVersion(s, OPS, "ascent", [{ phaseIndex: 0, dailyLossBps: 400 }], {}, { en: "Daily loss reduced to 4%.", tr: "Günlük zarar %4'e indirildi." }, now);
    expect(pub.ok).toBe(true);
    const old = getChallenge(s, first.value.challengeId)!;
    expect(old.ruleSnapshot.version).toBe("1.1");
    expect(old.ruleSnapshot.phases[0].dailyLossBps).toBe(500);
    expect(evaluateAccount(s, first.value.accountId, now).dailyLossAmount).toBe(usd(500));
    const second = purchase(s, trader, now);
    if (!second.ok) throw new Error(second.error);
    const ch2 = getChallenge(s, second.value.challengeId)!;
    expect(ch2.ruleSetId).toBe("ascent@1.2");
    expect(evaluateAccount(s, second.value.accountId, now).dailyLossAmount).toBe(usd(400));
  });

  it("the seeded funded account keeps v1.0 (first payout after 21 days)", () => {
    const { s } = fresh();
    const ch = getChallenge(s, getAccount(s, SCENARIO_ACCOUNTS.funded)!.challengeId)!;
    expect(ch.ruleSnapshot.version).toBe("1.0");
    expect(ch.ruleSnapshot.payout.firstPayoutAfterDays).toBe(21);
  });
});

describe("seed scenarios are consistent with the engine", () => {
  it("each scenario evaluates to the state it claims", () => {
    const { s, now } = fresh();
    const ev = (id: string) => evaluateAccount(s, id, now);
    expect(getAccount(s, SCENARIO_ACCOUNTS.newAccount)!.status).toBe("ready");
    expect(ev(SCENARIO_ACCOUNTS.newAccount).tradingDays).toBe(0);
    const prog = ev(SCENARIO_ACCOUNTS.inProgress);
    expect(prog.breach).toBeNull();
    expect(prog.completion.ready).toBe(false);
    const near = ev(SCENARIO_ACCOUNTS.nearLimit);
    expect(near.breach).toBeNull();
    expect(near.dailyRemaining).toBeLessThan(near.dailyLossAmount * 0.2);
    expect(near.openTrades).toHaveLength(1);
    expect(ev(SCENARIO_ACCOUNTS.underReview).completion.ready).toBe(true);
    expect(ev(SCENARIO_ACCOUNTS.breached).breach?.type).toBe("daily_loss");
    expect(A.eligibilityFor(s, SCENARIO_ACCOUNTS.funded, now)!.eligible).toBe(true);
    // Syncing must not change any scenario.
    const statuses = s.accounts.map((a) => a.status);
    A.syncAll(s, now);
    expect(s.accounts.map((a) => a.status)).toEqual(statuses);
  });

  it("is deterministic for the same clock", () => {
    const a = createSeedState(T0);
    const b = createSeedState(T0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("demo tools", () => {
  it("a forced breach closes the account and the challenge fails", () => {
    const { s, now } = fresh();
    const defne: A.Actor = { role: "trader", id: DEMO_USERS.defne.id };
    expect(A.demoCloseAll(s, defne, SCENARIO_ACCOUNTS.nearLimit, now).ok).toBe(true);
    const r = A.demoSimulateSession(s, defne, SCENARIO_ACCOUNTS.nearLimit, "breach", now);
    expect(r.ok).toBe(true);
    const acc = getAccount(s, SCENARIO_ACCOUNTS.nearLimit)!;
    expect(acc.status).toBe("breached");
    expect(getChallenge(s, acc.challengeId)!.status).toBe("failed");
    expect(A.demoSimulateSession(s, defne, acc.id, "profit", now)).toMatchObject({ ok: false, error: "account_frozen" });
  });

  it("moving the market against an open position near the limit triggers a live breach", () => {
    const { s, now } = fresh();
    const defne: A.Actor = { role: "trader", id: DEMO_USERS.defne.id };
    A.demoMoveMarket(s, defne, SCENARIO_ACCOUNTS.nearLimit, "against", now);
    const acc = getAccount(s, SCENARIO_ACCOUNTS.nearLimit)!;
    expect(acc.status).toBe("breached");
    expect(s.trades.filter((t) => t.accountId === acc.id && t.status === "open")).toHaveLength(0);
  });

  it("normal losing sessions never breach by themselves", () => {
    const { s, now } = fresh();
    const defne: A.Actor = { role: "trader", id: DEMO_USERS.defne.id };
    let t = now;
    for (let i = 0; i < 5; i++) {
      const r = A.demoSimulateSession(s, defne, SCENARIO_ACCOUNTS.inProgress, "loss", t);
      expect(r.ok).toBe(true);
      if (r.ok) t = r.value.now;
    }
    expect(getAccount(s, SCENARIO_ACCOUNTS.inProgress)!.status).toBe("active");
  });
});

describe("certificates", () => {
  it("verification supports valid, revoked, not found and code mismatch", () => {
    const { s } = fresh();
    const valid = s.certificates.find((c) => c.status === "valid" && c.type === "challenge_passed")!;
    const revoked = s.certificates.find((c) => c.status === "revoked")!;
    expect(verifyCertificate(s.certificates, valid.id, valid.verificationCode).state).toBe("valid");
    expect(verifyCertificate(s.certificates, revoked.id).state).toBe("revoked");
    expect(verifyCertificate(s.certificates, "ATC-CP-26-999999").state).toBe("not_found");
    expect(verifyCertificate(s.certificates, valid.id, "AAAA-BBBB").state).toBe("code_mismatch");
    const view = verifyCertificate(s.certificates, valid.id);
    expect(JSON.stringify(view)).not.toContain("@");
    expect(JSON.stringify(view)).not.toContain(SCENARIO_ACCOUNTS.funded);
  });

  it("revocation requires ops and a reason", () => {
    const { s, now } = fresh();
    const c = s.certificates.find((x) => x.status === "valid")!;
    expect(A.opsRevokeCertificate(s, { role: "trader", id: c.userId }, c.id, "Issued in error, see ticket.", now).ok).toBe(false);
    expect(A.opsRevokeCertificate(s, OPS, c.id, "short", now).ok).toBe(false);
    expect(A.opsRevokeCertificate(s, OPS, c.id, "Issued in error, see ticket.", now).ok).toBe(true);
    expect(verifyCertificate(s.certificates, c.id).state).toBe("revoked");
  });
});

describe("checkout validation", () => {
  it("blocks restricted countries, unknown promo codes and missing consent", () => {
    const { s, now } = fresh();
    const trader = newTrader(s, now);
    const input = { programId: "ascent" as const, size: usd(10_000), platform: "mt5" as const, billing: { name: "Test Trader", country: "DE" }, paymentMethod: "card_demo" as const, acceptTerms: true, acceptRisk: true };
    expect(A.purchaseChallenge(s, trader, { ...input, billing: { name: "X Y", country: "IR" } }, now)).toMatchObject({ ok: false, error: "country_restricted" });
    expect(A.purchaseChallenge(s, trader, { ...input, promoCode: "NOPE" }, now)).toMatchObject({ ok: false, error: "promo_unknown" });
    expect(A.purchaseChallenge(s, trader, { ...input, programId: "ridge", promoCode: "ASCENT10" }, now)).toMatchObject({ ok: false, error: "promo_not_applicable" });
    expect(A.purchaseChallenge(s, trader, { ...input, acceptRisk: false }, now)).toMatchObject({ ok: false, error: "terms_required" });
    const ok = A.purchaseChallenge(s, trader, { ...input, promoCode: "ascent10" }, now);
    expect(ok.ok).toBe(true);
    expect(s.orders[0].discount).toBe(usd(8.9));
    expect(s.orders[0].total).toBe(usd(80.1));
    expect(A.purchaseChallenge(s, { role: "trader", id: "nobody" }, input, now)).toMatchObject({ ok: false, error: "auth_required" });
  });
});
