import { describe, expect, it } from "vitest";
import { getProgram, PROMO_CODES } from "./catalog";
import { usd } from "./money";
import { bestSizeForBudget, curvePrice, customPrice, pricePerThousand, promoBpsFor, quoteSize, validateCustomSize } from "./pricing";
import { createSeedState } from "@/services/seed";
import * as A from "@/services/actions";

const ascent = getProgram("ascent");
const ridge = getProgram("ridge");

describe("custom size (What is your budget?) pricing", () => {
  it("interpolates the standard curve and adds the custom premium", () => {
    // 25K $179 → 50K $289: 35K on the curve = 179 + 10/25 × 110 = $223; +8 % = $240.84 → $241.
    expect(curvePrice(ascent, usd(35_000))).toBe(usd(223));
    expect(customPrice(ascent, usd(35_000))).toBe(usd(241));
  });

  it("keeps the custom advantage below the standard plans around it", () => {
    for (const size of [15_000, 35_000, 75_000, 150_000].map(usd)) {
      const q = quoteSize(ascent, size);
      if ("error" in q) throw new Error(q.error);
      expect(q.custom).toBe(true);
      expect(q.price).toBeGreaterThan(curvePrice(ascent, size));
    }
    // Price per $1K of a custom 35K is higher than the 50K plan and close to the 25K plan.
    expect(pricePerThousand(customPrice(ascent, usd(35_000)), usd(35_000))).toBeGreaterThan(pricePerThousand(usd(289), usd(50_000)));
  });

  it("returns the standard price for standard sizes", () => {
    expect(quoteSize(ascent, usd(100_000))).toEqual({ size: usd(100_000), price: usd(479), custom: false, betterStandard: null });
  });

  it("validates range and step", () => {
    expect(validateCustomSize(ascent, usd(5_000))).toBe("size_below_min");
    expect(validateCustomSize(ridge, usd(150_000))).toBe("size_above_max");
    expect(validateCustomSize(ascent, usd(37_500))).toBe("size_step");
    expect(validateCustomSize(ascent, usd(35_000))).toBeNull();
  });

  it("points to a larger standard plan when it costs the same or less", () => {
    const q = quoteSize(ascent, usd(95_000));
    if ("error" in q) throw new Error(q.error);
    expect(q.price).toBe(usd(497));
    expect(q.betterStandard?.size).toBe(usd(100_000));
  });

  it("finds the largest plan within a fee budget", () => {
    expect(bestSizeForBudget(ascent, usd(250))?.size).toBe(usd(35_000)); // 40K would cost $265
    expect(bestSizeForBudget(ascent, usd(479))?.size).toBe(usd(100_000));
    expect(bestSizeForBudget(ascent, usd(50))).toBeNull();
  });

  it("applies promotions at a reduced rate on custom sizes", () => {
    const promo = PROMO_CODES[0];
    expect(promoBpsFor(ascent, promo, false)).toBe(1000);
    expect(promoBpsFor(ascent, promo, true)).toBe(700);
  });

  it("purchases a custom 35K challenge whose limits scale with the size", () => {
    const s = createSeedState(Date.parse("2026-11-10T14:00:00Z"));
    const now = Date.parse("2026-11-10T14:00:00Z") + s.clockOffsetMs;
    const reg = A.registerUser(s, { name: "Budget Trader", email: "b@example.com", password: "password1", country: "DE", locale: "en", acceptTerms: true }, now);
    if (!reg.ok) throw new Error(reg.error);
    const actor = { role: "trader" as const, id: reg.value.userId };
    const r = A.purchaseChallenge(s, actor, { programId: "ascent", size: usd(35_000), platform: "mt5", promoCode: "ASCENT10", billing: { name: "Budget Trader", country: "DE" }, paymentMethod: "card_demo", acceptTerms: true, acceptRisk: true }, now);
    if (!r.ok) throw new Error(r.error);
    const order = s.orders.find((o) => o.id === r.value.orderId)!;
    expect(order.custom).toBe(true);
    expect(order.listPrice).toBe(usd(241));
    expect(order.discount).toBe(usd(16.87)); // 7 % instead of 10 %
    expect(A.purchaseChallenge(s, actor, { programId: "ridge", size: usd(37_500), platform: "mt5", billing: { name: "Budget Trader", country: "DE" }, paymentMethod: "card_demo", acceptTerms: true, acceptRisk: true }, now)).toMatchObject({ ok: false, error: "size_step" });
  });
});
