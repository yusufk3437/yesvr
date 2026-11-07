/**
 * Risk & objectives engine.
 *
 * Inputs are the account's own trades and ledger only, so every number in the
 * dashboard, the Assistant and the payout checks is derived from one dataset.
 *
 * Model (see docs/product-decisions.md §3):
 *  - Equity = balance + floating P&L of open positions. Floating includes the
 *    commission (charged at open) and accrued swap.
 *  - Daily floor = reference − dailyLoss% × initial size, where the reference is
 *    the higher of balance and equity at the daily reset.
 *  - Max floor = initial − maxLoss% (static), or min(initial, HWM − maxLoss%)
 *    for end-of-day trailing, where HWM is the highest balance at a reset.
 *  - Equity ≤ floor is a breach (touching the limit counts).
 *  - Payout reserves are not losses: they shift the daily reference and the
 *    trailing HWM down by the same amount.
 *
 * Intraday equity in the demo is reconstructed from each trade's maximum
 * adverse excursion (MAE); a live integration would stream equity snapshots.
 */
import { SYMBOLS } from "./catalog";
import { applyBps, type Cents } from "./money";
import {
  isWeekdayKey,
  nextResetAfter,
  resetsBetween,
  tradingDayKey,
  tradingDayStart,
  weekdayOfKey,
  DAY_MS,
} from "./time";
import type { Breach, LedgerEntry, PhaseRules, RuleSet, Trade } from "./types";

export interface RiskInput {
  ruleSet: RuleSet;
  phase: PhaseRules;
  initialBalance: Cents;
  startedAt: number;
  trades: Trade[];
  ledger: LedgerEntry[];
  now: number;
}

export type ObjectiveId =
  | "profit_target"
  | "min_trading_days"
  | "daily_loss"
  | "max_loss"
  | "consistency"
  | "per_trade_risk";

export type ObjectiveStatus = "met" | "pending" | "breached" | "warning";

export interface Objective {
  id: ObjectiveId;
  status: ObjectiveStatus;
  current: number;
  target: number;
  unit: "cents" | "days" | "bps" | "count";
}

export interface SoftViolation {
  type: "per_trade_risk" | "missing_stop_loss" | "weekend_hold" | "news_window";
  tradeId: string;
  at: number;
  valueBps?: number;
}

export interface DayStat {
  key: string;
  net: Cents;
  closed: number;
  opened: number;
  wins: number;
  losses: number;
}

export interface EquityPoint {
  ts: number;
  balance: Cents;
  equity: Cents;
}

export interface RiskEvaluation {
  initialBalance: Cents;
  balance: Cents;
  equity: Cents;
  openPnl: Cents;
  closedNet: Cents;
  todayPnl: Cents;
  reserved: Cents;
  withdrawn: Cents;
  dayKey: string;
  dayStart: number;
  nextReset: number;
  dayReference: Cents;
  dailyLossAmount: Cents;
  dailyFloor: Cents;
  dailyUsed: Cents;
  dailyRemaining: Cents;
  maxLossAmount: Cents;
  maxFloor: Cents;
  maxRemaining: Cents;
  highWaterMark: Cents;
  trailingLocked: boolean;
  headroom: Cents;
  bindingLimit: "daily" | "max";
  profitTarget: Cents | null;
  profit: Cents;
  tradingDays: number;
  profitableDays: number;
  consistency: {
    applicable: boolean;
    bestDay: Cents;
    totalProfit: Cents;
    shareBps: number | null;
    maxBps: number | null;
    met: boolean;
  };
  violations: SoftViolation[];
  breach: Breach | null;
  objectives: Objective[];
  completion: {
    targetMet: boolean;
    minDaysMet: boolean;
    consistencyMet: boolean;
    flat: boolean;
    ready: boolean;
  };
  openTrades: Trade[];
  closedTrades: Trade[];
  days: DayStat[];
  series: EquityPoint[];
  lastActivityAt: number;
  inactivityDeadline: number;
}

export const tradeNet = (t: Trade): Cents => t.grossPnl + t.commission + t.swap;

export function dailyFloorFor(reference: Cents, initial: Cents, dailyLossBps: number): Cents {
  return reference - applyBps(initial, dailyLossBps);
}

export function trailingFloorFor(hwm: Cents, initial: Cents, maxLossBps: number): Cents {
  return Math.min(initial, hwm - applyBps(initial, maxLossBps));
}

/** Money at risk between entry and stop-loss, in cents. */
export function tradeRisk(t: Trade): Cents | null {
  if (t.stopLoss === undefined) return null;
  const spec = SYMBOLS[t.symbol];
  if (!spec) return null;
  return Math.round(Math.abs(t.openPrice - t.stopLoss) * spec.contract * t.volume * 100);
}

type Ev =
  | { ts: number; order: 0; kind: "reset" }
  | { ts: number; order: 1; kind: "open"; t: Trade }
  | { ts: number; order: 2; kind: "mae"; t: Trade }
  | { ts: number; order: 3; kind: "close"; t: Trade }
  | { ts: number; order: 4; kind: "ledger"; e: LedgerEntry };

export function evaluateRisk(input: RiskInput): RiskEvaluation {
  const { ruleSet, phase, initialBalance: initial, startedAt, now } = input;
  const tz = ruleSet.timezone;
  const rh = ruleSet.dailyResetHour;
  const dailyAmt = applyBps(initial, phase.dailyLossBps);
  const maxAmt = applyBps(initial, phase.maxLoss.bps);
  const trailing = phase.maxLoss.type === "trailing_eod";

  const trades = input.trades.filter((t) => t.openTime <= now).sort((a, b) => a.openTime - b.openTime);
  const closedTrades = trades.filter((t) => t.status === "closed" && (t.closeTime ?? Infinity) <= now);
  const openTrades = trades.filter((t) => t.status === "open");
  const ledger = input.ledger.filter((e) => e.ts <= now);

  const events: Ev[] = [];
  for (const r of resetsBetween(startedAt, now, tz, rh)) events.push({ ts: r, order: 0, kind: "reset" });
  for (const t of trades) {
    events.push({ ts: t.openTime, order: 1, kind: "open", t });
    const end = t.status === "closed" && t.closeTime !== undefined ? t.closeTime : now;
    events.push({ ts: t.openTime + Math.floor((end - t.openTime) * 0.4), order: 2, kind: "mae", t });
    if (t.status === "closed" && t.closeTime !== undefined && t.closeTime <= now)
      events.push({ ts: t.closeTime, order: 3, kind: "close", t });
  }
  for (const e of ledger) events.push({ ts: e.ts, order: 4, kind: "ledger", e });
  events.sort((a, b) => a.ts - b.ts || a.order - b.order);

  let balance = initial;
  let dayRef = initial;
  let hwm = initial;
  let reserved = 0;
  let withdrawn = 0;
  let breach: Breach | null = null;
  const floating = new Map<string, Cents>();
  const series: EquityPoint[] = [{ ts: startedAt, balance: initial, equity: initial }];

  const equityNow = () => {
    let e = balance;
    for (const v of floating.values()) e += v;
    return e;
  };
  const maxFloorNow = () => (trailing ? trailingFloorFor(hwm, initial, phase.maxLoss.bps) : initial - maxAmt);
  const check = (ts: number, equity: Cents) => {
    if (breach) return;
    const maxFloor = maxFloorNow();
    const dailyFloor = dayRef - dailyAmt;
    if (equity <= maxFloor) breach = { type: "max_loss", at: ts, equity, limit: maxFloor };
    else if (equity <= dailyFloor) breach = { type: "daily_loss", at: ts, equity, limit: dailyFloor };
  };

  for (const ev of events) {
    switch (ev.kind) {
      case "reset": {
        dayRef = Math.max(balance, equityNow());
        if (trailing) hwm = Math.max(hwm, balance);
        series.push({ ts: ev.ts, balance, equity: equityNow() });
        break;
      }
      case "open": {
        floating.set(ev.t.id, ev.t.commission);
        const eq = equityNow();
        series.push({ ts: ev.ts, balance, equity: eq });
        check(ev.ts, eq);
        break;
      }
      case "mae": {
        floating.set(ev.t.id, ev.t.commission + Math.min(0, ev.t.mae) + Math.min(0, ev.t.swap));
        const eq = equityNow();
        series.push({ ts: ev.ts, balance, equity: eq });
        check(ev.ts, eq);
        floating.set(ev.t.id, ev.t.commission);
        break;
      }
      case "close": {
        floating.delete(ev.t.id);
        balance += tradeNet(ev.t);
        const eq = equityNow();
        series.push({ ts: ev.ts, balance, equity: eq });
        check(ev.ts, eq);
        break;
      }
      case "ledger": {
        const { e } = ev;
        if (e.type === "payout_reserve") {
          balance -= e.amount;
          dayRef -= e.amount;
          if (trailing) hwm -= e.amount;
          reserved += e.amount;
        } else if (e.type === "payout_release") {
          balance += e.amount;
          dayRef += e.amount;
          if (trailing) hwm += e.amount;
          reserved -= e.amount;
        } else {
          reserved -= e.amount;
          withdrawn += e.amount;
        }
        series.push({ ts: ev.ts, balance, equity: equityNow() });
        break;
      }
    }
  }

  // Live state at `now`: open positions at their current mark.
  for (const t of openTrades) floating.set(t.id, tradeNet(t));
  const equity = equityNow();
  const openPnl = equity - balance;
  series.push({ ts: now, balance, equity });
  check(now, equity);

  // Inactivity: no position opened for N days (counted from start or last open).
  const lastActivityAt = trades.length ? Math.max(startedAt, trades[trades.length - 1].openTime) : startedAt;
  const inactivityDeadline = lastActivityAt + phase.inactivityDays * DAY_MS;
  if (!breach && openTrades.length === 0 && now > inactivityDeadline) {
    breach = { type: "inactivity", at: inactivityDeadline, equity, limit: 0 };
  }

  // Day statistics.
  const dayMap = new Map<string, DayStat>();
  const day = (key: string) => {
    let d = dayMap.get(key);
    if (!d) {
      d = { key, net: 0, closed: 0, opened: 0, wins: 0, losses: 0 };
      dayMap.set(key, d);
    }
    return d;
  };
  for (const t of trades) day(tradingDayKey(t.openTime, tz, rh)).opened++;
  for (const t of closedTrades) {
    const d = day(tradingDayKey(t.closeTime!, tz, rh));
    const n = tradeNet(t);
    d.net += n;
    d.closed++;
    if (n > 0) d.wins++;
    else if (n < 0) d.losses++;
  }
  const days = [...dayMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const tradingDays = days.filter((d) => d.opened > 0).length;
  const profitableDays = days.filter((d) => d.net > 0).length;

  const dayKey = tradingDayKey(now, tz, rh);
  const closedNet = closedTrades.reduce((s, t) => s + tradeNet(t), 0);
  const todayClosed = dayMap.get(dayKey)?.net ?? 0;
  const todayPnl = todayClosed + openPnl;

  const dailyFloor = dayRef - dailyAmt;
  const maxFloor = maxFloorNow();
  const dailyRemaining = Math.max(0, equity - dailyFloor);
  const maxRemaining = Math.max(0, equity - maxFloor);
  const dailyUsed = Math.min(dailyAmt, Math.max(0, dayRef - equity));

  // Consistency (phase scope).
  const totalProfit = closedNet;
  const bestDay = days.reduce((m, d) => Math.max(m, d.net), 0);
  const shareBps = totalProfit > 0 ? Math.round((bestDay / totalProfit) * 10_000) : null;
  const maxBps = phase.consistency?.scope === "phase" ? phase.consistency.bestDayMaxBps : null;
  const consistencyApplicable = maxBps !== null;
  const consistencyMet = !consistencyApplicable || (shareBps !== null && shareBps <= maxBps!);

  // Soft violations.
  const violations: SoftViolation[] = [];
  if (phase.perTradeRiskBps !== null) {
    for (const t of trades) {
      const risk = tradeRisk(t);
      if (risk === null) violations.push({ type: "missing_stop_loss", tradeId: t.id, at: t.openTime });
      else {
        const valueBps = Math.round((risk / initial) * 10_000);
        if (valueBps > phase.perTradeRiskBps)
          violations.push({ type: "per_trade_risk", tradeId: t.id, at: t.openTime, valueBps });
      }
    }
  }
  if (!phase.weekendHolding) {
    for (const t of trades) {
      const end = t.closeTime ?? now;
      const spans = resetsBetween(t.openTime, end - 1, tz, rh).some(
        (r) => weekdayOfKey(tradingDayKey(r - 1, tz, rh)) === 5,
      );
      if (spans) violations.push({ type: "weekend_hold", tradeId: t.id, at: t.openTime });
    }
  }
  if (phase.newsTrading === "restricted_2min") {
    for (const t of trades) if (t.newsWindow) violations.push({ type: "news_window", tradeId: t.id, at: t.openTime });
  }

  const profitTarget = phase.profitTargetBps !== null ? applyBps(initial, phase.profitTargetBps) : null;
  const profit = balance - initial;
  const targetMet = profitTarget !== null && profit >= profitTarget;
  const minDaysMet = tradingDays >= phase.minTradingDays;
  const flat = openTrades.length === 0;
  const riskViolations = violations.filter((v) => v.type === "per_trade_risk" || v.type === "missing_stop_loss");

  const objectives: Objective[] = [];
  if (profitTarget !== null)
    objectives.push({
      id: "profit_target",
      status: targetMet ? "met" : "pending",
      current: profit,
      target: profitTarget,
      unit: "cents",
    });
  if (phase.minTradingDays > 0)
    objectives.push({
      id: "min_trading_days",
      status: minDaysMet ? "met" : "pending",
      current: tradingDays,
      target: phase.minTradingDays,
      unit: "days",
    });
  const finalBreach = breach as Breach | null;
  objectives.push({
    id: "daily_loss",
    status: finalBreach?.type === "daily_loss" ? "breached" : "met",
    current: dailyUsed,
    target: dailyAmt,
    unit: "cents",
  });
  objectives.push({
    id: "max_loss",
    status: finalBreach?.type === "max_loss" ? "breached" : "met",
    current: Math.max(0, maxAmt - maxRemaining),
    target: maxAmt,
    unit: "cents",
  });
  if (consistencyApplicable)
    objectives.push({
      id: "consistency",
      status: consistencyMet ? "met" : "pending",
      current: shareBps ?? 0,
      target: maxBps!,
      unit: "bps",
    });
  if (phase.perTradeRiskBps !== null)
    objectives.push({
      id: "per_trade_risk",
      status: riskViolations.length ? "warning" : "met",
      current: riskViolations.length,
      target: 0,
      unit: "count",
    });

  return {
    initialBalance: initial,
    balance,
    equity,
    openPnl,
    closedNet,
    todayPnl,
    reserved,
    withdrawn,
    dayKey,
    dayStart: tradingDayStart(dayKey, tz, rh),
    nextReset: nextResetAfter(now, tz, rh),
    dayReference: dayRef,
    dailyLossAmount: dailyAmt,
    dailyFloor,
    dailyUsed,
    dailyRemaining,
    maxLossAmount: maxAmt,
    maxFloor,
    maxRemaining,
    highWaterMark: hwm,
    trailingLocked: trailing && maxFloor >= initial,
    headroom: Math.min(dailyRemaining, maxRemaining),
    bindingLimit: dailyRemaining <= maxRemaining ? "daily" : "max",
    profitTarget,
    profit,
    tradingDays,
    profitableDays,
    consistency: {
      applicable: consistencyApplicable,
      bestDay,
      totalProfit,
      shareBps,
      maxBps,
      met: consistencyMet,
    },
    violations,
    breach: finalBreach,
    objectives,
    completion: {
      targetMet,
      minDaysMet,
      consistencyMet,
      flat,
      ready: targetMet && minDaysMet && consistencyMet && flat && !finalBreach,
    },
    openTrades,
    closedTrades,
    days,
    series,
    lastActivityAt,
    inactivityDeadline,
  };
}

/* ───────────── Trade statistics (from the same closed trades) ───────────── */

export interface TradeStats {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  grossProfit: Cents;
  grossLoss: Cents;
  profitFactor: number | null;
  expectancy: Cents | null;
  avgWin: Cents | null;
  avgLoss: Cents | null;
  avgRR: number | null;
  avgR: number | null;
  commission: Cents;
  swap: Cents;
  longs: number;
  shorts: number;
  bestTrade: Cents | null;
  worstTrade: Cents | null;
  avgHoldMs: number | null;
}

export function tradeStats(closed: Trade[]): TradeStats {
  const nets = closed.map(tradeNet);
  const winsArr = nets.filter((n) => n > 0);
  const lossArr = nets.filter((n) => n < 0);
  const grossProfit = winsArr.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossArr.reduce((a, b) => a + b, 0));
  const total = nets.reduce((a, b) => a + b, 0);
  const rs = closed
    .map((t) => {
      const risk = tradeRisk(t);
      return risk && risk > 0 ? tradeNet(t) / risk : null;
    })
    .filter((r): r is number => r !== null);
  const avgWin = winsArr.length ? Math.round(grossProfit / winsArr.length) : null;
  const avgLoss = lossArr.length ? -Math.round(grossLoss / lossArr.length) : null;
  return {
    count: closed.length,
    wins: winsArr.length,
    losses: lossArr.length,
    winRate: closed.length ? winsArr.length / closed.length : null,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancy: closed.length ? Math.round(total / closed.length) : null,
    avgWin,
    avgLoss,
    avgRR: avgWin !== null && avgLoss !== null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    commission: closed.reduce((s, t) => s + t.commission, 0),
    swap: closed.reduce((s, t) => s + t.swap, 0),
    longs: closed.filter((t) => t.side === "buy").length,
    shorts: closed.filter((t) => t.side === "sell").length,
    bestTrade: nets.length ? Math.max(...nets) : null,
    worstTrade: nets.length ? Math.min(...nets) : null,
    avgHoldMs: closed.length
      ? closed.reduce((s, t) => s + ((t.closeTime ?? t.openTime) - t.openTime), 0) / closed.length
      : null,
  };
}

export { isWeekdayKey };
