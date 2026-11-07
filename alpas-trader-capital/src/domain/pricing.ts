/**
 * Pricing for standard and "What is your budget?" (custom size) plans.
 *
 * Standard plans carry the full volume advantage. A custom size is priced on
 * the piecewise-linear curve through the standard prices, plus a premium, so
 * its advantage stays slightly below the standard plans. Promotions apply to
 * custom sizes at a reduced rate. See docs/product-decisions.md §2.1.
 */
import { applyBps, type Cents } from "./money";
import type { Program, PromoCode, SizeOption } from "./types";

export type SizeError = "size_below_min" | "size_above_max" | "size_step" | "size_invalid";

export function isStandardSize(program: Program, size: Cents) {
  return program.sizes.some((s) => s.size === size);
}

export function validateCustomSize(program: Program, size: Cents): SizeError | null {
  const c = program.customSizing;
  if (!Number.isSafeInteger(size) || size <= 0) return "size_invalid";
  if (size < c.minSize) return "size_below_min";
  if (size > c.maxSize) return "size_above_max";
  if (size % c.step !== 0) return "size_step";
  return null;
}

/** Interpolated standard price at `size` (between the neighbouring standard sizes). */
export function curvePrice(program: Program, size: Cents): Cents {
  const pts = [...program.sizes].sort((a, b) => a.size - b.size);
  if (size <= pts[0].size) return Math.round((pts[0].price * size) / pts[0].size);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (size <= b.size) return Math.round(a.price + ((b.price - a.price) * (size - a.size)) / (b.size - a.size));
  }
  const last = pts[pts.length - 1];
  return Math.round((last.price * size) / last.size);
}

/** Custom-size fee: curve × (1 + premium), rounded up to whole dollars. */
export function customPrice(program: Program, size: Cents): Cents {
  const raw = curvePrice(program, size) + applyBps(curvePrice(program, size), program.customSizing.premiumBps);
  return Math.ceil(raw / 100) * 100;
}

export interface SizeQuote {
  size: Cents;
  price: Cents;
  custom: boolean;
  /** A standard plan of equal or larger size that costs the same or less. */
  betterStandard: SizeOption | null;
}

export function quoteSize(program: Program, size: Cents): SizeQuote | { error: SizeError } {
  const std = program.sizes.find((s) => s.size === size);
  if (std) return { size, price: std.price, custom: false, betterStandard: null };
  const err = validateCustomSize(program, size);
  if (err) return { error: err };
  const price = customPrice(program, size);
  const betterStandard = [...program.sizes].sort((a, b) => a.size - b.size).find((s) => s.size > size && s.price <= price) ?? null;
  return { size, price, custom: true, betterStandard };
}

/** Largest plan (standard or custom) whose fee fits within `budget`. */
export function bestSizeForBudget(program: Program, budget: Cents): SizeQuote | null {
  const c = program.customSizing;
  let best: SizeQuote | null = null;
  for (let size = c.minSize; size <= c.maxSize; size += c.step) {
    const q = quoteSize(program, size);
    if ("error" in q || q.price > budget) continue;
    if (!best || q.size > best.size) best = q;
  }
  for (const s of program.sizes) {
    if (s.price <= budget && (!best || s.size > best.size || (s.size === best.size && s.price < best.price)))
      best = { size: s.size, price: s.price, custom: false, betterStandard: null };
  }
  return best;
}

/** Effective promotion rate: full on standard plans, reduced on custom sizes. */
export function promoBpsFor(program: Program, promo: PromoCode, custom: boolean): number {
  return custom ? Math.floor((promo.bps * program.customSizing.promoFactorBps) / 10_000) : promo.bps;
}

/** Price per $1,000 of simulated size, for comparisons in the UI. */
export const pricePerThousand = (price: Cents, size: Cents) => (price * 100_000) / size;
