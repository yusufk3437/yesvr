/**
 * Simulated trade generation for the demo. Prices are synthetic and are not
 * market data. Every generated trade is internally consistent:
 * gross P&L = (close − open) × direction × contract × volume.
 */
import { SYMBOLS } from "@/domain/catalog";
import type { Cents } from "@/domain/money";
import type { Side, Trade } from "@/domain/types";
import type { Rng } from "./rng";

const SYMBOL_POOL = ["EURUSD", "EURUSD", "GBPUSD", "XAUUSD", "XAUUSD", "US100", "US30", "AUDUSD"] as const;

const roundTo = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

export function grossFor(symbol: string, side: Side, volume: number, open: number, close: number): Cents {
  const spec = SYMBOLS[symbol];
  const dir = side === "buy" ? 1 : -1;
  return Math.round((close - open) * dir * spec.contract * volume * 100);
}

export interface SessionSpec {
  accountId: string;
  size: Cents;
  startTs: number;
  endTs: number;
  /** Desired sum of net P&L (gross + commission) of the session's trades. */
  targetNet: Cents;
  trades: number;
  /** Typical stop-loss risk per trade as share of size (bps). */
  riskBps: number;
  nextId: () => string;
  rng: Rng;
  symbols?: readonly string[];
  /**
   * Remaining risk room (cents). When set, winners are placed first and every
   * adverse excursion stays inside the room, so a "normal" session never
   * breaches by accident. Breaches are generated explicitly instead.
   */
  maxAdverse?: Cents;
}

/** Allocate a net target across n trades with a realistic mix of winners and losers. */
function allocate(target: Cents, n: number, rng: Rng, size: Cents): Cents[] {
  if (n === 1) return [target];
  const swing = Math.max(Math.abs(target) * 0.35, size * 0.0015);
  const parts: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const loser = rng.next() < (target >= 0 ? 0.32 : 0.62);
    const mag = rng.range(0.25, 1) * swing;
    parts.push(Math.round(loser ? -mag : mag));
  }
  const rest = target - parts.reduce((a, b) => a + b, 0);
  parts.push(rest);
  return parts;
}

export function generateSession(spec: SessionSpec): Trade[] {
  const { rng, size } = spec;
  const pool = spec.symbols ?? SYMBOL_POOL;
  const n = Math.max(1, spec.trades);
  const window = Math.max(60_000, spec.endTs - spec.startTs);
  const slot = window / n;
  const out: Trade[] = [];

  // Commission is charged per lot; estimate volumes first, then solve gross.
  const allocations = allocate(spec.targetNet, n, rng, size);
  const room = spec.maxAdverse;
  if (room !== undefined) {
    allocations.sort((a, b) => b - a);
    if (spec.targetNet < 0) for (let i = 0; i < n; i++) allocations[i] = Math.round(spec.targetNet / n);
  }
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    const symbol = rng.pick(pool);
    const s = SYMBOLS[symbol];
    const side: Side = rng.next() < 0.55 ? "buy" : "sell";
    let alloc = allocations[i];
    if (room !== undefined) {
      const left = room + Math.min(0, cumulative);
      if (alloc < -left * 0.7) alloc = Math.round(-left * 0.7);
    }
    const baseRisk = (size * spec.riskBps) / 10_000;
    const risk = Math.max(baseRisk, alloc < 0 ? Math.abs(alloc) * 1.15 : 0);
    const open = roundTo(s.base * (1 + rng.range(-0.012, 0.012)), s.digits);
    const slDistance = roundTo(open * rng.range(0.0025, 0.006), s.digits) || 10 ** -s.digits * 50;
    let volume = Math.max(0.01, Math.round((risk / (slDistance * s.contract * 100)) * 100) / 100);
    if (volume > 50) volume = 50;
    const commission = -Math.round(s.commissionPerLot * volume);
    const grossTarget = alloc - commission;
    const dir = side === "buy" ? 1 : -1;
    const move = grossTarget / (s.contract * volume * 100);
    const close = roundTo(open + dir * move, s.digits);
    const gross = grossFor(symbol, side, volume, open, close);
    const riskCents = Math.round(slDistance * s.contract * volume * 100);
    const mae =
      gross >= 0
        ? -Math.round(riskCents * rng.range(0.08, 0.55))
        : Math.max(-riskCents, Math.round(gross * rng.range(1.0, 1.25)));
    let maeFinal = Math.min(0, mae);
    if (room !== undefined) {
      const left = room + Math.min(0, cumulative) + commission;
      maeFinal = Math.max(maeFinal, -Math.floor(Math.max(0, left) * 0.85));
      if (gross < maeFinal) maeFinal = gross;
    }
    cumulative += gross + commission;
    const openTime = Math.round(spec.startTs + i * slot + rng.range(0.05, 0.25) * slot);
    const closeTime = Math.round(openTime + rng.range(0.35, 0.7) * slot);
    const stopLoss = roundTo(open - dir * slDistance, s.digits);
    const takeProfit = roundTo(open + dir * slDistance * rng.range(1.4, 2.6), s.digits);
    out.push({
      id: spec.nextId(),
      accountId: spec.accountId,
      symbol,
      side,
      volume,
      openTime,
      closeTime,
      openPrice: open,
      closePrice: close,
      stopLoss,
      takeProfit,
      grossPnl: gross,
      commission,
      swap: 0,
      mae: maeFinal,
      status: "closed",
      closeReason: gross < 0 && Math.abs(gross) > riskCents * 0.92 ? "sl" : gross > 0 && rng.next() < 0.5 ? "tp" : "manual",
    });
  }
  return out;
}

/** A single losing trade whose adverse excursion reaches `lossToFloor` (gross, positive). */
export function generateBreachTrade(spec: {
  accountId: string;
  ts: number;
  lossGross: Cents;
  nextId: () => string;
  rng: Rng;
}): Trade {
  const symbol = "XAUUSD";
  const s = SYMBOLS[symbol];
  const open = roundTo(s.base * (1 + spec.rng.range(-0.01, 0.01)), s.digits);
  const volume = Math.max(0.01, Math.round((spec.lossGross / (open * 0.006 * s.contract * 100)) * 100) / 100);
  const move = spec.lossGross / (s.contract * volume * 100);
  const close = roundTo(open - move, s.digits);
  const gross = grossFor(symbol, "buy", volume, open, close);
  return {
    id: spec.nextId(),
    accountId: spec.accountId,
    symbol,
    side: "buy",
    volume,
    openTime: spec.ts,
    closeTime: spec.ts + 25 * 60_000,
    openPrice: open,
    closePrice: close,
    stopLoss: roundTo(open * 0.99, s.digits),
    grossPnl: gross,
    commission: -Math.round(s.commissionPerLot * volume),
    swap: 0,
    mae: gross,
    status: "closed",
    closeReason: "breach",
  };
}

export function openPositionTrade(spec: {
  accountId: string;
  ts: number;
  size: Cents;
  riskBps: number;
  nextId: () => string;
  rng: Rng;
  symbol?: string;
}): Trade {
  const symbol = spec.symbol ?? spec.rng.pick(["EURUSD", "XAUUSD", "US100"]);
  const s = SYMBOLS[symbol];
  const side: Side = spec.rng.next() < 0.5 ? "buy" : "sell";
  const dir = side === "buy" ? 1 : -1;
  const open = roundTo(s.base * (1 + spec.rng.range(-0.01, 0.01)), s.digits);
  const slDistance = roundTo(open * 0.004, s.digits);
  const risk = (spec.size * spec.riskBps) / 10_000;
  const volume = Math.max(0.01, Math.round((risk / (slDistance * s.contract * 100)) * 100) / 100);
  return {
    id: spec.nextId(),
    accountId: spec.accountId,
    symbol,
    side,
    volume,
    openTime: spec.ts,
    openPrice: open,
    markPrice: open,
    stopLoss: roundTo(open - dir * slDistance, s.digits),
    takeProfit: roundTo(open + dir * slDistance * 2, s.digits),
    grossPnl: 0,
    commission: -Math.round(s.commissionPerLot * volume),
    swap: 0,
    mae: 0,
    status: "open",
  };
}

/** Move an open trade's mark so its gross P&L changes by `deltaGross` (approximately). */
export function moveMark(t: Trade, deltaGross: Cents): Trade {
  const s = SYMBOLS[t.symbol];
  const dir = t.side === "buy" ? 1 : -1;
  const mark = roundTo((t.markPrice ?? t.openPrice) + (dir * deltaGross) / (s.contract * t.volume * 100), s.digits);
  const gross = grossFor(t.symbol, t.side, t.volume, t.openPrice, mark);
  return { ...t, markPrice: mark, grossPnl: gross, mae: Math.min(t.mae, gross) };
}

export function closeAtMark(t: Trade, ts: number, reason: Trade["closeReason"] = "manual"): Trade {
  return {
    ...t,
    status: "closed",
    closeTime: ts,
    closePrice: t.markPrice ?? t.openPrice,
    markPrice: undefined,
    closeReason: reason,
  };
}
