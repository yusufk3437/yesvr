import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  isMarketOpen,
  nextResetAfter,
  resetsBetween,
  tradingDayKey,
  tradingDayStart,
  zonedToUtc,
} from "./time";

const NY = "America/New_York";

describe("trading day boundaries (17:00 America/New_York)", () => {
  it("assigns 16:59 NY to the current day and 17:00 NY to the next day", () => {
    // 2026-11-10 is a Tuesday; NY is UTC−5 after DST ended on 2026-11-01.
    const before = zonedToUtc(2026, 11, 10, 16, 59, NY);
    const atReset = zonedToUtc(2026, 11, 10, 17, 0, NY);
    expect(tradingDayKey(before, NY, 17)).toBe("2026-11-10");
    expect(tradingDayKey(atReset, NY, 17)).toBe("2026-11-11");
    expect(new Date(atReset).toISOString()).toBe("2026-11-10T22:00:00.000Z");
  });

  it("follows daylight saving time: reset is 21:00 UTC in summer and 22:00 UTC in winter", () => {
    expect(new Date(tradingDayStart("2026-07-15", NY, 17)).toISOString()).toBe("2026-07-14T21:00:00.000Z");
    expect(new Date(tradingDayStart("2026-12-15", NY, 17)).toISOString()).toBe("2026-12-14T22:00:00.000Z");
  });

  it("handles the DST switch day (2026-03-08) without skipping or doubling a reset", () => {
    const from = Date.parse("2026-03-06T12:00:00Z");
    const to = Date.parse("2026-03-10T12:00:00Z");
    const resets = resetsBetween(from, to, NY, 17).map((r) => new Date(r).toISOString());
    expect(resets).toEqual([
      "2026-03-06T22:00:00.000Z",
      "2026-03-07T22:00:00.000Z",
      "2026-03-08T21:00:00.000Z",
      "2026-03-09T21:00:00.000Z",
    ]);
  });

  it("treats Friday 17:00 NY → Sunday 17:00 NY as market closed", () => {
    expect(isMarketOpen(zonedToUtc(2026, 11, 6, 16, 0, NY), NY, 17)).toBe(true); // Fri
    expect(isMarketOpen(zonedToUtc(2026, 11, 7, 12, 0, NY), NY, 17)).toBe(false); // Sat
    expect(isMarketOpen(zonedToUtc(2026, 11, 8, 18, 0, NY), NY, 17)).toBe(true); // Sun evening = Monday session
  });

  it("nextResetAfter is strictly after the given instant", () => {
    const r = zonedToUtc(2026, 11, 10, 17, 0, NY);
    expect(nextResetAfter(r, NY, 17)).toBe(zonedToUtc(2026, 11, 11, 17, 0, NY));
  });

  it("adds business days skipping weekends", () => {
    const fri = Date.parse("2026-11-06T12:00:00Z");
    expect(new Date(addBusinessDays(fri, 2)).toISOString().slice(0, 10)).toBe("2026-11-10");
  });
});
