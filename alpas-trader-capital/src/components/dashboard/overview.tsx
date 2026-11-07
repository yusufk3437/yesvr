"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { tradeNet, tradeStats } from "@/domain/risk";
import { DAY_MS } from "@/domain/time";
import type { Account } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { eligibilityFor } from "@/services/actions";
import { evaluateAccount, getAccount, getChallenge } from "@/services/state";
import { RouteMap, type RouteStop } from "../brand";
import { EquityChart, PnlCalendar } from "../charts";
import { Card, CardHeader, EmptyState, LinkButton, Meter, Notice, Pill, Segmented, Stat, Table, cx, pnlText, td, th } from "../ui";
import { AccountHeader, fmtDuration } from "./common";
import { useAccountSelection } from "./selection";

type Range = "7d" | "30d" | "all";

export function OverviewPage() {
  const { m, t, f, l, locale } = useI18n();
  const { state, now } = useStore();
  const { account } = useAccountSelection();
  const [range, setRange] = useState<Range>("all");
  if (!state) return null;
  const user = state.users.find((u) => u.id === state.session.userId)!;
  if (!account)
    return (
      <Card>
        <EmptyState
          title={m.dash.noAccounts}
          body={m.dash.noAccountsBody}
          action={
            <LinkButton href="/challenges" variant="accent">
              {m.common.startChallenge}
            </LinkButton>
          }
        />
      </Card>
    );

  const ch = getChallenge(state, account.challengeId)!;
  const ev = evaluateAccount(state, account.id, now);
  const phase = ch.ruleSnapshot.phases[account.phaseIndex];
  const end = account.closedAt && !["active", "ready"].includes(account.status) ? Math.min(now, account.closedAt) : now;
  const from = range === "all" ? 0 : end - (range === "7d" ? 7 : 30) * DAY_MS;
  const series = ev.series.filter((p) => p.ts >= from);
  const closedInRange = ev.closedTrades.filter((x) => (x.closeTime ?? 0) >= from);
  const stats = tradeStats(closedInRange);
  const recent = [...ev.openTrades, ...[...ev.closedTrades].reverse()].slice(0, 6);
  const elig = account.kind === "funded" ? eligibilityFor(state, account.id, now) : null;
  const b = m.dash.banners;
  const mt = m.dash.metrics;

  const banners: React.ReactNode[] = [];
  if (account.status === "ready") banners.push(<Notice key="r" tone="info">{b.ready}</Notice>);
  if (account.status === "breached" && account.breach)
    banners.push(
      <Notice key="b" tone="loss">
        {t(b.breached, { type: m.labels.breach[account.breach.type].toLowerCase(), date: f.dateTime(account.breach.at), equity: f.money(account.breach.equity), limit: f.money(account.breach.limit) })}
      </Notice>,
    );
  if (account.status === "expired") banners.push(<Notice key="e" tone="loss">{t(b.expired, { date: f.date(account.closedAt ?? now) })}</Notice>);
  const review = state.reviews.find((r) => r.accountId === account.id);
  if (account.status === "under_review" && review) banners.push(<Notice key="u" tone="warn">{t(b.review, { date: f.dateTime(review.openedAt) })}</Notice>);
  if (account.status === "review_rejected") banners.push(<Notice key="rr" tone="loss">{t(b.rejected, { reason: review?.reason ?? "—" })}</Notice>);
  if (account.status === "passed" && account.kind !== "funded") {
    const nextId = ch.accountIds[ch.accountIds.indexOf(account.id) + 1];
    const next = nextId ? getAccount(state, nextId) : null;
    if (next && next.kind !== "funded")
      banners.push(
        <Notice key="p" tone="gain">
          {t(b.passedPhase, { date: f.date(account.closedAt ?? now), next: next.id })}{" "}
          <Link className="font-semibold underline" href={`/dashboard?account=${next.id}`}>
            →
          </Link>
        </Notice>,
      );
    else if (ch.status === "passed")
      banners.push(
        <Notice key="pf" tone="gain">
          {b.passedFinal}{" "}
          <Link className="font-semibold underline" href="/dashboard/verification">
            {m.dash.nav.verification} →
          </Link>
        </Notice>,
      );
  }
  if (["active", "ready"].includes(account.status)) {
    if (ev.dailyRemaining <= ev.dailyLossAmount * 0.2) banners.push(<Notice key="nl" tone="warn">{t(b.nearLimit, { left: f.money(ev.dailyRemaining) })}</Notice>);
    if (ev.completion.targetMet && ev.completion.minDaysMet && ev.completion.consistencyMet && !ev.completion.flat) banners.push(<Notice key="om" tone="info">{b.objectivesMet}</Notice>);
    if (ev.completion.targetMet && !ev.completion.consistencyMet && ev.consistency.shareBps !== null)
      banners.push(<Notice key="cw" tone="warn">{t(b.consistencyWait, { share: f.bps(ev.consistency.shareBps), max: f.bps(ev.consistency.maxBps ?? 0) })}</Notice>);
  }

  const stops = routeStops(account, ch.status, state.accounts, m, l, ch.ruleSnapshot.phases);
  const dailyTone = ev.dailyUsed / ev.dailyLossAmount > 0.8 ? "loss" : ev.dailyUsed / ev.dailyLossAmount > 0.5 ? "warn" : "navy";
  const maxUsed = Math.max(0, ev.maxLossAmount - ev.maxRemaining);
  const maxTone = maxUsed / ev.maxLossAmount > 0.8 ? "loss" : maxUsed / ev.maxLossAmount > 0.5 ? "warn" : "navy";
  const monthKey = (ev.days.length ? ev.days[ev.days.length - 1].key : ev.dayKey).slice(0, 7) + "-01";

  return (
    <div>
      <p className="mb-3 text-sm text-muted">{t(m.dash.greeting, { name: user.name.split(" ")[0] })}</p>
      <AccountHeader account={account} />
      {banners.length > 0 && <div className="mb-5 space-y-2">{banners}</div>}

      <Card className="mb-5 overflow-hidden">
        <div className="overflow-x-auto px-4 pt-5">
          <div className="min-w-[560px]">
            <RouteMap stops={stops} tone="dark" compact height={120} />
          </div>
        </div>
      </Card>

      <section aria-label={m.dash.nav.overview} className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line-2 bg-line-2 md:grid-cols-5">
        {[
          { label: mt.balance, value: f.money(ev.balance), sub: ev.reserved ? t(mt.reserved, { value: f.money(ev.reserved) }) : `${m.common.simulated}` },
          { label: mt.equity, value: f.money(ev.equity) },
          { label: mt.netPnl, value: f.money(ev.closedNet, { sign: true }), tone: ev.closedNet > 0 ? ("gain" as const) : ev.closedNet < 0 ? ("loss" as const) : undefined },
          { label: mt.openPnl, value: f.money(ev.openPnl, { sign: true }), tone: ev.openPnl > 0 ? ("gain" as const) : ev.openPnl < 0 ? ("loss" as const) : undefined, sub: `${ev.openTrades.length} ${m.dash.trades.openPosition.toLowerCase()}` },
          { label: mt.todayPnl, value: f.money(ev.todayPnl, { sign: true }), tone: ev.todayPnl > 0 ? ("gain" as const) : ev.todayPnl < 0 ? ("loss" as const) : undefined, sub: t(mt.resetIn, { time: f.ny(ev.nextReset) }) },
        ].map((x) => (
          <div key={x.label} className="bg-card p-4">
            <Stat label={x.label} value={x.value} sub={x.sub} tone={x.tone} />
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ev.profitTarget !== null ? (
          <Card className="p-4">
            <Stat label={mt.target} value={f.money(Math.max(0, ev.profit))} sub={t(mt.reached, { value: f.ratio(Math.max(0, ev.profit) / ev.profitTarget, 0), target: f.money(ev.profitTarget, { decimals: 0 }) })} />
            <Meter className="mt-3" value={Math.max(0, ev.profit)} max={ev.profitTarget} tone="brass" label={mt.target} />
          </Card>
        ) : (
          <Card className="p-4">
            <Stat label={m.dash.payouts.available} value={f.money(elig?.profitAvailable ?? 0)} sub={elig?.eligible ? m.dash.payouts.eligibleNow : elig?.eligibleFrom ? `${m.dash.payouts.nextDate}: ${f.date(elig.eligibleFrom)}` : undefined} />
            <LinkButton href="/dashboard/payouts" size="sm" variant="outline" className="mt-3">
              {m.dash.nav.payouts}
            </LinkButton>
          </Card>
        )}
        <Card className="p-4">
          <Stat label={mt.dailyLimit} value={t(mt.left, { value: f.money(ev.dailyRemaining) })} sub={`${t(mt.floor, { value: f.money(ev.dailyFloor) })} · ${t(mt.reference, { value: f.money(ev.dayReference) })}`} />
          <Meter className="mt-3" value={ev.dailyUsed} max={ev.dailyLossAmount} tone={dailyTone} label={mt.dailyLimit} />
          <p className="num mt-1 text-xs text-muted">{t(mt.used, { used: f.money(ev.dailyUsed), limit: f.money(ev.dailyLossAmount) })}</p>
        </Card>
        <Card className="p-4">
          <Stat label={mt.maxLimit} value={t(mt.left, { value: f.money(ev.maxRemaining) })} sub={t(mt.floor, { value: f.money(ev.maxFloor) })} />
          <Meter className="mt-3" value={maxUsed} max={ev.maxLossAmount} tone={maxTone} label={mt.maxLimit} />
          <p className="mt-1 text-xs text-muted">{phase.maxLoss.type === "trailing_eod" ? (ev.trailingLocked ? mt.locked : t(mt.trailingAt, { value: f.money(ev.maxFloor) })) : `${f.bps(phase.maxLoss.bps)} ${m.site.selector.static}`}</p>
        </Card>
        <Card className={cx("p-4", ev.headroom <= ev.dailyLossAmount * 0.2 && ["active", "ready"].includes(account.status) && "border-warn-500/50 bg-warn-100/40")}>
          <Stat label={mt.riskRoom} value={f.money(ev.headroom)} sub={t(mt.riskRoomSub, { binding: mt.binding[ev.bindingLimit] })} />
          <p className="mt-3 text-xs leading-relaxed text-muted">{m.site.faq.items[2].a}</p>
        </Card>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{m.dash.chart.range}</span>
        <Segmented value={range} onChange={setRange} label={m.dash.chart.range} options={(["7d", "30d", "all"] as const).map((r) => ({ value: r, label: m.dash.chart.ranges[r] }))} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={m.dash.chart.title} sub={m.dash.chart.sub} />
          <div className="p-4">
            {series.length > 1 ? (
              <EquityChart
                points={series}
                refs={[
                  ...(["active", "ready"].includes(account.status) ? [{ value: ev.dailyFloor, label: m.dash.chart.dailyFloor }] : []),
                  { value: ev.maxFloor, label: m.dash.chart.maxFloor },
                ]}
                labels={{ balance: m.dash.chart.balance, equity: m.dash.chart.equity, table: m.common.details, date: m.common.date }}
              />
            ) : (
              <EmptyState title={m.dash.chart.empty} />
            )}
          </div>
        </Card>
        <ObjectivesCard ev={ev} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CalendarCard days={ev.days} initialMonth={monthKey} />
        <Card>
          <CardHeader title={m.dash.stats.title} sub={t(m.dash.stats.formula, { n: stats.count })} />
          <dl className="grid grid-cols-2 gap-px bg-line-2 sm:grid-cols-3">
            {[
              [m.dash.stats.winRate, stats.winRate !== null ? f.ratio(stats.winRate) : "—"],
              [m.dash.stats.profitFactor, stats.profitFactor !== null ? f.num(stats.profitFactor) : "—"],
              [m.dash.stats.expectancy, stats.expectancy !== null ? f.money(stats.expectancy, { sign: true }) : "—"],
              [m.dash.stats.avgRR, stats.avgRR !== null ? `1 : ${f.num(stats.avgRR)}` : "—"],
              [m.dash.stats.avgR, stats.avgR !== null ? `${f.num(stats.avgR)}R` : "—"],
              [m.dash.stats.trades, String(stats.count)],
              [m.dash.stats.tradingDays, `${ev.tradingDays}${phase.minTradingDays ? ` / ${phase.minTradingDays}` : ""}`],
              [m.dash.stats.avgWin, stats.avgWin !== null ? f.money(stats.avgWin) : "—"],
              [m.dash.stats.avgLoss, stats.avgLoss !== null ? f.money(stats.avgLoss) : "—"],
              [m.dash.stats.commission, f.money(stats.commission)],
              [m.dash.stats.swap, f.money(stats.swap)],
              [m.dash.stats.longShort, `${stats.longs} / ${stats.shorts}`],
            ].map(([k, v]) => (
              <div key={k} className="bg-card px-4 py-3">
                <dt className="text-[0.72rem] text-muted">{k}</dt>
                <dd className="num mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={m.dash.trades.recent}
          sub={m.dash.trades.simulated}
          action={
            <LinkButton href={`/dashboard/trades?account=${account.id}`} variant="outline" size="sm">
              {m.common.viewAll}
            </LinkButton>
          }
        />
        {recent.length === 0 ? (
          <EmptyState title={m.dash.trades.empty} />
        ) : (
          <Table caption={m.dash.trades.recent}>
            <thead>
              <tr>
                <th className={th}>{m.dash.trades.id}</th>
                <th className={th}>{m.dash.trades.symbol}</th>
                <th className={th}>{m.dash.trades.side}</th>
                <th className={th}>{m.dash.trades.open}</th>
                <th className={`${th} text-right`}>{m.dash.trades.volume}</th>
                <th className={`${th} text-right`}>{m.dash.trades.net}</th>
                <th className={th}>{m.dash.trades.duration}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((x) => (
                <tr key={x.id}>
                  <td className={`${td} num`}>{x.id}</td>
                  <td className={`${td} font-medium`}>{x.symbol}</td>
                  <td className={td}>{m.labels.side[x.side]}</td>
                  <td className={`${td} num whitespace-nowrap`}>{f.dateTime(x.openTime)}</td>
                  <td className={`${td} num text-right`}>{f.num(x.volume)}</td>
                  <td className={`${td} num text-right font-semibold ${pnlText(tradeNet(x))}`}>{f.money(tradeNet(x), { sign: true })}</td>
                  <td className={td}>{x.status === "open" ? <Pill tone="info">{m.dash.trades.openPosition}</Pill> : fmtDuration((x.closeTime ?? 0) - x.openTime, locale)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ObjectivesCard({ ev }: { ev: ReturnType<typeof evaluateAccount> }) {
  const { m, t, f } = useI18n();
  const o = m.labels;
  return (
    <Card>
      <CardHeader title={m.dash.objectives.title} sub={m.dash.objectives.sub} />
      <ul className="divide-y divide-line-2">
        {ev.objectives.map((ob) => {
          const isLimit = ob.id === "daily_loss" || ob.id === "max_loss";
          const tone = ob.status === "met" ? "gain" : ob.status === "breached" ? "loss" : ob.status === "warning" ? "warn" : "info";
          const label = ob.status === "met" && isLimit ? o.objectiveStatus.respected : o.objectiveStatus[ob.status];
          const value =
            ob.unit === "cents"
              ? `${f.money(Math.max(0, ob.current), { decimals: 0 })} / ${f.money(ob.target, { decimals: 0 })}`
              : ob.unit === "days"
                ? t(m.dash.objectives.days, { current: ob.current, target: ob.target })
                : ob.unit === "bps"
                  ? t(m.dash.objectives.share, { current: ob.current ? f.bps(ob.current) : "—", target: f.bps(ob.target) })
                  : ob.current
                    ? t(m.dash.objectives.warnings, { n: ob.current })
                    : m.dash.objectives.none;
          return (
            <li key={ob.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.objective[ob.id]}</p>
                <p className="num text-xs text-muted">{value}</p>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </li>
          );
        })}
      </ul>
      {ev.violations.length > 0 && (
        <ul className="border-t border-line-2 px-5 py-3 text-xs text-muted">
          {ev.violations.slice(0, 4).map((v, i) => (
            <li key={i}>
              {m.labels.violation[v.type]} · {v.tradeId} {v.valueBps ? `(${f.bps(v.valueBps)})` : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CalendarCard({ days, initialMonth }: { days: ReturnType<typeof evaluateAccount>["days"]; initialMonth: string }) {
  const { m, f, locale, t } = useI18n();
  const [offset, setOffset] = useState(0);
  const shift = (key: string, months: number) => {
    const [y, mo] = key.split("-").map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + months, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  };
  const month = shift(initialMonth, offset);
  const inMonth = days.filter((d) => d.key.startsWith(month.slice(0, 7)));
  const label = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));
  const best = inMonth.reduce((mx, d) => Math.max(mx, d.net), 0);
  const worst = inMonth.reduce((mn, d) => Math.min(mn, d.net), 0);
  return (
    <Card>
      <CardHeader
        title={m.dash.calendar.title}
        sub={m.dash.calendar.sub}
        action={
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-md p-1.5 hover:bg-paper-2" aria-label={m.dash.calendar.prev} onClick={() => setOffset(offset - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="min-w-28 text-center text-sm font-medium capitalize">{label}</span>
            <button type="button" className="rounded-md p-1.5 hover:bg-paper-2" aria-label={m.dash.calendar.next} onClick={() => setOffset(offset + 1)}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        }
      />
      <div className="p-4">
        <PnlCalendar days={days} monthKey={month} labels={{ weekdays: m.dash.calendar.weekdays, trades: m.dash.calendar.trades, noTrades: m.dash.calendar.noTrades }} />
        <dl className="num mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">{m.dash.calendar.tradingDays}</dt>
            <dd className="font-semibold">{inMonth.filter((d) => d.opened > 0).length}</dd>
          </div>
          <div>
            <dt className="text-muted">{m.dash.calendar.profitable}</dt>
            <dd className="font-semibold">{inMonth.filter((d) => d.net > 0).length}</dd>
          </div>
          <div>
            <dt className="text-muted">{m.dash.stats.best}</dt>
            <dd className="font-semibold text-gain">{f.money(best, { sign: true })}</dd>
          </div>
          <div>
            <dt className="text-muted">{m.dash.stats.worst}</dt>
            <dd className="font-semibold text-loss">{f.money(worst, { sign: true })}</dd>
          </div>
        </dl>
        <p className="sr-only">{t(m.dash.calendar.trades, { n: inMonth.reduce((s, d) => s + d.closed, 0) })}</p>
      </div>
    </Card>
  );
}

function routeStops(
  account: Account,
  challengeStatus: string,
  all: Account[],
  m: ReturnType<typeof useI18n>["m"],
  l: ReturnType<typeof useI18n>["l"],
  phases: { kind: string; label: { en: string; tr: string } }[],
): RouteStop[] {
  const evals = phases.filter((p) => p.kind !== "funded");
  const siblings = all.filter((a) => a.challengeId === account.challengeId);
  const stops: RouteStop[] = evals.map((p) => {
    const acc = siblings.find((a) => a.kind === p.kind);
    const state: RouteStop["state"] = acc?.status === "passed" ? "done" : acc && ["active", "ready", "breached", "expired"].includes(acc.status) ? "current" : acc?.status === "under_review" ? "done" : "next";
    return { label: l(p.label), state };
  });
  const reviewState: RouteStop["state"] = ["passed", "funded"].includes(challengeStatus) ? "done" : challengeStatus === "under_review" ? "current" : "next";
  const funded = siblings.find((a) => a.kind === "funded");
  stops.push({ label: m.site.hero.stops.review, state: reviewState });
  stops.push({ label: m.site.hero.stops.funded, state: funded ? "done" : challengeStatus === "passed" ? "current" : "next" });
  stops.push({ label: m.site.hero.stops.reward, state: funded ? "current" : "next" });
  return stops;
}
