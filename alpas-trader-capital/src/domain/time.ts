/**
 * Trading-day arithmetic in an IANA time zone, DST-safe, without dependencies.
 *
 * A trading day runs from `resetHour` local time to the next `resetHour`.
 * With reset 17:00 America/New_York, the session that starts Monday 17:00 NY
 * and ends Tuesday 17:00 NY is keyed "Tuesday" (FX value-date convention).
 */
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wallClock(ts: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Local wall clock of `ts` expressed as if it were UTC (naive). */
function naiveLocalMs(ts: number, timeZone: string): number {
  const w = wallClock(ts, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** Offset local − UTC in ms at instant `ts`. */
export function tzOffsetMs(ts: number, timeZone: string): number {
  const flooredTs = Math.floor(ts / 1000) * 1000;
  return naiveLocalMs(flooredTs, timeZone) - flooredTs;
}

/** UTC instant for a local wall-clock time. Non-existent times (DST gap) resolve forward. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let guess = naive - tzOffsetMs(naive, timeZone);
  const second = naive - tzOffsetMs(guess, timeZone);
  if (second !== guess) guess = second;
  return guess;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKeyFromUtcDate = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  return dayKeyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** 0 = Sunday … 6 = Saturday, for the calendar date of a day key. */
export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export const isWeekdayKey = (key: string) => {
  const wd = weekdayOfKey(key);
  return wd >= 1 && wd <= 5;
};

export function tradingDayKey(ts: number, timeZone: string, resetHour: number): string {
  const shiftHours = (24 - resetHour) % 24;
  const shifted = naiveLocalMs(ts, timeZone) + shiftHours * HOUR_MS;
  return dayKeyFromUtcDate(new Date(shifted));
}

/** Instant at which trading day `key` starts. */
export function tradingDayStart(key: string, timeZone: string, resetHour: number): number {
  const startDateKey = resetHour === 0 ? key : addDaysToKey(key, -1);
  const { year, month, day } = parseDayKey(startDateKey);
  return zonedToUtc(year, month, day, resetHour, 0, timeZone);
}

export function tradingDayEnd(key: string, timeZone: string, resetHour: number): number {
  return tradingDayStart(addDaysToKey(key, 1), timeZone, resetHour);
}

/** Next reset instant strictly after `ts`. */
export function nextResetAfter(ts: number, timeZone: string, resetHour: number): number {
  return tradingDayEnd(tradingDayKey(ts, timeZone, resetHour), timeZone, resetHour);
}

/** Every reset instant r with from < r <= to. */
export function resetsBetween(from: number, to: number, timeZone: string, resetHour: number): number[] {
  const out: number[] = [];
  let r = nextResetAfter(from, timeZone, resetHour);
  let guard = 0;
  while (r <= to && guard < 5000) {
    out.push(r);
    r = nextResetAfter(r, timeZone, resetHour);
    guard++;
  }
  return out;
}

/** FX week: closed from Friday reset until Sunday reset (trading-day keys Sat/Sun). */
export function isMarketOpen(ts: number, timeZone: string, resetHour: number): boolean {
  return isWeekdayKey(tradingDayKey(ts, timeZone, resetHour));
}

/** The n most recent weekday trading-day keys strictly before `key`, oldest first. */
export function previousTradingDayKeys(key: string, n: number): string[] {
  const out: string[] = [];
  let k = key;
  while (out.length < n) {
    k = addDaysToKey(k, -1);
    if (isWeekdayKey(k)) out.unshift(k);
  }
  return out;
}

/** Add business days (Mon–Fri) to a timestamp; used for target processing times. */
export function addBusinessDays(ts: number, days: number): number {
  let t = ts;
  let added = 0;
  while (added < days) {
    t += DAY_MS;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return t;
}

export function formatInZone(
  ts: number,
  timeZone: string,
  locale: "en" | "tr",
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { timeZone, ...opts }).format(
    new Date(ts),
  );
}
