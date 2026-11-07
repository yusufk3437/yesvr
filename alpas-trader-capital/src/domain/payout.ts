/**
 * Payout eligibility, quotes and the request state machine.
 * See docs/product-decisions.md §5.
 */
import { applyBps, splitByBps, type Cents } from "./money";
import { tradeNet, type RiskEvaluation } from "./risk";
import { DAY_MS, tradingDayKey } from "./time";
import type { Account, Challenge, Payout, PayoutStatus, Trade, User } from "./types";

export const ACTIVE_PAYOUT_STATUSES: PayoutStatus[] = ["requested", "under_review", "approved", "processing"];
export const isActivePayout = (p: Payout) => ACTIVE_PAYOUT_STATUSES.includes(p.status);

export const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  requested: ["under_review", "rejected", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: ["processing", "rejected"],
  processing: ["paid", "rejected"],
  paid: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: PayoutStatus, to: PayoutStatus, actor: "trader" | "ops"): boolean {
  if (!PAYOUT_TRANSITIONS[from].includes(to)) return false;
  if (actor === "trader") return from === "requested" && to === "cancelled";
  return to !== "cancelled";
}

export type PayoutCheckId =
  | "kyc"
  | "contract"
  | "account_active"
  | "flat"
  | "cycle_date"
  | "trading_days"
  | "consistency"
  | "no_pending"
  | "min_amount";

export interface PayoutCheck {
  id: PayoutCheckId;
  status: "met" | "pending" | "failed";
  params: Record<string, number>;
}

export interface PayoutEligibility {
  eligible: boolean;
  checks: PayoutCheck[];
  profitAvailable: Cents;
  newsExcluded: Cents;
  requestable: Cents;
  minRequest: Cents;
  splitBps: number;
  isFirst: boolean;
  cycleStart: number;
  eligibleFrom: number | null;
  cycleTradingDays: number;
  cycleProfit: Cents;
  cycleBestDay: Cents;
  cycleShareBps: number | null;
  feeRefundDue: Cents;
  pending: Payout | null;
}

export interface EligibilityInput {
  account: Account;
  challenge: Challenge;
  user: User;
  evaluation: RiskEvaluation;
  trades: Trade[];
  payouts: Payout[];
  feePaid: Cents;
  now: number;
}

export function payoutEligibility(input: EligibilityInput): PayoutEligibility {
  const { account, challenge, user, evaluation, trades, payouts, feePaid, now } = input;
  const rs = challenge.ruleSnapshot;
  const policy = rs.payout;
  const own = payouts.filter((p) => p.accountId === account.id);
  const pending = own.find(isActivePayout) ?? null;
  const counted = own
    .filter((p) => p.status !== "rejected" && p.status !== "cancelled")
    .sort((a, b) => b.requestedAt - a.requestedAt);
  const last = counted[0];
  const accountTrades = trades.filter((t) => t.accountId === account.id && t.openTime <= now);
  const firstTradeAt = accountTrades.length ? Math.min(...accountTrades.map((t) => t.openTime)) : null;

  const isFirst = !last;
  const cycleStart = last ? last.requestedAt : (firstTradeAt ?? account.startedAt);
  const eligibleFrom = last
    ? last.requestedAt + policy.cycleDays * DAY_MS
    : firstTradeAt !== null
      ? firstTradeAt + policy.firstPayoutAfterDays * DAY_MS
      : null;

  const cycleTrades = accountTrades.filter((t) => t.openTime >= cycleStart);
  const cycleDayKeys = new Set(cycleTrades.map((t) => tradingDayKey(t.openTime, rs.timezone, rs.dailyResetHour)));
  const cycleClosed = cycleTrades.filter((t) => t.status === "closed");
  const dayNets = new Map<string, Cents>();
  for (const t of cycleClosed) {
    const k = tradingDayKey(t.closeTime!, rs.timezone, rs.dailyResetHour);
    dayNets.set(k, (dayNets.get(k) ?? 0) + tradeNet(t));
  }
  const cycleProfit = [...dayNets.values()].reduce((a, b) => a + b, 0);
  const cycleBestDay = Math.max(0, ...dayNets.values());
  const cycleShareBps = cycleProfit > 0 ? Math.round((cycleBestDay / cycleProfit) * 10_000) : null;

  const newsExcluded = policy.newsProfitExcluded
    ? cycleClosed.filter((t) => t.newsWindow).reduce((s, t) => s + Math.max(0, tradeNet(t)), 0)
    : 0;
  const profitAvailable = Math.max(0, evaluation.balance - account.size);
  const requestable = Math.max(0, profitAvailable - newsExcluded);
  const minRequest = applyBps(account.size, policy.minRequestBps);
  const anyPaid = own.some((p) => p.status === "paid");
  const feeRefundDue = !challenge.feeRefunded && !anyPaid ? feePaid : 0;

  const checks: PayoutCheck[] = [
    { id: "kyc", status: user.kyc.status === "verified" ? "met" : "pending", params: {} },
    { id: "contract", status: challenge.contract.status === "signed" ? "met" : "pending", params: {} },
    {
      id: "account_active",
      status: account.status === "active" && !evaluation.breach ? "met" : "failed",
      params: {},
    },
  ];
  if (policy.requireFlatPositions)
    checks.push({
      id: "flat",
      status: evaluation.openTrades.length === 0 ? "met" : "pending",
      params: { open: evaluation.openTrades.length },
    });
  checks.push({
    id: "cycle_date",
    status: eligibleFrom !== null && now >= eligibleFrom ? "met" : "pending",
    params: { date: eligibleFrom ?? 0, days: isFirst ? policy.firstPayoutAfterDays : policy.cycleDays },
  });
  checks.push({
    id: "trading_days",
    status: cycleDayKeys.size >= policy.minTradingDaysPerCycle ? "met" : "pending",
    params: { current: cycleDayKeys.size, required: policy.minTradingDaysPerCycle },
  });
  if (policy.consistency)
    checks.push({
      id: "consistency",
      status: cycleShareBps !== null && cycleShareBps <= policy.consistency.bestDayMaxBps ? "met" : "pending",
      params: { current: cycleShareBps ?? 0, max: policy.consistency.bestDayMaxBps },
    });
  checks.push({ id: "no_pending", status: pending ? "failed" : "met", params: {} });
  checks.push({
    id: "min_amount",
    status: requestable >= minRequest ? "met" : "pending",
    params: { requestable, min: minRequest },
  });

  return {
    eligible: checks.every((c) => c.status === "met"),
    checks,
    profitAvailable,
    newsExcluded,
    requestable,
    minRequest,
    splitBps: policy.profitSplitBps,
    isFirst,
    cycleStart,
    eligibleFrom,
    cycleTradingDays: cycleDayKeys.size,
    cycleProfit,
    cycleBestDay,
    cycleShareBps,
    feeRefundDue,
    pending,
  };
}

export interface PayoutQuote {
  gross: Cents;
  splitBps: number;
  traderShare: Cents;
  companyShare: Cents;
  feeRefund: Cents;
  processingFee: Cents;
  netToTrader: Cents;
}

export function quotePayout(gross: Cents, splitBps: number, feeRefund: Cents, processingFee: Cents = 0): PayoutQuote {
  const [traderShare, companyShare] = splitByBps(gross, splitBps);
  return {
    gross,
    splitBps,
    traderShare,
    companyShare,
    feeRefund,
    processingFee,
    netToTrader: traderShare + feeRefund - processingFee,
  };
}

export type PayoutRequestError =
  | "invalid_amount"
  | "pending_exists"
  | "not_eligible"
  | "below_minimum"
  | "exceeds_available";

export function validatePayoutRequest(amount: Cents, elig: PayoutEligibility): PayoutRequestError | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return "invalid_amount";
  if (elig.pending) return "pending_exists";
  if (!elig.eligible) return "not_eligible";
  if (amount < elig.minRequest) return "below_minimum";
  if (amount > elig.requestable) return "exceeds_available";
  return null;
}
