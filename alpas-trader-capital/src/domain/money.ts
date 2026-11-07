import type { Locale } from "./l10n";

/**
 * All monetary values are integer minor units (US cents). Floating point is
 * only used for prices of simulated instruments, never for balances.
 */
export type Cents = number;

export const usd = (dollars: number): Cents => Math.round(dollars * 100);

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be integer cents, got ${value}`);
  return value;
}

/** Round half to even (banker's rounding) for a non-integer cent value. */
export function roundHalfEven(value: number): Cents {
  const floor = Math.floor(value);
  const diff = value - floor;
  const EPS = 1e-9;
  if (diff > 0.5 + EPS) return floor + 1;
  if (diff < 0.5 - EPS) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** amount × bps / 10 000 with banker's rounding. 1 bps = 0.01 %. */
export function applyBps(amount: Cents, bps: number): Cents {
  return roundHalfEven((amount * bps) / 10_000);
}

/** Split an amount so the two parts always add up exactly to the input. */
export function splitByBps(amount: Cents, bps: number): [Cents, Cents] {
  const first = applyBps(amount, bps);
  return [first, amount - first];
}

export const sum = (values: Cents[]): Cents => values.reduce((a, b) => a + b, 0);

const intlLocale = (locale: Locale) => (locale === "tr" ? "tr-TR" : "en-US");

export function formatMoney(
  cents: Cents,
  locale: Locale,
  opts: { sign?: boolean; decimals?: 0 | 2; currency?: string } = {},
): string {
  const { sign = false, decimals = 2, currency = "USD" } = opts;
  const value = cents / 100;
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(value);
  return formatted;
}

/** "100K" style label for nominal account sizes. */
export function formatSize(cents: Cents): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `${dollars / 1_000_000}M`;
  return `${dollars / 1000}K`;
}

export function formatBps(bps: number, locale: Locale, digits = bps % 100 === 0 ? 0 : 1): string {
  const pct = (bps / 100).toFixed(digits);
  const n = locale === "tr" ? pct.replace(".", ",") : pct;
  return locale === "tr" ? `%${n}` : `${n}%`;
}

export function formatRatio(ratio: number, locale: Locale, digits = 1): string {
  const pct = (ratio * 100).toFixed(digits);
  const n = locale === "tr" ? pct.replace(".", ",") : pct;
  return locale === "tr" ? `%${n}` : `${n}%`;
}

export function formatNumber(value: number, locale: Locale, digits = 2): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
