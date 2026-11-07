import type { Messages } from "@/i18n/messages";
import { applyBps, formatBps, formatMoney } from "@/domain/money";
import type { Locale } from "@/domain/l10n";
import type { PhaseRules, RuleSet } from "@/domain/types";
import { fmt } from "@/domain/l10n";

export interface RuleRow {
  key: string;
  label: string;
  values: string[];
}

/** One column per stage; same strings everywhere (home, challenges, checkout). */
export function stageColumns(rs: RuleSet) {
  return rs.phases;
}

export function evaluationRows(rs: RuleSet, size: number, m: Messages, locale: Locale): RuleRow[] {
  const s = m.site.selector;
  const phases = rs.phases.filter((p) => p.kind !== "funded");
  const money = (c: number) => formatMoney(c, locale, { decimals: 0 });
  const pct = (b: number) => formatBps(b, locale);
  const maxLoss = (p: PhaseRules) => `${pct(p.maxLoss.bps)} ${p.maxLoss.type === "static" ? s.static : s.trailing}`;
  return [
    { key: "target", label: s.target, values: phases.map((p) => (p.profitTargetBps ? `${pct(p.profitTargetBps)} · ${money(applyBps(size, p.profitTargetBps))}` : "—")) },
    { key: "daily", label: s.daily, values: phases.map((p) => `${pct(p.dailyLossBps)} · ${money(applyBps(size, p.dailyLossBps))}`) },
    { key: "max", label: s.max, values: phases.map(maxLoss) },
    { key: "minDays", label: s.minDays, values: phases.map((p) => fmt(s.days, { n: p.minTradingDays })) },
    { key: "consistency", label: s.consistency, values: phases.map((p) => (p.consistency ? `≤ ${pct(p.consistency.bestDayMaxBps)}` : s.none)) },
    { key: "perTrade", label: s.perTrade, values: phases.map((p) => (p.perTradeRiskBps ? `≤ ${pct(p.perTradeRiskBps)}` : s.none)) },
    { key: "news", label: s.news, values: phases.map((p) => (p.newsTrading === "allowed" ? s.allowed : s.restricted)) },
    { key: "weekend", label: s.weekend, values: phases.map((p) => (p.weekendHolding ? s.allowed : s.notAllowed)) },
  ];
}

export function fundedRows(rs: RuleSet, size: number, m: Messages, locale: Locale): RuleRow[] {
  const s = m.site.selector;
  const p = rs.phases.find((x) => x.kind === "funded")!;
  const pct = (b: number) => formatBps(b, locale);
  const money = (c: number) => formatMoney(c, locale, { decimals: 0 });
  return [
    { key: "daily", label: s.daily, values: [`${pct(p.dailyLossBps)} · ${money(applyBps(size, p.dailyLossBps))}`] },
    { key: "max", label: s.max, values: [`${pct(p.maxLoss.bps)} ${p.maxLoss.type === "static" ? s.static : s.trailing}`] },
    { key: "split", label: s.split, values: [`${pct(rs.payout.profitSplitBps)} → ${pct(rs.payout.scaledProfitSplitBps)}`] },
    { key: "first", label: s.firstPayout, values: [fmt(s.afterDays, { n: rs.payout.firstPayoutAfterDays })] },
    { key: "cycle", label: s.cycle, values: [fmt(s.everyDays, { n: rs.payout.cycleDays })] },
    { key: "consistency", label: s.consistency, values: [rs.payout.consistency ? `≤ ${pct(rs.payout.consistency.bestDayMaxBps)}` : s.none] },
    { key: "news", label: s.news, values: [p.newsTrading === "allowed" ? s.allowed : s.restricted] },
    { key: "weekend", label: s.weekend, values: [p.weekendHolding ? s.allowed : s.notAllowed] },
  ];
}
