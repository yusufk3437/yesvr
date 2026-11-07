"use client";

import { formatSize } from "@/domain/money";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { RouteMap } from "../brand";
import { Card, Table, td, th } from "../ui";
import { BudgetPlanner } from "./budget-planner";
import { ChallengeSelector } from "./challenge-selector";
import { PageHero } from "./page-hero";
import { evaluationRows, fundedRows } from "./rule-rows";

export function ChallengesPage() {
  const { m, l, f, t, locale } = useI18n();
  const { programs, current } = useCatalog();
  const c = m.site.challenges;
  const h = m.site.hero.stops;
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <section className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6">
        <h2 className="sr-only">{c.configTitle}</h2>
        <ChallengeSelector variant="page" />
      </section>

      <BudgetPlanner />


      <section className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{c.stageRoute}</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {programs.map((p) => {
            const rs = current(p.id);
            const evals = rs.phases.filter((x) => x.kind !== "funded");
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 border-b border-line-2 px-5 py-4">
                  <h3 className="font-display text-lg font-bold">{l(p.name)}</h3>
                  <span className="text-xs text-muted">{t(c.steps, { n: p.steps })}</span>
                </div>
                <div className="overflow-x-auto px-3 pb-2 pt-6">
                  <div className="min-w-[520px]">
                    <RouteMap
                      tone="dark"
                      height={150}
                      compact
                      stops={[
                        ...evals.map((e) => ({ label: l(e.label), state: "next" as const })),
                        { label: h.review, state: "next" as const },
                        { label: h.funded, state: "next" as const },
                        { label: h.reward, state: "next" as const },
                      ]}
                    />
                  </div>
                </div>
                <p className="px-5 pb-5 text-sm text-muted">{l(p.summary)}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-line-2 bg-card">
        <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-12 sm:px-6 md:grid-cols-3">
          <h2 className="sr-only">{c.termsTitle}</h2>
          {[
            [c.termsSize, c.termsSizeBody],
            [c.termsFee, c.termsFeeBody],
            [c.termsReward, c.termsRewardBody],
          ].map(([a, b]) => (
            <div key={a} className="border-l-2 border-brass pl-4">
              <h3 className="font-display font-bold">{a}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{b}</p>
            </div>
          ))}
          <p className="text-sm text-muted md:col-span-3">{c.promoNote}</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{c.compareTitle}</h2>
        <p className="mt-1 text-muted">{c.compareIntro}</p>
        <div className="mt-6 space-y-6">
          {programs.map((p) => {
            const rs = current(p.id);
            const size = 10_000_000;
            const ev = evaluationRows(rs, size, m, locale);
            const fu = fundedRows(rs, size, m, locale);
            const evals = rs.phases.filter((x) => x.kind !== "funded");
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-2 px-5 py-4">
                  <h3 className="font-display text-lg font-bold">
                    {l(p.name)} <span className="font-sans text-sm font-normal text-muted">· {l(p.model)} · {formatSize(size)}</span>
                  </h3>
                  <span className="text-xs text-muted">{t(c.ruleVersion, { v: rs.version, date: rs.publishedAt })}</span>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-line-2 px-5 py-3 text-sm">
                  {p.sizes.map((s) => (
                    <span key={s.size} className="num rounded-full border border-line px-3 py-1">
                      {formatSize(s.size)} · <b className="font-semibold text-brass-700">{f.money(s.price, { decimals: 0 })}</b>
                    </span>
                  ))}
                </div>
                <Table caption={`${l(p.name)} — ${m.site.selector.evalStage} / ${m.site.selector.fundedStage}`}>
                  <thead>
                    <tr>
                      <th className={th} scope="col">
                        {m.site.rulesSummary.rule}
                      </th>
                      {evals.map((e) => (
                        <th key={e.kind} className={th} scope="col">
                          {evals.length > 1 ? `${m.site.selector.evalStage} · ${l(e.label)}` : m.site.selector.evalStage}
                        </th>
                      ))}
                      <th className={`${th} bg-navy-100/50`} scope="col">
                        {m.site.selector.fundedStage}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ev.map((r) => (
                      <tr key={r.key}>
                        <th scope="row" className={`${td} font-normal text-muted`}>
                          {r.label}
                        </th>
                        {r.values.map((v, i) => (
                          <td key={i} className={`${td} num`}>
                            {v}
                          </td>
                        ))}
                        <td className={`${td} num bg-navy-100/30`}>{fu.find((x) => x.key === r.key)?.values[0] ?? "—"}</td>
                      </tr>
                    ))}
                    {fu
                      .filter((x) => !ev.some((e) => e.key === x.key))
                      .map((r) => (
                        <tr key={r.key}>
                          <th scope="row" className={`${td} font-normal text-muted`}>
                            {r.label}
                          </th>
                          {evals.map((e) => (
                            <td key={e.kind} className={`${td} text-subtle`}>
                              —
                            </td>
                          ))}
                          <td className={`${td} num bg-navy-100/30`}>{r.values[0]}</td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
