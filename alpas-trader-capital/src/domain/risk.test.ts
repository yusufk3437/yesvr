import { describe, expect, it } from "vitest";
import { getRuleSet } from "./catalog";
import { usd } from "./money";
import { dailyFloorFor, evaluateRisk, tradeStats, trailingFloorFor } from "./risk";
import { zonedToUtc } from "./time";
import type { LedgerEntry, Trade } from "./types";

const NY = "America/New_York";
const at = (d: number, h: number, m = 0) => zonedToUtc(2026, 11, d, h, m, NY); // Nov 2026, NY local
const ascent = getRuleSet("ascent@1.1");
const ridge = getRuleSet("ridge@1.0");

let seq = 0;
function closed(open: number, close: number, gross: number, extra: Partial<Trade> = {}): Trade {
  return {
    id: `t${++seq}`,
    accountId: "A",
    symbol: "EURUSD",
    side: "buy",
    volume: 1,
    openTime: open,
    closeTime: close,
    openPrice: 1.1,
    closePrice: 1.1 + gross / 10_000_000,
    stopLoss: 1.095,
    grossPnl: gross,
    commission: 0,
    swap: 0,
    mae: Math.min(0, gross),
    status: "closed",
    ...extra,
  };
}
function open(openAt: number, floatingGross: number, extra: Partial<Trade> = {}): Trade {
  return { ...closed(openAt, openAt, floatingGross, extra), closeTime: undefined, closePrice: undefined, status: "open", markPrice: 1.1, ...extra };
}

const base = (rs = ascent, phaseIndex = 0) => ({
  ruleSet: rs,
  phase: rs.phases[phaseIndex],
  initialBalance: usd(100_000),
  startedAt: at(9, 10),
  ledger: [] as LedgerEntry[],
});

describe("daily loss limit", () => {
  it("uses the higher of balance and equity at the reset as reference", () => {
    // Monday session closes +$2,000 → reference at the 17:00 reset = $102,000.
    const trades = [closed(at(9, 11), at(9, 12), usd(2_000))];
    const ev = evaluateRisk({ ...base(), trades, now: at(10, 9) });
    expect(ev.dayReference).toBe(usd(102_000));
    expect(ev.dailyFloor).toBe(usd(97_000)); // 102,000 − 5% × 100,000
    expect(ev.dailyRemaining).toBe(usd(5_000));
  });

  it("breaches when equity touches the floor exactly (equality counts)", () => {
    const trades = [closed(at(10, 3), at(10, 4), -usd(5_000), { mae: -usd(5_000) })];
    const ev = evaluateRisk({ ...base(), trades, now: at(10, 6) });
    expect(ev.breach?.type).toBe("daily_loss");
    expect(ev.breach?.limit).toBe(usd(95_000));
  });

  it("does not breach one cent above the floor", () => {
    const trades = [closed(at(10, 3), at(10, 4), -usd(5_000) + 1, { mae: -usd(5_000) + 1 })];
    const ev = evaluateRisk({ ...base(), trades, now: at(10, 6) });
    expect(ev.breach).toBeNull();
    expect(ev.dailyRemaining).toBe(1);
  });

  it("counts open floating loss, commission and swap in equity", () => {
    const pos = open(at(10, 3), -usd(4_990), { commission: -usd(7), swap: -usd(4), mae: -usd(4_990) });
    const ev = evaluateRisk({ ...base(), trades: [pos], now: at(10, 8) });
    expect(ev.openPnl).toBe(-usd(5_001));
    expect(ev.breach?.type).toBe("daily_loss");
  });

  it("resets at 17:00 New York: a loss before and after the reset are separate days", () => {
    const trades = [
      closed(at(10, 15), at(10, 16, 30), -usd(3_000)),
      closed(at(10, 17, 30), at(10, 18), -usd(3_000)),
    ];
    const ev = evaluateRisk({ ...base(), trades, now: at(10, 19) });
    expect(ev.breach).toBeNull();
    expect(ev.dayReference).toBe(usd(97_000));
    expect(ev.dailyRemaining).toBe(usd(2_000));
    expect(ev.days.map((d) => d.key)).toEqual(["2026-11-10", "2026-11-11"]);
  });

  it("helper formula matches the engine", () => {
    expect(dailyFloorFor(usd(102_000), usd(100_000), 500)).toBe(usd(97_000));
  });
});

describe("maximum loss", () => {
  it("static floor stays at initial − 10% regardless of profit", () => {
    const trades = [closed(at(9, 11), at(9, 12), usd(6_000))];
    const ev = evaluateRisk({ ...base(), trades, now: at(10, 9) });
    expect(ev.maxFloor).toBe(usd(90_000));
  });

  it("end-of-day trailing follows the highest balance at reset, not intraday peaks, and locks at the initial balance", () => {
    const rb = base(ridge);
    const day1 = [closed(at(9, 11), at(9, 12), usd(3_000))];
    const ev1 = evaluateRisk({ ...rb, trades: day1, now: at(9, 14) });
    expect(ev1.maxFloor).toBe(usd(94_000)); // reset not reached yet
    const ev2 = evaluateRisk({ ...rb, trades: day1, now: at(10, 9) });
    expect(ev2.highWaterMark).toBe(usd(103_000));
    expect(ev2.maxFloor).toBe(usd(97_000));
    const more = [...day1, closed(at(10, 9), at(10, 10), usd(5_000))];
    const ev3 = evaluateRisk({ ...rb, trades: more, now: at(11, 9) });
    expect(ev3.maxFloor).toBe(usd(100_000));
    expect(ev3.trailingLocked).toBe(true);
    expect(trailingFloorFor(usd(110_000), usd(100_000), 600)).toBe(usd(100_000));
  });
});

describe("payout reserve does not count as a loss", () => {
  it("shifts the daily reference and trailing HWM down by the reserved amount", () => {
    const rb = base(ridge, 1);
    const trades = [closed(at(9, 11), at(9, 12), usd(8_000))];
    const ledger: LedgerEntry[] = [{ id: "l1", accountId: "A", ts: at(10, 10), type: "payout_reserve", amount: usd(8_000), payoutId: "p" }];
    const ev = evaluateRisk({ ...rb, trades, ledger, now: at(10, 11) });
    expect(ev.breach).toBeNull();
    expect(ev.balance).toBe(usd(100_000));
    expect(ev.reserved).toBe(usd(8_000));
    expect(ev.dayReference).toBe(usd(100_000));
    expect(ev.maxFloor).toBe(usd(94_000)); // HWM 108k → 100k after the reserve
    expect(ev.dailyRemaining).toBe(usd(3_000));
  });

  it("restores everything when the reserve is released", () => {
    const rb = base(ridge, 1);
    const trades = [closed(at(9, 11), at(9, 12), usd(8_000))];
    const ledger: LedgerEntry[] = [
      { id: "l1", accountId: "A", ts: at(10, 10), type: "payout_reserve", amount: usd(8_000), payoutId: "p" },
      { id: "l2", accountId: "A", ts: at(10, 12), type: "payout_release", amount: usd(8_000), payoutId: "p" },
    ];
    const ev = evaluateRisk({ ...rb, trades, ledger, now: at(10, 13) });
    expect(ev.balance).toBe(usd(108_000));
    expect(ev.reserved).toBe(0);
    expect(ev.maxFloor).toBe(usd(100_000));
  });
});

describe("objectives", () => {
  it("counts a trading day by the day a position was opened", () => {
    const trades = [
      closed(at(9, 16, 50), at(9, 17, 10), usd(100)), // opened Monday session, closed Tuesday session
      closed(at(10, 9), at(10, 9, 30), usd(100)),
    ];
    const ev = evaluateRisk({ ...base(), trades, now: at(11, 9) });
    expect(ev.tradingDays).toBe(2);
  });

  it("requires target, minimum days and flat positions to complete", () => {
    const keys = [9, 10, 11, 12];
    const trades = keys.map((d) => closed(at(d, 9), at(d, 10), usd(2_100)));
    const evDone = evaluateRisk({ ...base(), trades, now: at(12, 12) });
    expect(evDone.completion.ready).toBe(true);
    const withOpen = [...trades, open(at(12, 11), usd(50))];
    expect(evaluateRisk({ ...base(), trades: withOpen, now: at(12, 12) }).completion.ready).toBe(false);
    const threeDays = trades.slice(0, 3).map((t) => ({ ...t, grossPnl: usd(3_000) }));
    const ev3 = evaluateRisk({ ...base(), trades: threeDays, now: at(12, 12) });
    expect(ev3.completion.targetMet).toBe(true);
    expect(ev3.completion.minDaysMet).toBe(false);
  });

  it("best-day consistency blocks completion on Ridge without being a breach", () => {
    const rb = base(ridge);
    const trades = [
      closed(at(9, 9), at(9, 10), usd(6_000)),
      closed(at(10, 9), at(10, 10), usd(2_500)),
      closed(at(11, 9), at(11, 10), usd(1_600)),
    ];
    const ev = evaluateRisk({ ...rb, trades, now: at(11, 12) });
    expect(ev.completion.targetMet).toBe(true);
    expect(ev.consistency.shareBps).toBe(5941); // 6,000 / 10,100
    expect(ev.completion.consistencyMet).toBe(false);
    expect(ev.breach).toBeNull();
  });

  it("flags per-trade risk above 2% as a soft violation on Ridge", () => {
    const rb = base(ridge);
    // EURUSD 1 lot, SL 50 pips → $500 risk (0.5%) is fine; 5 lots → $2,500 (2.5%) is not.
    const fine = closed(at(9, 9), at(9, 10), usd(100));
    const big = closed(at(9, 11), at(9, 12), usd(100), { volume: 5 });
    const ev = evaluateRisk({ ...rb, trades: [fine, big], now: at(9, 13) });
    expect(ev.violations).toEqual([expect.objectContaining({ type: "per_trade_risk", tradeId: big.id, valueBps: 250 })]);
    expect(ev.objectives.find((o) => o.id === "per_trade_risk")?.status).toBe("warning");
  });

  it("expires after 30 days without a new position", () => {
    const trades = [closed(at(9, 9), at(9, 10), usd(100))];
    const ev = evaluateRisk({ ...base(), trades, now: at(9, 9) + 31 * 86_400_000 });
    expect(ev.breach?.type).toBe("inactivity");
  });
});

describe("trade statistics come from the same trades", () => {
  it("computes win rate, profit factor, expectancy and average R:R", () => {
    const trades = [
      closed(at(9, 9), at(9, 10), usd(600)),
      closed(at(9, 11), at(9, 12), usd(400)),
      closed(at(9, 13), at(9, 14), -usd(250)),
      closed(at(9, 15), at(9, 16), -usd(250)),
    ];
    const st = tradeStats(trades);
    expect(st.winRate).toBe(0.5);
    expect(st.profitFactor).toBe(2);
    expect(st.expectancy).toBe(usd(125));
    expect(st.avgRR).toBe(2);
    expect(st.avgR).toBeCloseTo((1.2 + 0.8 - 0.5 - 0.5) / 4, 6); // risk $500 per trade
  });
});
