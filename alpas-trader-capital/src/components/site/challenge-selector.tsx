"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { applyBps, formatSize } from "@/domain/money";
import type { PlatformId, ProgramId } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { setCart } from "@/services/actions";
import { Button, Segmented, cx } from "../ui";
import { evaluationRows, fundedRows } from "./rule-rows";

export function useSelection(initial?: { programId?: ProgramId; size?: number }) {
  const { programs } = useCatalog();
  const [programId, setProgramId] = useState<ProgramId>(initial?.programId ?? "ascent");
  const program = programs.find((p) => p.id === programId)!;
  const [size, setSizeRaw] = useState<number>(initial?.size ?? 10_000_000);
  const effectiveSize = program.sizes.some((s) => s.size === size) ? size : program.sizes[Math.min(3, program.sizes.length - 1)].size;
  return { programId, setProgramId, program, size: effectiveSize, setSize: setSizeRaw };
}

export function ChallengeSelector({ variant = "home" }: { variant?: "home" | "page" }) {
  const { m, t, f, l, locale } = useI18n();
  const { programs, current } = useCatalog();
  const { run } = useStore();
  const router = useRouter();
  const sel = useSelection();
  const [platform, setPlatform] = useState<PlatformId>("mt5");
  const s = m.site.selector;
  const rs = current(sel.programId);
  const price = sel.program.sizes.find((x) => x.size === sel.size)!.price;
  const exampleGross = applyBps(sel.size, 400);
  const exampleNet = applyBps(exampleGross, rs.payout.profitSplitBps);
  const evalCols = rs.phases.filter((p) => p.kind !== "funded");
  const go = () => {
    run((st) => setCart(st, { programId: sel.programId, size: sel.size, platform }));
    router.push(`/checkout?program=${sel.programId}&size=${sel.size / 100}&platform=${platform}`);
  };

  return (
    <div className={cx("grid gap-6", variant === "home" ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]" : "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]")}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">{s.program}</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={s.program}>
            {programs.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={sel.programId === p.id}
                onClick={() => sel.setProgramId(p.id)}
                className={cx(
                  "rounded-[12px] border p-3 text-left transition-colors",
                  sel.programId === p.id ? "border-petrol-700 bg-petrol-100/60 ring-1 ring-petrol-700" : "border-line bg-white hover:border-graphite-3",
                )}
              >
                <span className="block font-display text-[0.98rem] font-bold">{l(p.name)}</span>
                <span className="mt-0.5 block text-xs text-muted">{l(p.model)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{l(sel.program.tagline)}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium" id="size-label">
            {s.size}
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="size-label">
            {sel.program.sizes.map((o) => (
              <button
                key={o.size}
                type="button"
                role="radio"
                aria-checked={sel.size === o.size}
                onClick={() => sel.setSize(o.size)}
                className={cx(
                  "num h-10 min-w-16 rounded-[10px] border px-3 font-display text-sm font-bold transition-colors",
                  sel.size === o.size ? "border-ink bg-ink text-paper" : "border-line bg-white hover:border-graphite-3",
                )}
              >
                {formatSize(o.size)}
              </button>
            ))}
          </div>
        </div>
        {variant === "page" && (
          <div>
            <p className="mb-2 text-sm font-medium">{m.site.challenges.platform}</p>
            <Segmented value={platform} onChange={setPlatform} label={m.site.challenges.platform} options={sel.program.platforms.map((p) => ({ value: p, label: m.labels.platform[p] }))} />
            <p className="mt-1 text-xs text-muted">{m.site.challenges.platformNote}</p>
          </div>
        )}
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-line-2 bg-line-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <div className="bg-card p-3">
            <dt className="text-xs text-muted">{m.site.challenges.termsSize}</dt>
            <dd className="num mt-1 font-display text-xl font-bold">{f.money(sel.size, { decimals: 0 })}</dd>
            <dd className="mt-1 text-[0.72rem] leading-snug text-muted">{s.sizeNote}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="text-xs text-muted">{s.fee}</dt>
            <dd className="num mt-1 font-display text-xl font-bold text-copper-700">{f.money(price, { decimals: 0 })}</dd>
            <dd className="mt-1 text-[0.72rem] leading-snug text-muted">{s.feeNote}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="text-xs text-muted">{m.site.challenges.termsReward}</dt>
            <dd className="num mt-1 font-display text-xl font-bold">{f.bps(rs.payout.profitSplitBps)}</dd>
            <dd className="mt-1 text-[0.72rem] leading-snug text-muted">{t(s.rewardExample, { gross: f.money(exampleGross, { decimals: 0 }), net: f.money(exampleNet, { decimals: 0 }) })}</dd>
          </div>
        </dl>
        <Button variant="accent" size="lg" className="w-full" onClick={go}>
          {t(s.cta, { program: l(sel.program.name), size: formatSize(sel.size) })}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
        <p className="text-xs text-muted">{t(m.site.challenges.ruleVersion, { v: rs.version, date: rs.publishedAt })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[14px] border border-line-2 bg-card">
          <div className="border-b border-line-2 bg-paper-2/60 px-4 py-2.5">
            <h3 className="eyebrow text-petrol-700">{s.evalStage}</h3>
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">{s.evalStage}</caption>
            {evalCols.length > 1 && (
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="px-4 pt-2 font-medium">
                    <span className="sr-only">{m.site.rulesSummary.rule}</span>
                  </th>
                  {evalCols.map((p) => (
                    <th key={p.kind} scope="col" className="px-2 pt-2 font-semibold text-ink">
                      {l(p.label)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {evaluationRows(rs, sel.size, m, locale).map((r) => (
                <tr key={r.key} className="border-b border-line-2 last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-normal text-muted">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className="num px-2 py-2 font-medium">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-petrol-700/30 bg-petrol-900 text-paper">
          <div className="border-b border-paper/10 px-4 py-2.5">
            <h3 className="eyebrow text-copper-300">{s.fundedStage}</h3>
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">{s.fundedStage}</caption>
            <tbody>
              {fundedRows(rs, sel.size, m, locale).map((r) => (
                <tr key={r.key} className="border-b border-paper/10 last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-normal text-paper/65">
                    {r.label}
                  </th>
                  <td className="num px-3 py-2 font-medium">{r.values[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
