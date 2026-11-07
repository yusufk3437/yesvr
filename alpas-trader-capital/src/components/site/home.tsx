"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BookOpenCheck, CalendarClock, Scale } from "lucide-react";
import { applyBps } from "@/domain/money";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { SCENARIO_ACCOUNTS } from "@/services/seed";
import { evaluateAccount } from "@/services/state";
import { useAssistant } from "../assistant/context";
import { Contours, RouteMap } from "../brand";
import { Sparkline } from "../charts";
import { Button, LinkButton, Meter, SectionTitle, Skeleton, Stat } from "../ui";
import { ChallengeSelector } from "./challenge-selector";

export function Hero() {
  const { m, t, f } = useI18n();
  const { programs, current } = useCatalog();
  const h = m.site.hero;
  const minPrice = Math.min(...programs.flatMap((p) => p.sizes.map((s) => s.price)));
  const versions = programs.map((p) => `${p.code} v${current(p.id).version}`).join(" · ");
  return (
    <section className="relative isolate overflow-hidden bg-petrol-900 text-paper">
      <Contours className="absolute inset-0 -z-10 h-full w-full text-paper" opacity={0.11} seed={11} levels={11} />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-petrol-950/70" aria-hidden />
      <div className="mx-auto max-w-[1320px] px-4 pb-10 pt-16 sm:px-6 sm:pt-24">
        <p className="eyebrow fade-up text-copper-300">{h.eyebrow}</p>
        <h1 className="fade-up mt-4 max-w-4xl font-display text-[2.55rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[4rem] lg:text-[4.6rem]">
          {h.titleA} <span className="font-serif font-normal italic tracking-[-0.01em] text-copper-300">{h.titleB}</span>
        </h1>
        <p className="fade-up mt-6 max-w-2xl text-[1.06rem] leading-relaxed text-paper/75">{h.body}</p>
        <div className="fade-up mt-8 flex flex-wrap gap-3">
          <LinkButton href="/challenges" variant="accent" size="lg">
            {h.ctaPrimary} <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
          <LinkButton href="/rules" variant="outline" size="lg" className="border-paper/25 bg-transparent text-paper hover:border-paper/60 hover:bg-paper/5">
            {h.ctaSecondary}
          </LinkButton>
        </div>
        <div className="mt-12 -mx-2 overflow-x-auto px-2 pb-2">
          <div className="min-w-[640px]">
            <RouteMap
              animate
              height={220}
              stops={[
                { label: h.stops.choose, sub: t(h.stops.chooseSub, { price: f.money(minPrice, { decimals: 0 }) }), state: "done" },
                { label: h.stops.evaluate, sub: h.stops.evaluateSub, state: "done" },
                { label: h.stops.review, sub: h.stops.reviewSub, state: "current" },
                { label: h.stops.funded, sub: h.stops.fundedSub, state: "next" },
                { label: h.stops.reward, sub: h.stops.rewardSub, state: "next" },
              ]}
            />
          </div>
        </div>
        <p className="mt-6 border-t border-paper/10 pt-4 text-[0.78rem] text-paper/55">{t(h.honesty, { version: versions })}</p>
      </div>
    </section>
  );
}

function DashboardPreview() {
  const { m, f } = useI18n();
  const { state, ready, now } = useStore();
  const p = m.site.preview;
  const ev = useMemo(() => {
    if (!state || !state.accounts.some((a) => a.id === SCENARIO_ACCOUNTS.inProgress)) return null;
    return evaluateAccount(state, SCENARIO_ACCOUNTS.inProgress, now);
  }, [state, now]);
  return (
    <div className="rounded-[18px] border border-line-2 bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-muted">{p.label}</p>
        <span className="num text-xs text-muted">{SCENARIO_ACCOUNTS.inProgress}</span>
      </div>
      {!ready || !ev ? (
        <div className="mt-5 space-y-3" role="status" aria-label={m.common.loading}>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label={p.balance} value={f.money(ev.balance, { decimals: 0 })} />
            <Stat label={p.equity} value={f.money(ev.equity, { decimals: 0 })} />
            <Stat label={p.dailyLeft} value={f.money(ev.dailyRemaining, { decimals: 0 })} />
          </div>
          <Sparkline className="mt-4 h-16" values={ev.series.map((x) => x.equity)} label={p.equity} />
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>{p.target}</span>
              <span className="num">
                {f.money(Math.max(0, ev.profit), { decimals: 0 })} / {f.money(ev.profitTarget ?? 0, { decimals: 0 })}
              </span>
            </div>
            <Meter className="mt-1.5" value={Math.max(0, ev.profit)} max={ev.profitTarget ?? 1} tone="copper" label={p.target} />
          </div>
        </>
      )}
    </div>
  );
}

export function HomePage() {
  const { m, l, f } = useI18n();
  const { programs, current } = useCatalog();
  const { setOpen } = useAssistant();
  const s = m.site;
  const icons = [Scale, BookOpenCheck, CalendarClock];
  const asc = current("ascent");
  const rdg = current("ridge");
  const summary: { label: string; asc: string; rdg: string }[] = [
    { label: s.selector.target, asc: `${f.bps(asc.phases[0].profitTargetBps!)} → ${f.bps(asc.phases[1].profitTargetBps!)}`, rdg: f.bps(rdg.phases[0].profitTargetBps!) },
    { label: s.selector.daily, asc: f.bps(asc.phases[0].dailyLossBps), rdg: f.bps(rdg.phases[0].dailyLossBps) },
    { label: s.selector.max, asc: `${f.bps(asc.phases[0].maxLoss.bps)} ${s.selector.static}`, rdg: `${f.bps(rdg.phases[0].maxLoss.bps)} ${s.selector.trailing}` },
    { label: s.selector.minDays, asc: `${asc.phases[0].minTradingDays} + ${asc.phases[1].minTradingDays}`, rdg: String(rdg.phases[0].minTradingDays) },
    { label: s.selector.consistency, asc: s.selector.none, rdg: `≤ ${f.bps(rdg.phases[0].consistency!.bestDayMaxBps)}` },
    { label: s.selector.news, asc: `${s.selector.allowed} / ${s.selector.restricted}`, rdg: `${s.selector.allowed} / ${s.selector.restricted}` },
    { label: s.selector.weekend, asc: s.selector.allowed, rdg: s.selector.notAllowed },
    { label: s.selector.split, asc: f.bps(asc.payout.profitSplitBps), rdg: f.bps(rdg.payout.profitSplitBps) },
  ];
  return (
    <>
      <Hero />

      <section className="mx-auto max-w-[1320px] px-4 py-20 sm:px-6">
        <SectionTitle eyebrow={s.values.eyebrow} title={s.values.title} />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {s.values.items.map((it, i) => {
            const Icon = icons[i];
            return (
              <article key={it.title} className="border-t-2 border-ink pt-5">
                <Icon className="size-6 text-copper" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-bold tracking-tight">{it.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{it.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-line-2 bg-paper-2/50">
        <div className="mx-auto max-w-[1320px] px-4 py-20 sm:px-6">
          <SectionTitle eyebrow={s.selector.eyebrow} title={s.selector.title} />
          <div className="mt-10">
            <ChallengeSelector />
          </div>
          <Link href="/challenges" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-petrol-700 hover:underline">
            {s.selector.viewAll} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-4 py-20 sm:px-6">
        <SectionTitle eyebrow={s.how.eyebrow} title={s.how.title} />
        <ol className="mt-10 grid gap-8 md:grid-cols-4">
          {s.how.steps.map((st, i) => (
            <li key={st.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="num grid size-9 place-items-center rounded-full border-2 border-copper font-display text-sm font-bold text-copper-700">{i + 1}</span>
                {i < 3 && <span className="hidden h-px flex-1 border-t border-dashed border-line md:block" aria-hidden />}
              </div>
              <h3 className="mt-4 font-display text-base font-bold">{st.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{st.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <SectionTitle tone="light" eyebrow={s.rulesSummary.eyebrow} title={s.rulesSummary.title} />
            <LinkButton href="/rules" variant="light" className="mt-8">
              {s.rulesSummary.cta} <ArrowRight className="size-4" aria-hidden />
            </LinkButton>
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-paper/10">
            <table className="w-full min-w-[460px] text-sm">
              <caption className="sr-only">{s.rulesSummary.title}</caption>
              <thead>
                <tr className="border-b border-paper/10 text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-paper/60">
                    {s.rulesSummary.rule}
                  </th>
                  {programs.map((p) => (
                    <th key={p.id} scope="col" className="px-4 py-3 font-display font-bold">
                      {l(p.name)} <span className="block text-xs font-normal text-paper/55">{l(p.model)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.label} className="border-b border-paper/10 last:border-0">
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-paper/65">
                      {r.label}
                    </th>
                    <td className="num px-4 py-2.5">{r.asc}</td>
                    <td className="num px-4 py-2.5">{r.rdg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1320px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow={s.preview.eyebrow} title={s.preview.title} intro={s.preview.body} />
          <LinkButton href="/login?next=/dashboard" variant="primary" className="mt-8">
            {s.preview.cta} <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
        </div>
        <DashboardPreview />
      </section>

      <section className="border-y border-line-2 bg-card">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionTitle eyebrow={s.payout.eyebrow} title={s.payout.title} intro={s.payout.body} />
            <LinkButton href="/payouts" variant="outline" className="mt-8">
              {s.payout.cta}
            </LinkButton>
          </div>
          <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-[14px] border border-line-2 bg-line-2">
            {[
              { k: s.payout.split, v: f.bps(asc.payout.profitSplitBps) },
              { k: s.payout.first, v: `${asc.payout.firstPayoutAfterDays}d` },
              { k: s.payout.cycle, v: `${asc.payout.cycleDays}d` },
              { k: s.payout.minimum, v: `${f.bps(asc.payout.minRequestBps)} · ${f.money(applyBps(10_000_000, asc.payout.minRequestBps), { decimals: 0 })}/100K` },
            ].map((x) => (
              <div key={x.k} className="bg-card p-5">
                <dt className="text-xs uppercase tracking-[0.08em] text-muted">{x.k}</dt>
                <dd className="num mt-2 font-display text-2xl font-bold">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-4 py-20 sm:px-6">
        <SectionTitle eyebrow={s.faq.eyebrow} title={s.faq.title} />
        <div className="mt-8 divide-y divide-line-2 border-y border-line-2">
          {s.faq.items.map((it) => (
            <details key={it.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold">
                {it.q}
                <span className="text-xl text-copper transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-muted">{it.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-petrol-800 text-paper">
        <Contours className="absolute inset-0 -z-10 h-full w-full text-paper" opacity={0.08} seed={5} />
        <div className="mx-auto flex max-w-[1320px] flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight">{s.cta.title}</h2>
            <p className="mt-2 text-paper/70">{s.cta.body}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/challenges" variant="accent" size="lg">
              {s.cta.primary}
            </LinkButton>
            <Button variant="outline" size="lg" className="border-paper/25 bg-transparent text-paper hover:bg-paper/5" onClick={() => setOpen(true)}>
              {s.cta.secondary}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
