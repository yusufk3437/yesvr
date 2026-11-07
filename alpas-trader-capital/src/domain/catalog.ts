/**
 * Single source of truth for programmes, prices, rule versions and payout
 * policy. Marketing pages, checkout, dashboard, rule engine and ALPAS Assistant
 * all read from here (or from the demo store's copy seeded from here).
 *
 * Status: ALPAS draft product decision — see docs/product-decisions.md.
 */
import { usd } from "./money";
import type { PhaseRules, Program, ProgramId, PromoCode, RuleSet } from "./types";

const NY = "America/New_York";

const ascentEval = (kind: "phase1" | "phase2", targetBps: number, minDays: number): PhaseRules => ({
  kind,
  label: kind === "phase1" ? { en: "Phase 1", tr: "Aşama 1" } : { en: "Phase 2", tr: "Aşama 2" },
  profitTargetBps: targetBps,
  dailyLossBps: 500,
  dailyReference: "higher_of_balance_equity_at_reset",
  maxLoss: { type: "static", bps: 1000 },
  minTradingDays: minDays,
  consistency: null,
  perTradeRiskBps: null,
  newsTrading: "allowed",
  weekendHolding: true,
  timeLimitDays: null,
  inactivityDays: 30,
  leverage: { en: "FX 1:50 · Metals & indices 1:20", tr: "FX 1:50 · Metal ve endeksler 1:20" },
});

const ascentFunded: PhaseRules = {
  ...ascentEval("phase1", 0, 0),
  kind: "funded",
  label: { en: "Funded", tr: "Funded" },
  profitTargetBps: null,
  minTradingDays: 0,
  newsTrading: "restricted_2min",
};

const ascentPayout = (firstAfterDays: number) => ({
  profitSplitBps: 8000,
  scaledProfitSplitBps: 9000,
  firstPayoutAfterDays: firstAfterDays,
  cycleDays: 14,
  minRequestBps: 50,
  minTradingDaysPerCycle: 4,
  requireFlatPositions: true,
  feeRefund: "with_first_paid_payout" as const,
  consistency: null,
  newsProfitExcluded: true,
  reviewTargetBusinessDays: 2,
  processingTargetBusinessDays: 3,
});

const scaling = {
  reviewEveryMonths: 4,
  minNetProfitBps: 1000,
  minPaidPayouts: 2,
  increaseBps: 2500,
  maxCombinedNominal: usd(1_000_000),
};

export const RULE_SETS: RuleSet[] = [
  {
    id: "ascent@1.0",
    programId: "ascent",
    version: "1.0",
    publishedAt: "2026-08-01",
    changelog: [{ en: "Initial publication.", tr: "İlk yayın." }],
    timezone: NY,
    dailyResetHour: 17,
    breachOnEqual: true,
    phases: [ascentEval("phase1", 800, 5), ascentEval("phase2", 500, 5), ascentFunded],
    payout: ascentPayout(21),
    scaling,
    copyTradingMaxCombined: usd(400_000),
    eaMaxServerRequestsPerDay: 2000,
  },
  {
    id: "ascent@1.1",
    programId: "ascent",
    version: "1.1",
    publishedAt: "2026-10-15",
    changelog: [
      {
        en: "Minimum trading days per evaluation phase reduced from 5 to 4.",
        tr: "Değerlendirme aşaması başına minimum işlem günü 5'ten 4'e indirildi.",
      },
      {
        en: "First payout eligibility shortened from 21 to 14 days after the first funded trade.",
        tr: "İlk payout uygunluğu, ilk funded işlemden sonraki 21 günden 14 güne kısaltıldı.",
      },
    ],
    timezone: NY,
    dailyResetHour: 17,
    breachOnEqual: true,
    phases: [ascentEval("phase1", 800, 4), ascentEval("phase2", 500, 4), ascentFunded],
    payout: ascentPayout(14),
    scaling,
    copyTradingMaxCombined: usd(400_000),
    eaMaxServerRequestsPerDay: 2000,
  },
  {
    id: "ridge@1.0",
    programId: "ridge",
    version: "1.0",
    publishedAt: "2026-09-01",
    changelog: [{ en: "Initial publication.", tr: "İlk yayın." }],
    timezone: NY,
    dailyResetHour: 17,
    breachOnEqual: true,
    phases: [
      {
        kind: "phase1",
        label: { en: "Evaluation", tr: "Değerlendirme" },
        profitTargetBps: 1000,
        dailyLossBps: 300,
        dailyReference: "higher_of_balance_equity_at_reset",
        maxLoss: { type: "trailing_eod", bps: 600, lockAt: "initial_balance" },
        minTradingDays: 3,
        consistency: { bestDayMaxBps: 5000, scope: "phase", effect: "blocks_completion" },
        perTradeRiskBps: 200,
        newsTrading: "allowed",
        weekendHolding: false,
        timeLimitDays: null,
        inactivityDays: 30,
        leverage: { en: "FX 1:30 · Metals & indices 1:10", tr: "FX 1:30 · Metal ve endeksler 1:10" },
      },
      {
        kind: "funded",
        label: { en: "Funded", tr: "Funded" },
        profitTargetBps: null,
        dailyLossBps: 300,
        dailyReference: "higher_of_balance_equity_at_reset",
        maxLoss: { type: "trailing_eod", bps: 600, lockAt: "initial_balance" },
        minTradingDays: 0,
        consistency: null,
        perTradeRiskBps: 200,
        newsTrading: "restricted_2min",
        weekendHolding: false,
        timeLimitDays: null,
        inactivityDays: 30,
        leverage: { en: "FX 1:30 · Metals & indices 1:10", tr: "FX 1:30 · Metal ve endeksler 1:10" },
      },
    ],
    payout: {
      profitSplitBps: 8000,
      scaledProfitSplitBps: 9000,
      firstPayoutAfterDays: 14,
      cycleDays: 14,
      minRequestBps: 50,
      minTradingDaysPerCycle: 4,
      requireFlatPositions: true,
      feeRefund: "with_first_paid_payout",
      consistency: { bestDayMaxBps: 4000, scope: "payout_cycle", effect: "blocks_payout" },
      newsProfitExcluded: true,
      reviewTargetBusinessDays: 2,
      processingTargetBusinessDays: 3,
    },
    scaling,
    copyTradingMaxCombined: usd(400_000),
    eaMaxServerRequestsPerDay: 2000,
  },
];

export const PROGRAMS: Program[] = [
  {
    id: "ascent",
    code: "ASC",
    name: { en: "ALPAS Ascent", tr: "ALPAS Ascent" },
    model: { en: "Two-step evaluation", tr: "İki aşamalı değerlendirme" },
    steps: 2,
    tagline: {
      en: "Two measured stages, wider limits, a static floor.",
      tr: "İki ölçülü aşama, geniş limitler, sabit taban.",
    },
    summary: {
      en: "Reach 8% then 5% while staying inside a 5% daily and 10% static overall loss limit. Built for traders who prefer room to manage positions.",
      tr: "%5 günlük ve %10 sabit toplam zarar sınırı içinde kalarak önce %8, sonra %5 hedefine ulaşın. Pozisyonlarını yönetmek için alan isteyen trader'lar için.",
    },
    currency: "USD",
    sizes: [
      { size: usd(10_000), price: usd(89) },
      { size: usd(25_000), price: usd(179) },
      { size: usd(50_000), price: usd(289) },
      { size: usd(100_000), price: usd(479) },
      { size: usd(200_000), price: usd(899) },
    ],
    currentRuleSetId: "ascent@1.1",
    platforms: ["mt5", "ctrader"],
  },
  {
    id: "ridge",
    code: "RDG",
    name: { en: "ALPAS Ridge", tr: "ALPAS Ridge" },
    model: { en: "One-step evaluation", tr: "Tek aşamalı değerlendirme" },
    steps: 1,
    tagline: {
      en: "One stage, tighter limits, a trailing floor that locks.",
      tr: "Tek aşama, daha sıkı limitler, kilitlenen trailing taban.",
    },
    summary: {
      en: "Reach 10% in a single stage with a 3% daily limit and a 6% end-of-day trailing floor that locks at your starting balance. A best-day rule keeps results consistent.",
      tr: "%3 günlük limit ve başlangıç bakiyesinde kilitlenen %6 gün sonu trailing tabanla tek aşamada %10'a ulaşın. En iyi gün kuralı sonuçların tutarlı olmasını sağlar.",
    },
    currency: "USD",
    sizes: [
      { size: usd(10_000), price: usd(109) },
      { size: usd(25_000), price: usd(219) },
      { size: usd(50_000), price: usd(339) },
      { size: usd(100_000), price: usd(559) },
    ],
    currentRuleSetId: "ridge@1.0",
    platforms: ["mt5", "ctrader"],
  },
];

export const PROMO_CODES: PromoCode[] = [
  {
    code: "ASCENT10",
    bps: 1000,
    programIds: ["ascent"],
    validUntil: "2027-01-31",
    label: { en: "Launch code: 10% off ALPAS Ascent", tr: "Lansman kodu: ALPAS Ascent'te %10 indirim" },
  },
];

/** Illustrative only — final list subject to legal review (docs/product-decisions.md §7). */
export const RESTRICTED_COUNTRIES = ["KP", "IR", "SY", "CU"];

export const COUNTRIES: { code: string; en: string; tr: string }[] = [
  { code: "TR", en: "Türkiye", tr: "Türkiye" },
  { code: "DE", en: "Germany", tr: "Almanya" },
  { code: "GB", en: "United Kingdom", tr: "Birleşik Krallık" },
  { code: "NL", en: "Netherlands", tr: "Hollanda" },
  { code: "AE", en: "United Arab Emirates", tr: "Birleşik Arap Emirlikleri" },
  { code: "PL", en: "Poland", tr: "Polonya" },
  { code: "ES", en: "Spain", tr: "İspanya" },
  { code: "BR", en: "Brazil", tr: "Brezilya" },
  { code: "ZA", en: "South Africa", tr: "Güney Afrika" },
  { code: "IN", en: "India", tr: "Hindistan" },
  { code: "KP", en: "North Korea", tr: "Kuzey Kore" },
  { code: "IR", en: "Iran", tr: "İran" },
  { code: "SY", en: "Syria", tr: "Suriye" },
  { code: "CU", en: "Cuba", tr: "Küba" },
];

export const PLATFORMS: Record<string, { name: string; note: { en: string; tr: string } }> = {
  mt5: {
    name: "MetaTrader 5",
    note: { en: "Planned integration — simulated in this prototype", tr: "Planlanan entegrasyon — bu prototipte simüle" },
  },
  ctrader: {
    name: "cTrader",
    note: { en: "Planned integration — simulated in this prototype", tr: "Planlanan entegrasyon — bu prototipte simüle" },
  },
};

/** Simulated instruments. All quoted in USD so P&L needs no conversion. */
export const SYMBOLS: Record<
  string,
  { contract: number; digits: number; base: number; commissionPerLot: number; swapPerLotNight: number; kind: "fx" | "metal" | "index" }
> = {
  EURUSD: { contract: 100_000, digits: 5, base: 1.162, commissionPerLot: 700, swapPerLotNight: -650, kind: "fx" },
  GBPUSD: { contract: 100_000, digits: 5, base: 1.318, commissionPerLot: 700, swapPerLotNight: -520, kind: "fx" },
  AUDUSD: { contract: 100_000, digits: 5, base: 0.657, commissionPerLot: 700, swapPerLotNight: -310, kind: "fx" },
  XAUUSD: { contract: 100, digits: 2, base: 4085, commissionPerLot: 700, swapPerLotNight: -2400, kind: "metal" },
  US100: { contract: 1, digits: 1, base: 25_400, commissionPerLot: 0, swapPerLotNight: -180, kind: "index" },
  US30: { contract: 1, digits: 1, base: 46_800, commissionPerLot: 0, swapPerLotNight: -260, kind: "index" },
};

export const PAYOUT_METHODS = [
  {
    id: "bank_transfer_demo" as const,
    label: { en: "Bank transfer (demo placeholder)", tr: "Banka havalesi (demo yer tutucu)" },
    masked: "IBAN •••• 0000 (demo)",
  },
  {
    id: "stablecoin_demo" as const,
    label: { en: "Stablecoin wallet (demo placeholder)", tr: "Stablecoin cüzdanı (demo yer tutucu)" },
    masked: "0x00…0000 (demo)",
  },
];

export const CONTRACT_VERSION = "TA-2026.1";

export function getProgram(id: ProgramId, programs: Program[] = PROGRAMS): Program {
  const p = programs.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown program ${id}`);
  return p;
}

export function getRuleSet(id: string, ruleSets: RuleSet[] = RULE_SETS): RuleSet {
  const r = ruleSets.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown rule set ${id}`);
  return r;
}

export function currentRuleSet(programId: ProgramId, programs = PROGRAMS, ruleSets = RULE_SETS): RuleSet {
  return getRuleSet(getProgram(programId, programs).currentRuleSetId, ruleSets);
}

export function priceFor(programId: ProgramId, size: number, programs = PROGRAMS) {
  const option = getProgram(programId, programs).sizes.find((s) => s.size === size);
  if (!option) throw new Error(`Size ${size} not offered for ${programId}`);
  return option.price;
}

export function findPromo(code: string, programId: ProgramId, today: string, promos = PROMO_CODES) {
  const promo = promos.find((p) => p.code === code.trim().toUpperCase());
  if (!promo) return { ok: false as const, error: "promo_unknown" as const };
  if (!promo.programIds.includes(programId)) return { ok: false as const, error: "promo_not_applicable" as const };
  if (today > promo.validUntil) return { ok: false as const, error: "promo_expired" as const };
  return { ok: true as const, promo };
}

export const evaluationPhases = (rs: RuleSet) => rs.phases.filter((p) => p.kind !== "funded");
export const fundedPhase = (rs: RuleSet) => {
  const f = rs.phases.find((p) => p.kind === "funded");
  if (!f) throw new Error(`Rule set ${rs.id} has no funded phase`);
  return f;
};
