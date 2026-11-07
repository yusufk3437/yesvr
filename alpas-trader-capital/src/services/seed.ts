/**
 * Demo seed. All scenarios are generated from trades through the same engine,
 * relative to "now" so the demo never looks stale. If the market is closed
 * (weekend) the demo clock is anchored to the last trading session.
 */
import { CONTRACT_VERSION, PROGRAMS, PROMO_CODES, RULE_SETS, getRuleSet } from "@/domain/catalog";
import { certificateId, maskAccount, verificationCode } from "@/domain/certificates";
import { applyBps, usd, type Cents } from "@/domain/money";
import { quotePayout } from "@/domain/payout";
import {
  DAY_MS,
  HOUR_MS,
  addDaysToKey,
  isWeekdayKey,
  previousTradingDayKeys,
  tradingDayKey,
  tradingDayStart,
} from "@/domain/time";
import type {
  Account,
  Certificate,
  CertificateType,
  Challenge,
  PhaseKind,
  PlatformId,
  ProgramId,
  Trade,
  User,
} from "@/domain/types";
import { demoHash } from "./actions";
import { createRng, hashSeed } from "./rng";
import { generateBreachTrade, generateSession, moveMark, openPositionTrade } from "./simulate";
import { SCHEMA_VERSION, evaluateAccount, type DemoState } from "./state";

export const DEMO_PASSWORD = "demo-trader";
export const DEMO_USERS = {
  defne: { id: "U-DEFNE", email: "defne.yildirim@example.com", name: "Defne Yıldırım" },
  jonah: { id: "U-JONAH", email: "jonah.reyes@example.com", name: "Jonah Reyes" },
} as const;

export const SCENARIO_ACCOUNTS = {
  newAccount: "ATC-104210",
  inProgress: "ATC-104377",
  nearLimit: "ATC-207514",
  underReview: "ATC-104455",
  funded: "ATC-500318",
  breached: "ATC-207301",
  otherUserFunded: "ATC-310882",
} as const;

const TZ = "America/New_York";
const RH = 17;

export function demoAnchor(realNow: number): number {
  let key = tradingDayKey(realNow, TZ, RH);
  const start = tradingDayStart(key, TZ, RH);
  if (isWeekdayKey(key) && realNow - start >= 5 * HOUR_MS) return realNow;
  do key = addDaysToKey(key, -1);
  while (!isWeekdayKey(key));
  return tradingDayStart(key, TZ, RH) + 22 * HOUR_MS; // 15:00 New York
}

export function emptyState(realNow: number): DemoState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: realNow,
    clockOffsetMs: 0,
    session: { userId: null, role: "trader" },
    cart: null,
    catalog: { programs: structuredClone(PROGRAMS), ruleSets: structuredClone(RULE_SETS), promos: structuredClone(PROMO_CODES) },
    users: [],
    orders: [],
    challenges: [],
    accounts: [],
    trades: [],
    ledger: [],
    reviews: [],
    payouts: [],
    certificates: [],
    notifications: [],
    journal: [],
    tickets: [],
    audit: [],
    feedback: [],
    articles: [],
    resetTokens: [],
    counters: { account: 104_700, trade: 0, order: 0, cert: 0, payout: 0, misc: 0 },
  };
}

class SeedBuilder {
  constructor(public s: DemoState) {}
  tradeSeq = 0;
  nextTradeId = () => `T${++this.s.counters.trade}`;

  user(u: { id: string; email: string; name: string }, country: string, createdAt: number, legalName: string): User {
    const user: User = {
      id: u.id,
      name: u.name,
      email: u.email,
      country,
      locale: "en",
      createdAt,
      passwordHash: demoHash(DEMO_PASSWORD),
      kyc: {
        status: "verified",
        submittedAt: createdAt + 30 * DAY_MS,
        decidedAt: createdAt + 31 * DAY_MS,
        legalName,
        dateOfBirth: "1994-05-12",
        documentType: "passport",
      },
      twoFactorEnabled: false,
      marketingOptIn: false,
    };
    this.s.users.push(user);
    return user;
  }

  challenge(user: User, programId: ProgramId, size: Cents, ruleSetId: string, createdAt: number, platform: PlatformId) {
    const seq = ++this.s.counters.order;
    const program = this.s.catalog.programs.find((p) => p.id === programId)!;
    const price = program.sizes.find((o) => o.size === size)!.price;
    const orderId = `ORD-${String(new Date(createdAt).getUTCFullYear()).slice(2)}-${String(seq).padStart(5, "0")}`;
    const ch: Challenge = {
      id: `CH-${seq}`,
      userId: user.id,
      orderId,
      programId,
      size,
      ruleSetId,
      ruleSnapshot: structuredClone(getRuleSet(ruleSetId)),
      status: "in_progress",
      accountIds: [],
      createdAt,
      contract: { status: "not_available" },
      feeRefunded: false,
    };
    this.s.challenges.push(ch);
    this.s.orders.unshift({
      id: orderId,
      invoiceNo: `ALP-DEMO-${new Date(createdAt).getUTCFullYear()}-${String(seq).padStart(5, "0")}`,
      userId: user.id,
      programId,
      size,
      platform,
      ruleSetId,
      listPrice: price,
      discount: 0,
      total: price,
      status: "paid_demo",
      createdAt,
      billing: { name: user.name, country: user.country, city: user.country === "TR" ? "İstanbul" : "Manila" },
      paymentMethod: "card_demo",
      challengeId: ch.id,
    });
    this.notify(user.id, "order_confirmed", { orderId, programId, size: String(size), total: String(price) }, createdAt);
    return ch;
  }

  account(ch: Challenge, id: string, phaseIndex: number, startedAt: number, status: Account["status"], platform: PlatformId): Account {
    const kind: PhaseKind = ch.ruleSnapshot.phases[phaseIndex].kind;
    const acc: Account = {
      id,
      userId: ch.userId,
      challengeId: ch.id,
      programId: ch.programId,
      kind,
      phaseIndex,
      size: ch.size,
      currency: "USD",
      platform,
      login: String(5_000_000 + Number(id.slice(4))),
      server: platform === "mt5" ? "ALPAS-Demo-MT5 (simulated)" : "ALPAS-Demo-cT (simulated)",
      status,
      createdAt: startedAt,
      startedAt,
    };
    this.s.accounts.push(acc);
    ch.accountIds.push(id);
    return acc;
  }

  /** One session per day key with the given net P&L (cents). Returns the trades. */
  days(acc: Account, keys: string[], nets: Cents[], riskBps: number): Trade[] {
    const out: Trade[] = [];
    const ch = this.s.challenges.find((c) => c.id === acc.challengeId)!;
    const daily = applyBps(acc.size, ch.ruleSnapshot.phases[acc.phaseIndex].dailyLossBps);
    keys.forEach((key, i) => {
      const start = tradingDayStart(key, TZ, RH);
      const rng = createRng(hashSeed(acc.id, key));
      out.push(
        ...generateSession({
          accountId: acc.id,
          size: acc.size,
          startTs: start + 15 * HOUR_MS + rng.int(0, 40) * 60_000,
          endTs: start + 21 * HOUR_MS + rng.int(0, 40) * 60_000,
          targetNet: nets[i],
          trades: rng.int(2, 4),
          riskBps,
          nextId: this.nextTradeId,
          rng,
          maxAdverse: Math.floor(daily * 0.7),
        }),
      );
    });
    this.s.trades.push(...out);
    return out;
  }

  lastClose(accId: string) {
    return Math.max(...this.s.trades.filter((t) => t.accountId === accId).map((t) => t.closeTime ?? t.openTime));
  }

  notify(userId: string, kind: DemoState["notifications"][number]["kind"], params: Record<string, string>, ts: number, read = true) {
    this.s.notifications.push({ id: `N-${++this.s.counters.misc}`, userId, ts, kind, params, read, email: true });
  }

  audit(action: string, entity: string, entityId: string, ts: number, role: "ops" | "system" | "trader" = "system", reason?: string) {
    this.s.audit.push({ id: `AUD-${++this.s.counters.misc}`, ts, actor: { role, id: role === "ops" ? "ops.demo" : role }, action, entity, entityId, reason });
  }

  cert(type: CertificateType, seq: number, data: Omit<Certificate, "id" | "type" | "verificationCode" | "status" | "specimen">): Certificate {
    const id = certificateId(type, data.issuedAt, seq);
    const c: Certificate = { ...data, id, type, verificationCode: verificationCode(id, seq), status: "valid", specimen: true };
    this.s.certificates.push(c);
    this.s.counters.cert = Math.max(this.s.counters.cert, seq);
    return c;
  }
}

/** Pick `n` keys from `keys`, skipping the given offsets — keeps gaps realistic. */
const pickKeys = (keys: string[], idx: number[]) => idx.map((i) => keys[i]);

export function createSeedState(realNow: number): DemoState {
  const s = emptyState(realNow);
  const anchor = demoAnchor(realNow);
  s.clockOffsetMs = anchor - realNow;
  const b = new SeedBuilder(s);
  const K0 = tradingDayKey(anchor, TZ, RH);
  const todayStart = tradingDayStart(K0, TZ, RH);
  const keys = previousTradingDayKeys(K0, 72); // oldest first, keys[71] = previous trading day
  const back = (n: number) => keys[keys.length - n]; // back(1) = yesterday's session

  const defne = b.user(DEMO_USERS.defne, "TR", tradingDayStart(keys[0], TZ, RH) - 20 * DAY_MS, "Defne Yıldırım");
  const jonah = b.user(DEMO_USERS.jonah, "PH", tradingDayStart(keys[0], TZ, RH) - 40 * DAY_MS, "Jonah Reyes");

  /* S5 — funded account on rule set v1.0, one paid payout, eligible again. */
  {
    const k = keys;
    const created = tradingDayStart(k[0], TZ, RH) + 2 * HOUR_MS;
    const ch = b.challenge(defne, "ascent", usd(100_000), "ascent@1.0", created, "mt5");
    const p1 = b.account(ch, "ATC-103018", 0, created + 10 * 60_000, "passed", "mt5");
    b.days(p1, pickKeys(k, [1, 2, 3, 5, 6, 7]), [210000, -60000, 180000, 145000, 205000, 160000], 90);
    p1.closedAt = b.lastClose(p1.id) + 5 * 60_000;
    b.notify(defne.id, "phase_passed", { accountId: p1.id, nextAccountId: "ATC-103264" }, p1.closedAt);
    const p2 = b.account(ch, "ATC-103264", 1, p1.closedAt, "passed", "mt5");
    b.days(p2, pickKeys(k, [9, 10, 11, 13, 14, 15]), [130000, 90000, 115000, -40000, 125000, 100000], 90);
    p2.closedAt = b.lastClose(p2.id) + 5 * 60_000;
    const approvedAt = tradingDayStart(k[17], TZ, RH) + 18 * HOUR_MS;
    s.reviews.push({ id: "RV-9001", challengeId: ch.id, accountId: p2.id, openedAt: p2.closedAt, status: "approved", decidedAt: approvedAt, decidedBy: "ops.demo", reason: "Objectives verified, no rule flags." });
    ch.status = "passed";
    ch.passedAt = approvedAt;
    b.audit("review.approved", "challenge", ch.id, approvedAt, "ops", "Objectives verified, no rule flags.");
    b.notify(defne.id, "challenge_approved", { challengeId: ch.id, accountId: p2.id }, approvedAt);
    const revoked = b.cert("challenge_passed", 40, {
      userId: defne.id, traderName: "Defne Yildirim", programId: "ascent", accountRef: maskAccount(p2.id), challengeId: ch.id,
      amount: ch.size, amountKind: "nominal_size", issuedAt: approvedAt, sourceId: ch.id,
    });
    const cp = b.cert("challenge_passed", 41, {
      userId: defne.id, traderName: "Defne Yıldırım", programId: "ascent", accountRef: maskAccount(p2.id), challengeId: ch.id,
      amount: ch.size, amountKind: "nominal_size", issuedAt: approvedAt + 3 * HOUR_MS, sourceId: ch.id,
    });
    revoked.status = "revoked";
    revoked.revokedAt = cp.issuedAt;
    revoked.revokedReason = `Reissued with corrected name spelling as ${cp.id}.`;
    b.audit("certificate.revoked", "certificate", revoked.id, cp.issuedAt, "ops", revoked.revokedReason);
    const signedAt = tradingDayStart(k[19], TZ, RH) + 17 * HOUR_MS;
    ch.contract = { status: "signed", signedAt, signerName: "Defne Yıldırım", version: CONTRACT_VERSION };
    const funded = b.account(ch, SCENARIO_ACCOUNTS.funded, 2, signedAt + 60_000, "active", "mt5");
    ch.status = "funded";
    ch.fundedAccountId = funded.id;
    b.audit("funded.activated", "account", funded.id, funded.startedAt);
    b.notify(defne.id, "funded_activated", { accountId: funded.id }, funded.startedAt);
    b.cert("funded_trader", 42, {
      userId: defne.id, traderName: "Defne Yıldırım", programId: "ascent", accountRef: maskAccount(funded.id), challengeId: ch.id,
      amount: ch.size, amountKind: "nominal_size", issuedAt: funded.startedAt, sourceId: funded.id,
    });
    b.days(funded, pickKeys(k, [20, 21, 23, 24, 26, 27, 29, 31, 33, 35]), [80000, -30000, 95000, 60000, 75000, -25000, 110000, 70000, 85000, 100000], 80);
    // Payout #1 — full lifecycle to Paid.
    const reqAt = tradingDayStart(k[38], TZ, RH) + 16 * HOUR_MS;
    const order = s.orders.find((o) => o.id === ch.orderId)!;
    const q = quotePayout(usd(6_000), ch.ruleSnapshot.payout.profitSplitBps, order.total);
    const t = (d: number) => reqAt + d;
    const paidAt = t(4 * DAY_MS + 2 * HOUR_MS);
    s.payouts.push({
      id: "PO-00001", userId: defne.id, accountId: funded.id, challengeId: ch.id, requestedAt: reqAt,
      gross: q.gross, splitBps: q.splitBps, traderShare: q.traderShare, companyShare: q.companyShare, feeRefund: q.feeRefund,
      processingFee: 0, netToTrader: q.netToTrader, method: "bank_transfer_demo", methodLabel: "IBAN •••• 0000 (demo)",
      status: "paid",
      timeline: [
        { status: "requested", at: reqAt, actor: "trader" },
        { status: "under_review", at: t(20 * HOUR_MS), actor: "ops" },
        { status: "approved", at: t(DAY_MS + 22 * HOUR_MS), actor: "ops", note: "Cycle checks passed." },
        { status: "processing", at: t(2 * DAY_MS + 20 * HOUR_MS), actor: "ops" },
        { status: "paid", at: paidAt, actor: "ops", note: "Demo payment marked as paid. No funds moved." },
      ],
      receiptNo: "RCPT-DEMO-00001",
      certificateId: undefined,
    });
    s.counters.payout = 1;
    ch.feeRefunded = true;
    s.ledger.push({ id: "L-9001", accountId: funded.id, ts: reqAt, type: "payout_reserve", amount: q.gross, payoutId: "PO-00001" });
    s.ledger.push({ id: "L-9002", accountId: funded.id, ts: paidAt, type: "payout_paid", amount: q.gross, payoutId: "PO-00001" });
    const po = b.cert("payout", 43, {
      userId: defne.id, traderName: "Defne Yıldırım", programId: "ascent", accountRef: maskAccount(funded.id), challengeId: ch.id,
      amount: q.netToTrader, amountKind: "payout_amount", issuedAt: paidAt, sourceId: "PO-00001",
    });
    s.payouts[0].certificateId = po.id;
    b.notify(defne.id, "payout_status", { payoutId: "PO-00001", status: "paid" }, paidAt);
    b.notify(defne.id, "certificate_issued", { certificateId: po.id, type: "payout" }, paidAt);
    // Cycle 2 — eligible now.
    b.days(funded, pickKeys(k, [52, 54, 56, 57, 59, 62, 64, 67, 70]), [52000, -21000, 61000, 38000, 47000, -18000, 70000, 44000, 112000], 80);
  }

  /* S4 — two-step, phase 1 passed, phase 2 objectives met, under review. */
  {
    const k = keys.slice(52);
    const created = tradingDayStart(k[0], TZ, RH) + 3 * HOUR_MS;
    const ch = b.challenge(defne, "ascent", usd(50_000), "ascent@1.1", created, "ctrader");
    const p1 = b.account(ch, "ATC-104120", 0, created + 5 * 60_000, "passed", "ctrader");
    b.days(p1, pickKeys(k, [0, 1, 2, 4, 5]), [110000, 90000, -35000, 125000, 140000], 90);
    p1.closedAt = b.lastClose(p1.id) + 5 * 60_000;
    b.notify(defne.id, "phase_passed", { accountId: p1.id, nextAccountId: SCENARIO_ACCOUNTS.underReview }, p1.closedAt);
    const p2 = b.account(ch, SCENARIO_ACCOUNTS.underReview, 1, p1.closedAt, "under_review", "ctrader");
    b.days(p2, pickKeys(k, [7, 8, 10, 11, 12]), [82000, 45000, -20000, 76000, 93000], 90);
    p2.closedAt = b.lastClose(p2.id) + 5 * 60_000;
    ch.status = "under_review";
    s.reviews.unshift({ id: "RV-9002", challengeId: ch.id, accountId: p2.id, openedAt: p2.closedAt, status: "open" });
    b.audit("review.opened", "account", p2.id, p2.closedAt);
    b.notify(defne.id, "review_started", { accountId: p2.id }, p2.closedAt, false);
  }

  /* S2 — in progress, phase 1. */
  {
    const k = keys.slice(-9);
    const created = tradingDayStart(k[0], TZ, RH) + 20 * HOUR_MS;
    const ch = b.challenge(defne, "ascent", usd(100_000), "ascent@1.1", created, "mt5");
    const acc = b.account(ch, SCENARIO_ACCOUNTS.inProgress, 0, created + 5 * 60_000, "active", "mt5");
    const tr = b.days(acc, pickKeys(k, [1, 2, 3, 5, 6, 8]), [125000, -48000, 183000, 62000, -31000, 139000], 90);
    const now = tr[0].closeTime!;
    s.journal.push(
      { id: "J-9001", userId: defne.id, accountId: acc.id, tradeId: tr[0].id, note: "Waited for the London open retest before entering. Sized down after the first loss.", tags: ["plan-followed", "london"], createdAt: now, updatedAt: now },
      { id: "J-9002", userId: defne.id, accountId: acc.id, dayKey: k[3], note: "Best session so far; no trades in the last hour before the reset.", tags: ["review"], createdAt: now + DAY_MS, updatedAt: now + DAY_MS },
    );
  }

  /* S3 — one-step close to the daily loss limit (open position). */
  {
    const k = keys.slice(-5);
    const created = tradingDayStart(k[0], TZ, RH) + 18 * HOUR_MS;
    const ch = b.challenge(defne, "ridge", usd(50_000), "ridge@1.0", created, "mt5");
    const acc = b.account(ch, SCENARIO_ACCOUNTS.nearLimit, 0, created + 5 * 60_000, "active", "mt5");
    b.days(acc, pickKeys(k, [1, 2, 3, 4]), [62000, 41000, -38000, 54000], 70);
    const rng = createRng(hashSeed(acc.id, "today"));
    const today = generateSession({
      accountId: acc.id, size: acc.size, startTs: todayStart + 14 * HOUR_MS, endTs: anchor - 100 * 60_000,
      targetNet: -31000, trades: 1, riskBps: 70, nextId: b.nextTradeId, rng, maxAdverse: 60000,
    });
    s.trades.push(...today);
    let open = openPositionTrade({ accountId: acc.id, ts: anchor - 70 * 60_000, size: acc.size, riskBps: 199, nextId: b.nextTradeId, rng, symbol: "XAUUSD" });
    open = moveMark(open, -97500 - open.commission - open.grossPnl);
    s.trades.push(open);
    b.notify(defne.id, "daily_limit_warning", { accountId: acc.id, day: K0, remaining: "0" }, anchor - 20 * 60_000, false);
  }

  /* S6 — breached by the daily loss limit. */
  {
    const k = keys.slice(-7);
    const created = tradingDayStart(k[0], TZ, RH) + 19 * HOUR_MS;
    const ch = b.challenge(defne, "ridge", usd(25_000), "ridge@1.0", created, "ctrader");
    const acc = b.account(ch, SCENARIO_ACCOUNTS.breached, 0, created + 5 * 60_000, "active", "ctrader");
    b.days(acc, pickKeys(k, [1, 2, 3]), [31000, -18000, 22000], 70);
    const dayStart = tradingDayStart(k[4], TZ, RH);
    const rng = createRng(hashSeed(acc.id, "breach"));
    const loss = generateSession({
      accountId: acc.id, size: acc.size, startTs: dayStart + 15 * HOUR_MS, endTs: dayStart + 16 * HOUR_MS,
      targetNet: -29000, trades: 1, riskBps: 70, nextId: b.nextTradeId, rng, maxAdverse: 40000,
    });
    s.trades.push(...loss);
    const breachTrade = generateBreachTrade({ accountId: acc.id, ts: dayStart + 17 * HOUR_MS, lossGross: 48500, nextId: b.nextTradeId, rng });
    s.trades.push(breachTrade);
    const ev = evaluateAccount(s, acc.id, breachTrade.closeTime! + 60_000);
    acc.status = "breached";
    acc.breach = ev.breach ?? undefined;
    acc.closedAt = breachTrade.closeTime;
    ch.status = "failed";
    b.audit("account.breached", "account", acc.id, ev.breach?.at ?? breachTrade.closeTime!, "system", ev.breach?.type);
    b.notify(defne.id, "breach", { accountId: acc.id, type: ev.breach?.type ?? "daily_loss" }, ev.breach?.at ?? breachTrade.closeTime!);
  }

  /* S1 — brand new account, not started. */
  {
    const created = anchor - 3 * HOUR_MS;
    const ch = b.challenge(defne, "ascent", usd(25_000), "ascent@1.1", created, "mt5");
    b.account(ch, SCENARIO_ACCOUNTS.newAccount, 0, created + 60_000, "ready", "mt5");
  }

  /* Another trader — used to prove the Assistant and services cannot cross accounts. */
  {
    const k = keys;
    const created = tradingDayStart(k[10], TZ, RH);
    const ch = b.challenge(jonah, "ridge", usd(100_000), "ridge@1.0", created, "ctrader");
    const ev = b.account(ch, "ATC-206950", 0, created + 60_000, "passed", "ctrader");
    b.days(ev, pickKeys(k, [11, 12, 14, 15, 17, 18]), [190000, 160000, 210000, 140000, 180000, 170000], 70);
    ev.closedAt = b.lastClose(ev.id) + 5 * 60_000;
    ch.status = "funded";
    ch.passedAt = ev.closedAt + DAY_MS;
    s.reviews.push({ id: "RV-9003", challengeId: ch.id, accountId: ev.id, openedAt: ev.closedAt, status: "approved", decidedAt: ch.passedAt, decidedBy: "ops.demo" });
    ch.contract = { status: "signed", signedAt: ch.passedAt + DAY_MS, signerName: "Jonah Reyes", version: CONTRACT_VERSION };
    const f = b.account(ch, SCENARIO_ACCOUNTS.otherUserFunded, 1, ch.passedAt + DAY_MS + 60_000, "active", "ctrader");
    ch.fundedAccountId = f.id;
    b.cert("funded_trader", 39, {
      userId: jonah.id, traderName: "Jonah Reyes", programId: "ridge", accountRef: maskAccount(f.id), challengeId: ch.id,
      amount: ch.size, amountKind: "nominal_size", issuedAt: f.startedAt, sourceId: f.id,
    });
    b.days(f, pickKeys(k, [24, 26, 28, 30, 33, 36, 40, 44, 50, 60, 66, 70]), [90000, 60000, -40000, 120000, 80000, 50000, -30000, 70000, 90000, 60000, 40000, 50000], 70);
  }

  s.tickets.push({
    id: "SUP-00001",
    userId: defne.id,
    subject: "When does the daily loss limit reset?",
    category: "rules",
    status: "answered",
    createdAt: anchor - 6 * DAY_MS,
    source: "dashboard",
    messages: [
      { from: "trader", at: anchor - 6 * DAY_MS, body: "Is the reset at midnight in my time zone?" },
      { from: "ops", at: anchor - 6 * DAY_MS + 3 * HOUR_MS, body: "It resets at 17:00 New York time (America/New_York), which is 00:00 or 01:00 in Istanbul depending on US daylight saving time. Rules center → Daily reset has a worked example." },
    ],
  });

  s.notifications.sort((a, b2) => b2.ts - a.ts);
  s.audit.sort((a, b2) => b2.ts - a.ts);
  s.counters.misc += 100;
  return s;
}
