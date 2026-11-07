"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Link2, MessageCircleQuestion, Search } from "lucide-react";
import { normalize } from "@/domain/assistant";
import type { KnowledgeArticle } from "@/domain/knowledge";
import { applyBps, usd } from "@/domain/money";
import { dailyFloorFor, trailingFloorFor } from "@/domain/risk";
import type { PhaseKind, ProgramId } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useCatalog, useKnowledge } from "@/lib/hooks";
import { useAssistant } from "../assistant/context";
import { Card, Field, Input, Pill, Segmented, Select, cx, useToast } from "../ui";
import { PageHero } from "./page-hero";

type Stage = "all" | PhaseKind | "general";

export function RulesPage() {
  const { m, l, t, locale } = useI18n();
  const r = m.site.rules;
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { programs, ruleSets, current } = useCatalog();
  const kb = useKnowledge();
  const { ask } = useAssistant();
  const toast = useToast();

  const program = (params.get("program") === "ridge" ? "ridge" : "ascent") as ProgramId;
  const versions = ruleSets.filter((x) => x.programId === program).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const version = versions.some((v) => v.version === params.get("version")) ? params.get("version")! : current(program).version;
  const rs = versions.find((v) => v.version === version)!;
  const stageParam = params.get("stage");
  const stage: Stage = (["phase1", "phase2", "funded", "general"].includes(stageParam ?? "") ? stageParam : "all") as Stage;
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  const nq = normalize(q);
  const articles = kb.filter((a) => {
      if (a.category !== "rule" || a.ruleSetId !== rs.id) return false;
      if (stage === "general" && a.phase) return false;
      if (stage !== "all" && stage !== "general" && a.phase !== stage) return false;
      if (!nq) return true;
      return normalize(`${a.title[locale]} ${a.body[locale]} ${a.keywords.join(" ")}`).includes(nq);
    });

  const groups: { key: string; title: string; items: KnowledgeArticle[] }[] = [
    { key: "general", title: r.stages.general, items: articles.filter((a) => !a.phase) },
    ...rs.phases.map((p) => ({ key: p.kind, title: l(p.label), items: articles.filter((a) => a.phase === p.kind) })),
  ].filter((g) => g.items.length);

  const stageOptions: { value: Stage; label: string }[] = [
    { value: "all", label: r.stages.all },
    ...rs.phases.map((p) => ({ value: p.kind as Stage, label: l(p.label) })),
    { value: "general", label: r.stages.general },
  ];

  return (
    <>
      <PageHero eyebrow={r.eyebrow} title={r.title} intro={r.intro}>
        <div className="mt-6 flex flex-wrap gap-2">
          {programs.map((p) => (
            <Pill key={p.id} tone="navy" icon={false}>
              {l(p.name)} v{current(p.id).version} · {t(r.published, { date: current(p.id).publishedAt })}
            </Pill>
          ))}
        </div>
      </PageHero>

      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="mb-2 text-sm font-medium">{r.program}</p>
            <Segmented value={program} onChange={(v) => update({ program: v, version: null, stage: null })} label={r.program} options={programs.map((p) => ({ value: p.id, label: l(p.name) }))} />
          </div>
          <Field label={r.version} htmlFor="rule-version">
            <Select id="rule-version" value={version} onChange={(e) => update({ version: e.target.value })}>
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} · {v.publishedAt}
                  {v.id === current(program).id ? ` (${r.current})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={r.stage} htmlFor="rule-stage">
            <Select id="rule-stage" value={stage} onChange={(e) => update({ stage: e.target.value === "all" ? null : e.target.value })}>
              {stageOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-1.5">
            <label htmlFor="rule-search" className="text-sm font-medium">
              {r.searchLabel}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input id="rule-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={r.searchPlaceholder} className="pl-9" />
            </div>
          </div>
          <Card as="div" className="p-4">
            <p className="text-sm font-semibold">{r.changelog} · v{rs.version}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted">
              {rs.changelog.map((c, i) => (
                <li key={i}>{l(c)}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-subtle">{r.lockedNote}</p>
          </Card>
        </aside>

        <div className="min-w-0 space-y-10">
          {groups.length === 0 && <p className="rounded-[12px] border border-dashed border-line p-6 text-center text-muted">{r.noMatch}</p>}
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`grp-${g.key}`}>
              <h2 id={`grp-${g.key}`} className="flex items-baseline gap-3 font-display text-xl font-extrabold tracking-tight">
                {g.title}
                <span className="text-sm font-normal text-muted">
                  {l(programs.find((p) => p.id === program)!.name)} · v{rs.version}
                </span>
              </h2>
              <div className="mt-4 space-y-3">
                {g.items.map((a) => (
                  <article
                    key={a.id}
                    id={a.anchor}
                    className="scroll-mt-28 rounded-[14px] border border-line-2 bg-card p-5 transition-shadow target:border-brass target:ring-2 target:ring-brass/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-display text-base font-bold">{a.title[locale]}</h3>
                      <span className="text-xs text-subtle">
                        v{a.version} · {m.common.updated} {a.updatedAt}
                      </span>
                    </div>
                    <p className="mt-2 text-[0.94rem] leading-relaxed text-graphite">{a.body[locale]}</p>
                    {a.example && (
                      <p className="num mt-3 rounded-[10px] bg-paper px-3 py-2 text-sm">
                        <span className="mr-2 text-xs font-semibold uppercase tracking-[0.08em] text-brass-700">{r.example}</span>
                        {a.example[locale]}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      <button type="button" className="inline-flex items-center gap-1 text-navy-700 hover:underline" onClick={() => ask(a.title[locale])}>
                        <MessageCircleQuestion className="size-3.5" aria-hidden /> {r.ask}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted hover:text-ink"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`${window.location.origin}${a.href}`);
                          toast("info", m.common.copied);
                        }}
                      >
                        <Link2 className="size-3.5" aria-hidden /> {r.copyLink}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          <Calculators dailyBps={rs.phases[0].dailyLossBps} />
        </div>
      </div>
    </>
  );
}

function Calculators({ dailyBps }: { dailyBps: number }) {
  const { m, f } = useI18n();
  const r = m.site.rules;
  const { current } = useCatalog();
  const [size, setSize] = useState(100_000);
  const [ref, setRef] = useState(102_000);
  const [hwm, setHwm] = useState(103_000);
  const [best, setBest] = useState(4_900);
  const [total, setTotal] = useState(10_400);
  const ridge = current("ridge");
  const cons = ridge.phases[0].consistency!.bestDayMaxBps;
  const share = total > 0 ? best / total : 0;
  const n = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);
  return (
    <section aria-labelledby="calc" className="rounded-[16px] border border-line-2 bg-paper-2/50 p-5">
      <h2 id="calc" className="font-display text-xl font-extrabold tracking-tight">
        {r.calculators}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card as="div" className="space-y-3 p-4">
          <h3 className="font-display font-bold">{r.calcDaily}</h3>
          <p className="text-xs text-muted">{r.calcDailyBody}</p>
          <Field label={`${r.initialSize} (USD)`} htmlFor="c-size">
            <Input id="c-size" inputMode="numeric" value={size} onChange={(e) => setSize(n(e.target.value))} />
          </Field>
          <Field label={`${r.reference} (USD)`} htmlFor="c-ref">
            <Input id="c-ref" inputMode="numeric" value={ref} onChange={(e) => setRef(n(e.target.value))} />
          </Field>
          <p className="num text-sm">
            {r.floor} ({f.bps(dailyBps)}): <b>{f.money(dailyFloorFor(usd(ref), usd(size), dailyBps))}</b>
          </p>
        </Card>
        <Card as="div" className="space-y-3 p-4">
          <h3 className="font-display font-bold">{r.calcTrailing}</h3>
          <p className="text-xs text-muted">{r.calcTrailingBody}</p>
          <Field label={`${r.hwm} (USD)`} htmlFor="c-hwm">
            <Input id="c-hwm" inputMode="numeric" value={hwm} onChange={(e) => setHwm(n(e.target.value))} />
          </Field>
          <p className="num text-sm">
            {r.floor}: <b>{f.money(trailingFloorFor(usd(hwm), usd(size), ridge.phases[0].maxLoss.bps))}</b>
            <span className="block text-xs text-muted">
              {r.initialSize}: {f.money(usd(size), { decimals: 0 })} · {f.bps(ridge.phases[0].maxLoss.bps)} = {f.money(applyBps(usd(size), ridge.phases[0].maxLoss.bps), { decimals: 0 })}
            </span>
          </p>
        </Card>
        <Card as="div" className="space-y-3 p-4">
          <h3 className="font-display font-bold">{r.calcConsistency}</h3>
          <p className="text-xs text-muted">{r.calcConsistencyBody}</p>
          <Field label={`${r.bestDay} (USD)`} htmlFor="c-best">
            <Input id="c-best" inputMode="numeric" value={best} onChange={(e) => setBest(n(e.target.value))} />
          </Field>
          <Field label={`${r.totalProfit} (USD)`} htmlFor="c-total">
            <Input id="c-total" inputMode="numeric" value={total} onChange={(e) => setTotal(n(e.target.value))} />
          </Field>
          <p className="num text-sm">
            {r.share}: <b>{f.ratio(share)}</b> · {r.limit} {f.bps(cons)}
            <span className={cx("mt-1 block text-xs font-semibold", share <= cons / 10_000 ? "text-gain" : "text-warn")}>{share <= cons / 10_000 ? r.ok : r.notOk}</span>
          </p>
        </Card>
      </div>
    </section>
  );
}
