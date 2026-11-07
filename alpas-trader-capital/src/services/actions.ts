/**
 * Demo service layer. Every state change in the prototype goes through these
 * pure functions: (draft state, actor, input, now) → result. They mutate the
 * draft passed in (callers clone first) and enforce the same checks a real
 * backend would enforce server-side (ownership, role, state transitions).
 */
import {
  CONTRACT_VERSION,
  DEFAULT_CUSTOM_SIZING,
  PAYOUT_METHODS,
  RESTRICTED_COUNTRIES,
  SYMBOLS,
  findPromo,
} from "@/domain/catalog";
import {
  certificateId,
  challengePassedBlockers,
  fnv1a,
  fundedBlockers,
  maskAccount,
  payoutBlockers,
  verificationCode,
} from "@/domain/certificates";
import type { L10n, Locale } from "@/domain/l10n";
import { applyBps, type Cents } from "@/domain/money";
import {
  canTransition,
  payoutEligibility,
  quotePayout,
  validatePayoutRequest,
  type PayoutEligibility,
} from "@/domain/payout";
import { promoBpsFor, quoteSize } from "@/domain/pricing";
import { tradeNet } from "@/domain/risk";
import {
  DAY_MS,
  HOUR_MS,
  isMarketOpen,
  isWeekdayKey,
  nextResetAfter,
  resetsBetween,
  tradingDayKey,
  tradingDayStart,
  weekdayOfKey,
} from "@/domain/time";
import type {
  Account,
  AuditEntry,
  Certificate,
  CertificateType,
  Challenge,
  NotificationKind,
  Payout,
  PayoutStatus,
  PlatformId,
  ProgramId,
  RuleSet,
  SupportTicket,
  Trade,
} from "@/domain/types";
import { createRng, hashSeed } from "./rng";
import { closeAtMark, generateBreachTrade, generateSession, moveMark, openPositionTrade } from "./simulate";
import {
  evaluateAccount,
  getAccount,
  getChallenge,
  getUser,
  orderOf,
  type CartSelection,
  type CustomArticle,
  type DemoState,
} from "./state";

export type Actor = { role: "trader" | "ops" | "system"; id: string };
export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; params?: Record<string, string | number> };

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string, params?: Record<string, string | number>): Result<never> => ({
  ok: false,
  error,
  params,
});

export const SYSTEM: Actor = { role: "system", id: "system" };

/* ───────────── helpers ───────────── */

function next(s: DemoState, kind: keyof DemoState["counters"]): number {
  s.counters[kind] += 1;
  return s.counters[kind];
}

export function audit(
  s: DemoState,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  now: number,
  reason?: string,
  details?: AuditEntry["details"],
) {
  s.audit.unshift({ id: `AUD-${next(s, "misc")}`, ts: now, actor, action, entity, entityId, reason, details });
}

export function notify(
  s: DemoState,
  userId: string,
  kind: NotificationKind,
  params: Record<string, string>,
  now: number,
  email = true,
) {
  s.notifications.unshift({ id: `N-${next(s, "misc")}`, userId, ts: now, kind, params, read: false, email });
}

const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export const demoHash = (pw: string) => `demo$${fnv1a(`alpas|${pw}`).toString(16)}`;

function requireTrader(s: DemoState, actor: Actor) {
  if (actor.role !== "trader") return null;
  return getUser(s, actor.id);
}

function ownedAccount(s: DemoState, actor: Actor, accountId: string) {
  const a = getAccount(s, accountId);
  if (!a) return null;
  if (actor.role === "ops" || actor.role === "system") return a;
  return a.userId === actor.id ? a : null;
}

function newAccountId(s: DemoState) {
  return `ATC-${next(s, "account")}`;
}

function makeAccount(
  s: DemoState,
  challenge: Challenge,
  phaseIndex: number,
  status: Account["status"],
  now: number,
  platform: PlatformId,
): Account {
  const id = newAccountId(s);
  const phase = challenge.ruleSnapshot.phases[phaseIndex];
  const account: Account = {
    id,
    userId: challenge.userId,
    challengeId: challenge.id,
    programId: challenge.programId,
    kind: phase.kind,
    phaseIndex,
    size: challenge.size,
    currency: "USD",
    platform,
    login: String(5_100_000 + s.counters.account),
    server: platform === "mt5" ? "ALPAS-Demo-MT5 (simulated)" : "ALPAS-Demo-cT (simulated)",
    status,
    createdAt: now,
    startedAt: now,
  };
  s.accounts.push(account);
  challenge.accountIds.push(id);
  return account;
}

function traderNameFor(s: DemoState, userId: string) {
  const u = getUser(s, userId)!;
  return u.kyc.status === "verified" && u.kyc.legalName ? u.kyc.legalName : u.name;
}

export function issueCertificate(
  s: DemoState,
  type: CertificateType,
  data: Omit<Certificate, "id" | "type" | "verificationCode" | "status" | "issuedAt" | "specimen">,
  now: number,
): Certificate {
  const id = certificateId(type, now, next(s, "cert"));
  const cert: Certificate = {
    ...data,
    id,
    type,
    issuedAt: now,
    verificationCode: verificationCode(id, now),
    status: "valid",
    specimen: true,
  };
  s.certificates.unshift(cert);
  audit(s, SYSTEM, "certificate.issued", "certificate", id, now, undefined, { type, source: data.sourceId });
  notify(s, data.userId, "certificate_issued", { certificateId: id, type }, now);
  return cert;
}

/* ───────────── cart / auth / profile ───────────── */

export function setCart(s: DemoState, cart: CartSelection | null): Result {
  s.cart = cart;
  return ok(undefined);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function registerUser(
  s: DemoState,
  input: { name: string; email: string; password: string; country: string; locale: Locale; acceptTerms: boolean },
  now: number,
): Result<{ userId: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) return fail("name_required");
  if (!EMAIL_RE.test(email)) return fail("email_invalid");
  if (input.password.length < 8) return fail("password_short");
  if (!input.acceptTerms) return fail("terms_required");
  if (s.users.some((u) => u.email === email)) return fail("email_taken");
  const id = `U-${next(s, "misc")}`;
  s.users.push({
    id,
    name,
    email,
    country: input.country,
    locale: input.locale,
    createdAt: now,
    passwordHash: demoHash(input.password),
    kyc: { status: "not_started" },
    twoFactorEnabled: false,
    marketingOptIn: false,
  });
  s.session = { userId: id, role: "trader" };
  audit(s, { role: "trader", id }, "user.registered", "user", id, now);
  return ok({ userId: id });
}

export function loginUser(s: DemoState, input: { email: string; password: string }, now: number): Result<{ userId: string }> {
  const u = s.users.find((x) => x.email === input.email.trim().toLowerCase());
  if (!u || u.passwordHash !== demoHash(input.password)) return fail("invalid_credentials");
  s.session = { userId: u.id, role: "trader" };
  audit(s, { role: "trader", id: u.id }, "user.login", "user", u.id, now);
  return ok({ userId: u.id });
}

export function logout(s: DemoState): Result {
  s.session = { userId: null, role: "trader" };
  return ok(undefined);
}

export function requestPasswordReset(s: DemoState, email: string, now: number): Result<{ token: string | null }> {
  const u = s.users.find((x) => x.email === email.trim().toLowerCase());
  if (!u) return ok({ token: null });
  const token = `rst-${fnv1a(`${u.id}|${now}`).toString(36)}`;
  s.resetTokens = s.resetTokens.filter((t) => t.userId !== u.id);
  s.resetTokens.push({ token, userId: u.id, expiresAt: now + HOUR_MS });
  return ok({ token });
}

export function resetPassword(s: DemoState, token: string, password: string, now: number): Result {
  const entry = s.resetTokens.find((t) => t.token === token);
  if (!entry || entry.expiresAt < now) return fail("token_invalid");
  if (password.length < 8) return fail("password_short");
  const u = getUser(s, entry.userId)!;
  u.passwordHash = demoHash(password);
  s.resetTokens = s.resetTokens.filter((t) => t.token !== token);
  audit(s, { role: "trader", id: u.id }, "user.password_reset", "user", u.id, now);
  return ok(undefined);
}

export function changePassword(s: DemoState, actor: Actor, current: string, nextPw: string, now: number): Result {
  const u = requireTrader(s, actor);
  if (!u) return fail("forbidden");
  if (u.passwordHash !== demoHash(current)) return fail("password_wrong");
  if (nextPw.length < 8) return fail("password_short");
  u.passwordHash = demoHash(nextPw);
  audit(s, actor, "user.password_changed", "user", u.id, now);
  return ok(undefined);
}

export function updateProfile(
  s: DemoState,
  actor: Actor,
  input: { name: string; country: string; marketingOptIn: boolean; twoFactorEnabled: boolean; locale: Locale },
  now: number,
): Result {
  const u = requireTrader(s, actor);
  if (!u) return fail("forbidden");
  if (input.name.trim().length < 2) return fail("name_required");
  u.name = input.name.trim();
  u.country = input.country;
  u.marketingOptIn = input.marketingOptIn;
  u.locale = input.locale;
  if (u.twoFactorEnabled !== input.twoFactorEnabled) audit(s, actor, "user.2fa_toggled_demo", "user", u.id, now);
  u.twoFactorEnabled = input.twoFactorEnabled;
  return ok(undefined);
}

export function setDemoRole(s: DemoState, role: "trader" | "ops", now: number): Result {
  s.session.role = role;
  audit(s, { role: "system", id: "demo" }, "demo.role_switch", "session", role, now);
  return ok(undefined);
}

/* ───────────── purchase ───────────── */

export interface PurchaseInput {
  programId: ProgramId;
  size: number;
  platform: PlatformId;
  promoCode?: string;
  billing: { name: string; country: string; city?: string; address?: string };
  paymentMethod: "card_demo" | "bank_demo";
  acceptTerms: boolean;
  acceptRisk: boolean;
}

export function quoteOrder(s: DemoState, programId: ProgramId, size: number, promoCode: string | undefined, now: number) {
  const stored = s.catalog.programs.find((p) => p.id === programId);
  if (!stored) return fail("product_unavailable");
  const program = withCustomSizing(stored);
  const q = quoteSize(program, size);
  if ("error" in q) return fail(q.error);
  let discount = 0;
  let promo = null;
  let promoBps = 0;
  if (promoCode && promoCode.trim()) {
    const r = findPromo(promoCode, programId, isoDay(now), s.catalog.promos);
    if (!r.ok) return fail(r.error);
    promo = r.promo;
    promoBps = promoBpsFor(program, r.promo, q.custom);
    discount = applyBps(q.price, promoBps);
  }
  return ok({ program, listPrice: q.price, discount, total: q.price - discount, promo, promoBps, custom: q.custom, betterStandard: q.betterStandard });
}

/** Older stored catalogs (before custom sizing) get the default custom policy. */
export function withCustomSizing<T extends { sizes: { size: number }[]; customSizing?: unknown }>(p: T): T & { customSizing: import("@/domain/types").CustomSizing } {
  if (p.customSizing) return p as T & { customSizing: import("@/domain/types").CustomSizing };
  const sizes = p.sizes.map((x) => x.size);
  return { ...p, customSizing: { minSize: Math.min(...sizes), maxSize: Math.max(...sizes), ...DEFAULT_CUSTOM_SIZING } };
}

export function purchaseChallenge(
  s: DemoState,
  actor: Actor,
  input: PurchaseInput,
  now: number,
): Result<{ orderId: string; challengeId: string; accountId: string }> {
  const user = requireTrader(s, actor);
  if (!user) return fail("auth_required");
  if (!input.acceptTerms || !input.acceptRisk) return fail("terms_required");
  if (input.billing.name.trim().length < 2) return fail("name_required");
  if (RESTRICTED_COUNTRIES.includes(input.billing.country)) return fail("country_restricted");
  const q = quoteOrder(s, input.programId, input.size, input.promoCode, now);
  if (!q.ok) return q;
  const { program, listPrice, discount, total } = q.value;
  if (!program.platforms.includes(input.platform)) return fail("platform_unavailable");
  const ruleSet = s.catalog.ruleSets.find((r) => r.id === program.currentRuleSetId);
  if (!ruleSet) return fail("product_unavailable");

  const seq = next(s, "order");
  const orderId = `ORD-${String(new Date(now).getUTCFullYear()).slice(2)}-${String(seq).padStart(5, "0")}`;
  const challengeId = `CH-${seq}`;
  const challenge: Challenge = {
    id: challengeId,
    userId: user.id,
    orderId,
    programId: program.id,
    size: input.size,
    ruleSetId: ruleSet.id,
    ruleSnapshot: structuredClone(ruleSet),
    status: "in_progress",
    accountIds: [],
    createdAt: now,
    contract: { status: "not_available" },
    feeRefunded: false,
  };
  s.challenges.push(challenge);
  s.orders.unshift({
    id: orderId,
    invoiceNo: `ALP-DEMO-${String(new Date(now).getUTCFullYear())}-${String(seq).padStart(5, "0")}`,
    userId: user.id,
    programId: program.id,
    size: input.size,
    platform: input.platform,
    ruleSetId: ruleSet.id,
    listPrice,
    discount,
    total,
    promoCode: q.value.promo?.code,
    custom: q.value.custom || undefined,
    status: "paid_demo",
    createdAt: now,
    billing: { ...input.billing, name: input.billing.name.trim() },
    paymentMethod: input.paymentMethod,
    challengeId,
  });
  const account = makeAccount(s, challenge, 0, "ready", now, input.platform);
  s.cart = null;
  notify(s, user.id, "order_confirmed", { orderId, accountId: account.id, programId: program.id, size: String(input.size), total: String(total) }, now);
  audit(s, actor, "order.created_demo", "order", orderId, now, undefined, { total, ruleSet: ruleSet.id, custom: q.value.custom });
  return ok({ orderId, challengeId, accountId: account.id });
}

/* ───────────── lifecycle sync ───────────── */

/** Re-evaluate an account and apply automatic transitions (breach, phase completion). */
export function syncAccount(s: DemoState, accountId: string, now: number): void {
  const account = getAccount(s, accountId);
  if (!account || !["ready", "active"].includes(account.status)) return;
  const challenge = getChallenge(s, account.challengeId)!;
  const ev = evaluateAccount(s, accountId, now);
  const hasTrades = s.trades.some((t) => t.accountId === accountId);

  if (ev.breach) {
    const at = Math.min(now, Math.max(ev.breach.at, account.startedAt));
    for (const t of s.trades) {
      if (t.accountId === accountId && t.status === "open") Object.assign(t, closeAtMark(t, at, "breach"));
    }
    account.status = ev.breach.type === "inactivity" ? "expired" : "breached";
    account.breach = ev.breach;
    account.closedAt = Math.max(at, ...s.trades.filter((t) => t.accountId === accountId).map((t) => t.closeTime ?? 0));
    if (account.kind !== "funded") challenge.status = "failed";
    notify(s, account.userId, "breach", { accountId, type: ev.breach.type }, now);
    audit(s, SYSTEM, "account.breached", "account", accountId, now, ev.breach.type, {
      equity: ev.breach.equity,
      limit: ev.breach.limit,
    });
    return;
  }

  if (account.status === "ready" && hasTrades) account.status = "active";

  if (account.kind !== "funded" && account.status === "active" && ev.completion.ready) {
    const isFinal = challenge.ruleSnapshot.phases[account.phaseIndex + 1]?.kind === "funded";
    account.closedAt = now;
    if (!isFinal) {
      account.status = "passed";
      const nextAcc = makeAccount(s, challenge, account.phaseIndex + 1, "ready", now, account.platform);
      notify(s, account.userId, "phase_passed", { accountId, nextAccountId: nextAcc.id }, now);
      audit(s, SYSTEM, "phase.passed", "account", accountId, now, undefined, { next: nextAcc.id });
    } else {
      account.status = "under_review";
      challenge.status = "under_review";
      s.reviews.unshift({
        id: `RV-${next(s, "misc")}`,
        challengeId: challenge.id,
        accountId,
        openedAt: now,
        status: "open",
      });
      notify(s, account.userId, "review_started", { accountId }, now);
      audit(s, SYSTEM, "review.opened", "account", accountId, now);
    }
    return;
  }

  if (account.status === "active" && ev.dailyRemaining <= ev.dailyLossAmount * 0.2) {
    const already = s.notifications.some(
      (n) => n.kind === "daily_limit_warning" && n.params.accountId === accountId && n.params.day === ev.dayKey,
    );
    if (!already)
      notify(s, account.userId, "daily_limit_warning", { accountId, day: ev.dayKey, remaining: String(ev.dailyRemaining) }, now, false);
  }
}

export function syncAll(s: DemoState, now: number) {
  for (const a of s.accounts) if (a.status === "ready" || a.status === "active") syncAccount(s, a.id, now);
}

/* ───────────── demo simulation tools ───────────── */

function ensureMarketOpen(s: DemoState, rs: RuleSet, now: number): number {
  let t = now;
  let guard = 0;
  while (!isMarketOpen(t, rs.timezone, rs.dailyResetHour) && guard < 10) {
    t = nextResetAfter(t, rs.timezone, rs.dailyResetHour) + 90 * 60_000;
    guard++;
  }
  if (t !== now) s.clockOffsetMs += t - now;
  return t;
}

function moveClock(s: DemoState, from: number, to: number) {
  // Accrue swap on open positions and enforce weekend closing where required.
  for (const t of s.trades) {
    if (t.status !== "open") continue;
    const acc = getAccount(s, t.accountId);
    if (!acc) continue;
    const ch = getChallenge(s, acc.challengeId)!;
    const rs = ch.ruleSnapshot;
    const phase = rs.phases[acc.phaseIndex];
    const resets = resetsBetween(from, to, rs.timezone, rs.dailyResetHour);
    for (const r of resets) {
      const closingDay = tradingDayKey(r - 1, rs.timezone, rs.dailyResetHour);
      if (!phase.weekendHolding && weekdayOfKey(closingDay) === 5) {
        Object.assign(t, closeAtMark(t, r - 10 * 60_000, "weekend"));
        break;
      }
      if (isWeekdayKey(closingDay)) t.swap += Math.round(SYMBOLS[t.symbol].swapPerLotNight * t.volume);
    }
  }
  s.clockOffsetMs += to - from;
}

export function demoAdvanceClock(s: DemoState, ms: number, now: number): Result<{ now: number }> {
  if (ms <= 0 || ms > 60 * DAY_MS) return fail("invalid_amount");
  const to = now + ms;
  moveClock(s, now, to);
  syncAll(s, to);
  audit(s, { role: "system", id: "demo" }, "demo.clock_advanced", "clock", String(ms), to);
  return ok({ now: to });
}

function tradeWindowStart(s: DemoState, account: Account, rs: RuleSet, now: number) {
  const dayStart = tradingDayStart(tradingDayKey(now, rs.timezone, rs.dailyResetHour), rs.timezone, rs.dailyResetHour);
  const last = s.trades
    .filter((t) => t.accountId === account.id)
    .reduce((m, t) => Math.max(m, t.closeTime ?? t.openTime), 0);
  return Math.max(dayStart, account.startedAt, last + 60_000);
}

export type SessionMode = "profit" | "loss" | "mixed" | "breach";

export function demoSimulateSession(
  s: DemoState,
  actor: Actor,
  accountId: string,
  mode: SessionMode,
  now: number,
): Result<{ now: number; trades: number }> {
  const account = ownedAccount(s, actor, accountId);
  if (!account) return fail("not_found");
  if (!["ready", "active"].includes(account.status)) return fail("account_frozen");
  const { ruleSnapshot: rs } = getChallenge(s, account.challengeId)!;
  const phase = rs.phases[account.phaseIndex];
  let t = ensureMarketOpen(s, rs, now);
  if (s.trades.some((x) => x.accountId === accountId && x.status === "open")) return fail("close_positions_first");
  let start = tradeWindowStart(s, account, rs, t);
  if (t - start < 25 * 60_000) {
    const to = t + 2 * HOUR_MS;
    moveClock(s, t, to);
    t = ensureMarketOpen(s, rs, to);
    start = tradeWindowStart(s, account, rs, t);
  }
  const ev = evaluateAccount(s, accountId, t);
  const rng = createRng(hashSeed(accountId, t, mode, s.trades.length));
  const nextId = () => `T${next(s, "trade")}`;
  const size = account.size;
  let trades: Trade[];
  if (mode === "breach") {
    const lossGross = ev.equity - ev.dailyFloor + rng.int(2_000, 9_000);
    trades = [generateBreachTrade({ accountId, ts: Math.max(start, t - 40 * 60_000), lossGross, nextId, rng })];
  } else {
    const headroom = ev.headroom;
    const pct = mode === "profit" ? rng.range(0.005, 0.012) : mode === "loss" ? -rng.range(0.004, 0.01) : rng.range(-0.003, 0.007);
    let target = Math.round(size * pct);
    if (target < 0) target = -Math.min(-target, Math.floor(headroom * 0.45));
    trades = generateSession({
      accountId,
      size,
      startTs: start,
      endTs: t - 60_000,
      targetNet: target,
      trades: rng.int(2, 4),
      riskBps: phase.perTradeRiskBps ? 70 : 90,
      nextId,
      rng,
      maxAdverse: Math.floor(headroom * 0.8),
    });
  }
  s.trades.push(...trades);
  syncAccount(s, accountId, t);
  return ok({ now: t, trades: trades.length });
}

export function demoOpenPosition(s: DemoState, actor: Actor, accountId: string, now: number): Result<{ now: number }> {
  const account = ownedAccount(s, actor, accountId);
  if (!account) return fail("not_found");
  if (!["ready", "active"].includes(account.status)) return fail("account_frozen");
  const { ruleSnapshot: rs } = getChallenge(s, account.challengeId)!;
  const t = ensureMarketOpen(s, rs, now);
  const rng = createRng(hashSeed(accountId, t, "open"));
  s.trades.push(
    openPositionTrade({ accountId, ts: t, size: account.size, riskBps: 60, nextId: () => `T${next(s, "trade")}`, rng }),
  );
  syncAccount(s, accountId, t);
  return ok({ now: t });
}

export function demoMoveMarket(
  s: DemoState,
  actor: Actor,
  accountId: string,
  direction: "against" | "favor",
  now: number,
): Result {
  const account = ownedAccount(s, actor, accountId);
  if (!account) return fail("not_found");
  if (!["ready", "active"].includes(account.status)) return fail("account_frozen");
  const open = s.trades.filter((t) => t.accountId === accountId && t.status === "open");
  if (!open.length) return fail("no_open_positions");
  const step = Math.round((account.size * 0.005) / open.length) * (direction === "against" ? -1 : 1);
  for (const t of open) Object.assign(t, moveMark(t, step));
  syncAccount(s, accountId, now);
  return ok(undefined);
}

export function demoCloseAll(s: DemoState, actor: Actor, accountId: string, now: number): Result {
  const account = ownedAccount(s, actor, accountId);
  if (!account) return fail("not_found");
  if (!["ready", "active"].includes(account.status)) return fail("account_frozen");
  for (const t of s.trades) if (t.accountId === accountId && t.status === "open") Object.assign(t, closeAtMark(t, now));
  syncAccount(s, accountId, now);
  return ok(undefined);
}

/** Simulate profitable sessions on consecutive trading days until objectives are met. */
export function demoCompleteObjectives(s: DemoState, actor: Actor, accountId: string, now: number): Result<{ now: number }> {
  const account = ownedAccount(s, actor, accountId);
  if (!account) return fail("not_found");
  if (account.kind === "funded") return fail("not_applicable");
  if (!["ready", "active"].includes(account.status)) return fail("account_frozen");
  const { ruleSnapshot: rs } = getChallenge(s, account.challengeId)!;
  let t = now;
  if (s.trades.some((x) => x.accountId === accountId && x.status === "open")) demoCloseAll(s, actor, accountId, t);
  for (let i = 0; i < 40; i++) {
    const acc = getAccount(s, accountId)!;
    if (!["ready", "active"].includes(acc.status)) break;
    t = ensureMarketOpen(s, rs, t);
    const ev = evaluateAccount(s, accountId, t);
    if (ev.completion.ready) {
      syncAccount(s, accountId, t);
      break;
    }
    const target = ev.profitTarget ?? 0;
    const need = Math.max(0, target - ev.profit);
    const daysLeft = Math.max(1, rs.phases[acc.phaseIndex].minTradingDays - ev.tradingDays);
    const todayTraded = ev.days.some((d) => d.key === ev.dayKey && d.opened > 0);
    if (!todayTraded || need > 0 || !ev.completion.consistencyMet) {
      const perDay = Math.max(Math.round(acc.size * 0.0035), Math.min(Math.ceil(need / daysLeft) + 2_500, Math.round(target * 0.3)));
      const start = tradeWindowStart(s, acc, rs, t);
      if (t - start < 25 * 60_000) {
        const to = t + 2 * HOUR_MS;
        moveClock(s, t, to);
        t = to;
        continue;
      }
      const rng = createRng(hashSeed(accountId, t, "ff", i));
      const trades = generateSession({
        accountId,
        size: acc.size,
        startTs: start,
        endTs: t - 60_000,
        targetNet: perDay,
        trades: rng.int(2, 3),
        riskBps: 60,
        nextId: () => `T${next(s, "trade")}`,
        rng,
        maxAdverse: Math.floor(ev.headroom * 0.6),
      });
      s.trades.push(...trades);
      syncAccount(s, accountId, t);
    }
    const after = getAccount(s, accountId)!;
    if (!["ready", "active"].includes(after.status)) break;
    const ev2 = evaluateAccount(s, accountId, t);
    if (ev2.completion.ready) {
      syncAccount(s, accountId, t);
      break;
    }
    // Next trading day, mid-session.
    const to = nextResetAfter(t, rs.timezone, rs.dailyResetHour) + 3 * HOUR_MS;
    moveClock(s, t, to);
    t = to;
  }
  syncAll(s, t);
  return ok({ now: t });
}

/* ───────────── review / KYC / contract / activation ───────────── */

export function opsApproveReview(s: DemoState, actor: Actor, reviewId: string, note: string, now: number): Result {
  if (actor.role !== "ops") return fail("forbidden");
  const review = s.reviews.find((r) => r.id === reviewId);
  if (!review || review.status !== "open") return fail("not_found");
  const account = getAccount(s, review.accountId)!;
  const challenge = getChallenge(s, review.challengeId)!;
  if (account.status !== "under_review") return fail("invalid_state");
  const ev = evaluateAccount(s, account.id, now);
  if (!ev.completion.ready || ev.breach) return fail("objectives_not_verified");
  review.status = "approved";
  review.decidedAt = now;
  review.decidedBy = actor.id;
  review.reason = note.trim() || undefined;
  account.status = "passed";
  challenge.status = "passed";
  challenge.passedAt = now;
  const user = getUser(s, challenge.userId)!;
  if (user.kyc.status === "verified") challenge.contract.status = "ready";
  audit(s, actor, "review.approved", "challenge", challenge.id, now, note.trim() || undefined);
  notify(s, user.id, "challenge_approved", { challengeId: challenge.id, accountId: account.id }, now);
  const blockers = challengePassedBlockers(challenge, s.accounts, review, s.certificates);
  if (!blockers.length)
    issueCertificate(
      s,
      "challenge_passed",
      {
        userId: user.id,
        traderName: traderNameFor(s, user.id),
        programId: challenge.programId,
        accountRef: maskAccount(account.id),
        challengeId: challenge.id,
        amount: challenge.size,
        amountKind: "nominal_size",
        sourceId: challenge.id,
      },
      now,
    );
  return ok(undefined);
}

export function opsRejectReview(s: DemoState, actor: Actor, reviewId: string, reason: string, now: number): Result {
  if (actor.role !== "ops") return fail("forbidden");
  if (reason.trim().length < 10) return fail("reason_required");
  const review = s.reviews.find((r) => r.id === reviewId);
  if (!review || review.status !== "open") return fail("not_found");
  const account = getAccount(s, review.accountId)!;
  const challenge = getChallenge(s, review.challengeId)!;
  review.status = "rejected";
  review.decidedAt = now;
  review.decidedBy = actor.id;
  review.reason = reason.trim();
  account.status = "review_rejected";
  challenge.status = "rejected";
  audit(s, actor, "review.rejected", "challenge", challenge.id, now, reason.trim());
  notify(s, challenge.userId, "challenge_rejected", { challengeId: challenge.id, reason: reason.trim() }, now);
  return ok(undefined);
}

export function submitKyc(
  s: DemoState,
  actor: Actor,
  input: { legalName: string; dateOfBirth: string; documentType: "passport" | "id_card" | "driving_licence"; confirmDemo: boolean },
  now: number,
): Result {
  const u = requireTrader(s, actor);
  if (!u) return fail("forbidden");
  if (u.kyc.status === "verified" || u.kyc.status === "submitted") return fail("invalid_state");
  if (!input.confirmDemo) return fail("confirm_required");
  if (input.legalName.trim().split(/\s+/).length < 2) return fail("legal_name_required");
  const dob = Date.parse(input.dateOfBirth);
  if (Number.isNaN(dob)) return fail("dob_invalid");
  if (now - dob < 18 * 365.25 * DAY_MS) return fail("underage");
  u.kyc = {
    status: "submitted",
    submittedAt: now,
    legalName: input.legalName.trim(),
    dateOfBirth: input.dateOfBirth,
    documentType: input.documentType,
  };
  audit(s, actor, "kyc.submitted_demo", "user", u.id, now);
  return ok(undefined);
}

export function opsDecideKyc(
  s: DemoState,
  actor: Actor,
  userId: string,
  decision: "verified" | "rejected",
  reason: string,
  now: number,
): Result {
  if (actor.role !== "ops") return fail("forbidden");
  const u = getUser(s, userId);
  if (!u || u.kyc.status !== "submitted") return fail("invalid_state");
  if (decision === "rejected" && reason.trim().length < 10) return fail("reason_required");
  u.kyc.status = decision;
  u.kyc.decidedAt = now;
  u.kyc.rejectionReason = decision === "rejected" ? reason.trim() : undefined;
  if (decision === "verified")
    for (const c of s.challenges)
      if (c.userId === userId && c.status === "passed" && c.contract.status === "not_available") c.contract.status = "ready";
  audit(s, actor, `kyc.${decision}`, "user", userId, now, reason.trim() || undefined);
  notify(s, userId, decision === "verified" ? "kyc_verified" : "kyc_rejected", { reason: reason.trim() }, now);
  return ok(undefined);
}

export function signContract(
  s: DemoState,
  actor: Actor,
  challengeId: string,
  signerName: string,
  accept: boolean,
  now: number,
): Result<{ fundedAccountId: string }> {
  const u = requireTrader(s, actor);
  const challenge = getChallenge(s, challengeId);
  if (!u || !challenge || challenge.userId !== u.id) return fail("not_found");
  if (challenge.status !== "passed") return fail("invalid_state");
  if (u.kyc.status !== "verified") return fail("kyc_required");
  if (challenge.contract.status !== "ready") return fail("invalid_state");
  if (!accept) return fail("confirm_required");
  const norm = (x: string) => x.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
  if (norm(signerName) !== norm(u.kyc.legalName ?? "")) return fail("signer_mismatch");
  challenge.contract = { status: "signed", signedAt: now, signerName: signerName.trim(), version: CONTRACT_VERSION };
  audit(s, actor, "contract.signed_demo", "challenge", challenge.id, now, undefined, { version: CONTRACT_VERSION });
  const funded = activateFunded(s, challenge, now);
  return ok({ fundedAccountId: funded.id });
}

function activateFunded(s: DemoState, challenge: Challenge, now: number): Account {
  const fundedIndex = challenge.ruleSnapshot.phases.findIndex((p) => p.kind === "funded");
  const lastEval = getAccount(s, challenge.accountIds[challenge.accountIds.length - 1])!;
  const account = makeAccount(s, challenge, fundedIndex, "active", now, lastEval.platform);
  challenge.fundedAccountId = account.id;
  challenge.status = "funded";
  audit(s, SYSTEM, "funded.activated", "account", account.id, now, undefined, { challenge: challenge.id });
  notify(s, challenge.userId, "funded_activated", { accountId: account.id }, now);
  const user = getUser(s, challenge.userId)!;
  if (!fundedBlockers(account, challenge, user, s.certificates).length)
    issueCertificate(
      s,
      "funded_trader",
      {
        userId: user.id,
        traderName: traderNameFor(s, user.id),
        programId: challenge.programId,
        accountRef: maskAccount(account.id),
        challengeId: challenge.id,
        amount: challenge.size,
        amountKind: "nominal_size",
        sourceId: account.id,
      },
      now,
    );
  return account;
}

/* ───────────── payouts ───────────── */

export function eligibilityFor(s: DemoState, accountId: string, now: number): PayoutEligibility | null {
  const account = getAccount(s, accountId);
  if (!account || account.kind !== "funded") return null;
  const challenge = getChallenge(s, account.challengeId)!;
  const user = getUser(s, account.userId)!;
  return payoutEligibility({
    account,
    challenge,
    user,
    evaluation: evaluateAccount(s, accountId, now),
    trades: s.trades,
    payouts: s.payouts,
    feePaid: orderOf(s, challenge)?.total ?? 0,
    now,
  });
}

export function requestPayout(
  s: DemoState,
  actor: Actor,
  input: { accountId: string; amount: Cents; method: Payout["method"] },
  now: number,
): Result<{ payoutId: string }> {
  const account = ownedAccount(s, actor, input.accountId);
  if (!account || actor.role !== "trader") return fail("not_found");
  const elig = eligibilityFor(s, account.id, now);
  if (!elig) return fail("not_applicable");
  const err = validatePayoutRequest(input.amount, elig);
  if (err) return fail(err, { min: elig.minRequest, max: elig.requestable });
  const method = PAYOUT_METHODS.find((m) => m.id === input.method);
  if (!method) return fail("method_invalid");
  const challenge = getChallenge(s, account.challengeId)!;
  const quote = quotePayout(input.amount, elig.splitBps, elig.feeRefundDue, 0);
  const id = `PO-${String(next(s, "payout")).padStart(5, "0")}`;
  s.payouts.unshift({
    id,
    userId: account.userId,
    accountId: account.id,
    challengeId: challenge.id,
    requestedAt: now,
    gross: quote.gross,
    splitBps: quote.splitBps,
    traderShare: quote.traderShare,
    companyShare: quote.companyShare,
    feeRefund: quote.feeRefund,
    processingFee: quote.processingFee,
    netToTrader: quote.netToTrader,
    method: method.id,
    methodLabel: method.masked,
    status: "requested",
    timeline: [{ status: "requested", at: now, actor: "trader" }],
  });
  s.ledger.push({ id: `L-${next(s, "misc")}`, accountId: account.id, ts: now, type: "payout_reserve", amount: quote.gross, payoutId: id });
  notify(s, account.userId, "payout_status", { payoutId: id, status: "requested" }, now);
  audit(s, actor, "payout.requested", "payout", id, now, undefined, { gross: quote.gross });
  return ok({ payoutId: id });
}

function releaseReserve(s: DemoState, p: Payout, now: number) {
  s.ledger.push({ id: `L-${next(s, "misc")}`, accountId: p.accountId, ts: now, type: "payout_release", amount: p.gross, payoutId: p.id });
}

export function cancelPayout(s: DemoState, actor: Actor, payoutId: string, now: number): Result {
  const p = s.payouts.find((x) => x.id === payoutId);
  if (!p || actor.role !== "trader" || p.userId !== actor.id) return fail("not_found");
  if (!canTransition(p.status, "cancelled", "trader")) return fail("invalid_transition");
  p.status = "cancelled";
  p.timeline.push({ status: "cancelled", at: now, actor: "trader" });
  releaseReserve(s, p, now);
  notify(s, p.userId, "payout_status", { payoutId: p.id, status: "cancelled" }, now);
  audit(s, actor, "payout.cancelled", "payout", p.id, now);
  return ok(undefined);
}

export function opsTransitionPayout(
  s: DemoState,
  actor: Actor,
  payoutId: string,
  to: PayoutStatus,
  note: string,
  now: number,
): Result {
  if (actor.role !== "ops") return fail("forbidden");
  const p = s.payouts.find((x) => x.id === payoutId);
  if (!p) return fail("not_found");
  if (!canTransition(p.status, to, "ops")) return fail("invalid_transition");
  if (to === "rejected" && note.trim().length < 10) return fail("reason_required");
  const account = getAccount(s, p.accountId)!;
  if ((to === "approved" || to === "processing" || to === "paid") && account.status !== "active")
    return fail("account_not_active");
  p.status = to;
  p.timeline.push({ status: to, at: now, actor: "ops", note: note.trim() || undefined });
  if (to === "rejected") {
    p.rejectionReason = note.trim();
    releaseReserve(s, p, now);
  }
  if (to === "paid") {
    p.receiptNo = `RCPT-DEMO-${p.id.slice(3)}`;
    s.ledger.push({ id: `L-${next(s, "misc")}`, accountId: p.accountId, ts: now, type: "payout_paid", amount: p.gross, payoutId: p.id });
    const challenge = getChallenge(s, p.challengeId)!;
    if (p.feeRefund > 0) challenge.feeRefunded = true;
    if (!payoutBlockers(p, s.certificates).length) {
      const cert = issueCertificate(
        s,
        "payout",
        {
          userId: p.userId,
          traderName: traderNameFor(s, p.userId),
          programId: challenge.programId,
          accountRef: maskAccount(p.accountId),
          challengeId: challenge.id,
          amount: p.netToTrader,
          amountKind: "payout_amount",
          sourceId: p.id,
        },
        now,
      );
      p.certificateId = cert.id;
    }
  }
  notify(s, p.userId, "payout_status", { payoutId: p.id, status: to }, now);
  audit(s, actor, `payout.${to}`, "payout", p.id, now, note.trim() || undefined);
  return ok(undefined);
}

/* ───────────── certificates ───────────── */

export function opsRevokeCertificate(s: DemoState, actor: Actor, certId: string, reason: string, now: number): Result {
  if (actor.role !== "ops") return fail("forbidden");
  if (reason.trim().length < 10) return fail("reason_required");
  const c = s.certificates.find((x) => x.id === certId);
  if (!c || c.status !== "valid") return fail("invalid_state");
  c.status = "revoked";
  c.revokedAt = now;
  c.revokedReason = reason.trim();
  audit(s, actor, "certificate.revoked", "certificate", c.id, now, reason.trim());
  return ok(undefined);
}

/* ───────────── support / journal / notifications ───────────── */

export function createTicket(
  s: DemoState,
  actor: Actor | null,
  input: {
    subject: string;
    body: string;
    category: SupportTicket["category"];
    email?: string;
    source: SupportTicket["source"];
    transcript?: SupportTicket["assistantTranscript"];
  },
  now: number,
): Result<{ ticketId: string }> {
  if (input.subject.trim().length < 3) return fail("subject_required");
  if (input.body.trim().length < 10) return fail("message_short");
  if (!actor && (!input.email || !EMAIL_RE.test(input.email.trim()))) return fail("email_invalid");
  const id = `SUP-${String(next(s, "misc")).padStart(5, "0")}`;
  s.tickets.unshift({
    id,
    userId: actor?.role === "trader" ? actor.id : null,
    email: input.email?.trim().toLowerCase(),
    subject: input.subject.trim().slice(0, 140),
    category: input.category,
    status: "open",
    createdAt: now,
    messages: [{ from: "trader", at: now, body: input.body.trim().slice(0, 4000) }],
    source: input.source,
    assistantTranscript: input.transcript,
  });
  audit(s, actor ?? { role: "system", id: "public" }, "support.created", "ticket", id, now);
  return ok({ ticketId: id });
}

export function replyTicket(s: DemoState, actor: Actor, ticketId: string, body: string, now: number): Result {
  const t = s.tickets.find((x) => x.id === ticketId);
  if (!t) return fail("not_found");
  if (actor.role === "trader" && t.userId !== actor.id) return fail("not_found");
  if (body.trim().length < 2) return fail("message_short");
  t.messages.push({ from: actor.role === "ops" ? "ops" : "trader", at: now, body: body.trim().slice(0, 4000) });
  t.status = actor.role === "ops" ? "answered" : "open";
  if (actor.role === "ops" && t.userId) notify(s, t.userId, "support_reply", { ticketId }, now);
  return ok(undefined);
}

export function closeTicket(s: DemoState, actor: Actor, ticketId: string, now: number): Result {
  const t = s.tickets.find((x) => x.id === ticketId);
  if (!t || (actor.role === "trader" && t.userId !== actor.id)) return fail("not_found");
  t.status = "closed";
  audit(s, actor, "support.closed", "ticket", ticketId, now);
  return ok(undefined);
}

const cleanTags = (tags: string[]) =>
  [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean))].slice(0, 8).map((t) => t.slice(0, 24));

export function saveJournal(
  s: DemoState,
  actor: Actor,
  input: { id?: string; accountId: string; tradeId?: string; dayKey?: string; note: string; tags: string[] },
  now: number,
): Result<{ id: string }> {
  const account = ownedAccount(s, actor, input.accountId);
  if (!account || actor.role !== "trader") return fail("not_found");
  const note = input.note.trim();
  if (note.length < 1) return fail("note_required");
  if (note.length > 2000) return fail("note_too_long");
  if (input.tradeId && !s.trades.some((t) => t.id === input.tradeId && t.accountId === account.id)) return fail("not_found");
  if (input.id) {
    const e = s.journal.find((j) => j.id === input.id && j.userId === actor.id);
    if (!e) return fail("not_found");
    e.note = note;
    e.tags = cleanTags(input.tags);
    e.updatedAt = now;
    return ok({ id: e.id });
  }
  const id = `J-${next(s, "misc")}`;
  s.journal.unshift({
    id,
    userId: actor.id,
    accountId: account.id,
    tradeId: input.tradeId,
    dayKey: input.dayKey,
    note,
    tags: cleanTags(input.tags),
    createdAt: now,
    updatedAt: now,
  });
  return ok({ id });
}

export function deleteJournal(s: DemoState, actor: Actor, id: string): Result {
  const before = s.journal.length;
  s.journal = s.journal.filter((j) => !(j.id === id && j.userId === actor.id));
  return before === s.journal.length ? fail("not_found") : ok(undefined);
}

export function markNotificationsRead(s: DemoState, actor: Actor, ids?: string[]): Result {
  for (const n of s.notifications) if (n.userId === actor.id && (!ids || ids.includes(n.id))) n.read = true;
  return ok(undefined);
}

export function recordFeedback(
  s: DemoState,
  actor: Actor | null,
  input: { question: string; intent: string; rating: "up" | "down" },
  now: number,
): Result {
  s.feedback.unshift({
    id: `FB-${next(s, "misc")}`,
    ts: now,
    userId: actor?.role === "trader" ? actor.id : null,
    question: input.question.slice(0, 500),
    intent: input.intent,
    rating: input.rating,
  });
  return ok(undefined);
}

/* ───────────── catalog administration ───────────── */

export function opsUpdatePrice(s: DemoState, actor: Actor, programId: ProgramId, size: number, price: Cents, now: number): Result {
  if (actor.role !== "ops") return fail("forbidden");
  if (!Number.isSafeInteger(price) || price < 1_000 || price > 500_000) return fail("invalid_amount");
  const opt = s.catalog.programs.find((p) => p.id === programId)?.sizes.find((o) => o.size === size);
  if (!opt) return fail("not_found");
  const before = opt.price;
  opt.price = price;
  audit(s, actor, "catalog.price_updated", "program", programId, now, undefined, { size, before, after: price });
  return ok(undefined);
}

export interface RulePatch {
  phaseIndex: number;
  profitTargetBps?: number;
  dailyLossBps?: number;
  maxLossBps?: number;
  minTradingDays?: number;
}

export function opsPublishRuleVersion(
  s: DemoState,
  actor: Actor,
  programId: ProgramId,
  patches: RulePatch[],
  payoutPatch: { profitSplitBps?: number; firstPayoutAfterDays?: number },
  changelog: L10n,
  now: number,
): Result<{ ruleSetId: string }> {
  if (actor.role !== "ops") return fail("forbidden");
  if (changelog.en.trim().length < 10 || changelog.tr.trim().length < 10) return fail("changelog_required");
  const program = s.catalog.programs.find((p) => p.id === programId);
  if (!program) return fail("not_found");
  const current = s.catalog.ruleSets.find((r) => r.id === program.currentRuleSetId)!;
  const [major, minor] = current.version.split(".").map(Number);
  const version = `${major}.${minor + 1}`;
  const nextRs: RuleSet = structuredClone(current);
  nextRs.id = `${programId}@${version}`;
  nextRs.version = version;
  nextRs.publishedAt = isoDay(now);
  nextRs.changelog = [changelog];
  const inRange = (v: number | undefined, lo: number, hi: number) => v === undefined || (Number.isInteger(v) && v >= lo && v <= hi);
  for (const p of patches) {
    const ph = nextRs.phases[p.phaseIndex];
    if (!ph) return fail("invalid_rule");
    if (!inRange(p.profitTargetBps, 100, 3000) || !inRange(p.dailyLossBps, 100, 1000) || !inRange(p.maxLossBps, 200, 2000) || !inRange(p.minTradingDays, 0, 20))
      return fail("invalid_rule");
    if (p.profitTargetBps !== undefined && ph.profitTargetBps !== null) ph.profitTargetBps = p.profitTargetBps;
    if (p.dailyLossBps !== undefined) ph.dailyLossBps = p.dailyLossBps;
    if (p.maxLossBps !== undefined) ph.maxLoss = { ...ph.maxLoss, bps: p.maxLossBps };
    if (p.minTradingDays !== undefined && ph.kind !== "funded") ph.minTradingDays = p.minTradingDays;
    if (ph.dailyLossBps >= ph.maxLoss.bps) return fail("invalid_rule");
  }
  if (!inRange(payoutPatch.profitSplitBps, 5000, 9500) || !inRange(payoutPatch.firstPayoutAfterDays, 1, 60)) return fail("invalid_rule");
  if (payoutPatch.profitSplitBps !== undefined) nextRs.payout.profitSplitBps = payoutPatch.profitSplitBps;
  if (payoutPatch.firstPayoutAfterDays !== undefined) nextRs.payout.firstPayoutAfterDays = payoutPatch.firstPayoutAfterDays;
  s.catalog.ruleSets.push(nextRs);
  program.currentRuleSetId = nextRs.id;
  audit(s, actor, "rules.published", "ruleset", nextRs.id, now, changelog.en);
  return ok({ ruleSetId: nextRs.id });
}

const INJECTION_HINT = /(ignore (all|previous|prior)|system prompt|you are now|disregard|önceki talimat|talimatları yok say|sistem istemi)/i;

export function opsUpsertArticle(
  s: DemoState,
  actor: Actor,
  input: { id?: string; title: L10n; body: L10n; keywords: string[] },
  now: number,
): Result<{ id: string; flagged: boolean }> {
  if (actor.role !== "ops") return fail("forbidden");
  if (input.title.en.trim().length < 5 || input.title.tr.trim().length < 5) return fail("title_required");
  if (input.body.en.trim().length < 20 || input.body.tr.trim().length < 20) return fail("body_required");
  const flagged = INJECTION_HINT.test(`${input.title.en} ${input.title.tr} ${input.body.en} ${input.body.tr}`);
  const article: CustomArticle = {
    id: input.id ?? `kb-faq-${next(s, "misc")}`,
    category: "faq",
    title: { en: input.title.en.trim(), tr: input.title.tr.trim() },
    body: { en: input.body.en.trim(), tr: input.body.tr.trim() },
    keywords: input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    updatedAt: now,
    flagged,
  };
  s.articles = [article, ...s.articles.filter((a) => a.id !== article.id)];
  audit(s, actor, "kb.article_saved", "article", article.id, now, undefined, { flagged });
  return ok({ id: article.id, flagged });
}

/* ───────────── read helpers used by UI ───────────── */

export function accountTrades(s: DemoState, accountId: string) {
  return s.trades.filter((t) => t.accountId === accountId).sort((a, b) => (b.closeTime ?? b.openTime) - (a.closeTime ?? a.openTime));
}

export { tradeNet };
