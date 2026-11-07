"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { applyBps, formatSize } from "@/domain/money";
import { bestSizeForBudget, pricePerThousand, quoteSize, type SizeQuote } from "@/domain/pricing";
import type { ProgramId } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { setCart } from "@/services/actions";
import { Button, Card, Field, Input, Notice, Pill, Segmented } from "../ui";

/** "What is your budget?" — custom account sizes between the standard plans. */
export function BudgetPlanner() {
  const { m, t, f, l } = useI18n();
  const { programs, current } = useCatalog();
  const { run } = useStore();
  const router = useRouter();
  const b = m.site.budget;
  const [programId, setProgramId] = useState<ProgramId>("ascent");
  const [mode, setMode] = useState<"size" | "fee">("size");
  const [size, setSize] = useState(3_500_000);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [snapped, setSnapped] = useState(false);
  const [feeInput, setFeeInput] = useState("250");
  const program = programs.find((p) => p.id === programId)!;
  const c = program.customSizing;
  const rs = current(programId);

  const parse = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, "")) * 100);
  let quote: SizeQuote | null = null;
  let error: string | null = null;
  const clampSize = (v: number) => Math.min(c.maxSize, Math.max(c.minSize, Math.round(v / c.step) * c.step));
  const current_ = clampSize(size);
  const commitDraft = () => {
    const v = parse(draft);
    if (v > 0) {
      const next = clampSize(v);
      setSnapped(next !== v);
      setSize(next);
    }
    setEditing(false);
  };
  if (mode === "size") {
    const q = quoteSize(program, current_);
    if ("error" in q) error = m.errors[q.error];
    else quote = q;
  } else {
    quote = bestSizeForBudget(program, parse(feeInput));
    if (!quote) error = t(b.noFit, { price: f.money(Math.min(...program.sizes.map((s) => s.price)), { decimals: 0 }) });
  }
  const perK = program.sizes.map((s) => pricePerThousand(s.price, s.size));
  const range = `${f.money(Math.min(...perK), { decimals: 2 })}–${f.money(Math.max(...perK), { decimals: 2 })}`;
  const phase = rs.phases[0];
  const go = (size: number) => {
    run((st) => setCart(st, { programId, size, platform: "mt5" }));
    router.push(`/checkout?program=${programId}&size=${size / 100}&platform=mt5`);
  };

  return (
    <section id="budget" aria-labelledby="budget-title" className="scroll-mt-24 border-y border-line-2 bg-card">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="eyebrow text-brass-700" lang="en">
            {b.eyebrow}
          </p>
          <h2 id="budget-title" className="mt-2 font-serif text-[2rem] font-semibold leading-[1.1] sm:text-[2.4rem]">
            {b.title}
          </h2>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-muted">{b.intro}</p>
          <div className="mt-6 space-y-4">
            <div>
              <Segmented value={programId} onChange={setProgramId} label={m.site.selector.program} options={programs.map((p) => ({ value: p.id, label: l(p.name) }))} />
              <p className="mt-1 text-xs text-muted">{l(program.model)}</p>
            </div>
            <div>
              <Segmented value={mode} onChange={setMode} label={b.eyebrow} options={[{ value: "size", label: b.modeSize }, { value: "fee", label: b.modeFee }]} />
            </div>
            {mode === "size" ? (
              <p className="text-sm text-muted">{t(b.sizeHint, { min: f.money(c.minSize, { decimals: 0 }), max: f.money(c.maxSize, { decimals: 0 }), step: f.money(c.step, { decimals: 0 }) })}</p>
            ) : (
              <Field label={b.feeLabel} htmlFor="bp-fee" hint={b.feeHint} error={error}>
                <Input id="bp-fee" inputMode="numeric" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} aria-invalid={!!error} className="num h-12 text-lg" />
              </Field>
            )}
            <p className="text-xs leading-relaxed text-muted">
              {t(b.pricingNote, { premium: f.bps(c.premiumBps), factor: f.bps(c.promoFactorBps, 0), example: f.bps(Math.floor((1000 * c.promoFactorBps) / 10_000)) })}
            </p>
          </div>
        </div>

        <Card as="div" className="self-start overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line-2 bg-navy-900 px-5 py-4 text-paper">
            <p className="font-display font-bold">{b.resultTitle}</p>
            {quote && <Pill tone={quote.custom ? "accent" : "navy"}>{quote.custom ? b.customBadge : b.standardBadge}</Pill>}
          </div>
          {!quote ? (
            <p className="p-5 text-sm text-muted">{error}</p>
          ) : (
            <div className="space-y-5 p-5">
              <dl className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-[0.08em] text-muted">{m.site.challenges.termsSize}</dt>
                  <dd className="mt-1">
                    {mode === "size" && editing ? (
                      <Input
                        autoFocus
                        aria-label={b.editSize}
                        inputMode="numeric"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitDraft();
                          if (e.key === "Escape") setEditing(false);
                        }}
                        className="num h-12 max-w-[14rem] font-display text-2xl font-bold"
                      />
                    ) : mode === "size" ? (
                      <button
                        type="button"
                        aria-label={`${b.editSize}: ${f.money(quote.size, { decimals: 0 })}`}
                        onClick={() => {
                          setDraft(String(quote!.size / 100));
                          setEditing(true);
                        }}
                        className="num rounded-md font-display text-3xl font-bold underline decoration-brass decoration-dashed decoration-2 underline-offset-[6px] hover:text-navy-700"
                      >
                        {f.money(quote.size, { decimals: 0 })}
                      </button>
                    ) : (
                      <span className="num font-display text-3xl font-bold">{f.money(quote.size, { decimals: 0 })}</span>
                    )}
                  </dd>
                  {mode === "size" && (
                    <dd className="mt-3">
                      <input
                        type="range"
                        min={c.minSize}
                        max={c.maxSize}
                        step={c.step}
                        value={current_}
                        onChange={(e) => {
                          setSize(Number(e.target.value));
                          setSnapped(false);
                        }}
                        aria-label={m.site.challenges.termsSize}
                        aria-valuetext={f.money(current_, { decimals: 0 })}
                        className="h-8 w-full cursor-pointer accent-[var(--color-brass)]"
                      />
                      <div className="num flex justify-between text-xs text-muted">
                        <span>{formatSize(c.minSize)}</span>
                        <span>{formatSize(c.maxSize)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{snapped ? t(b.snapped, { step: f.money(c.step, { decimals: 0 }) }) : b.slideHint}</p>
                    </dd>
                  )}
                  <dd className="mt-1 text-xs text-muted">{m.site.selector.sizeNote}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.08em] text-muted">{b.fee}</dt>
                  <dd className="num mt-1 font-display text-2xl font-bold text-brass-700">{f.money(quote.price, { decimals: 0 })}</dd>
                  <dd className="num mt-0.5 text-xs text-muted">
                    {b.perK}: {f.money(pricePerThousand(quote.price, quote.size))}
                  </dd>
                </div>
              </dl>
              <p className="num text-xs text-muted">{t(b.standardRange, { range })}</p>
              <div className="rounded-[12px] border border-line-2 bg-paper/70 p-4">
                <p className="text-sm font-semibold">
                  {b.limits} · {l(program.name)} v{rs.version}
                </p>
                <dl className="num mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{b.target}</dt>
                    <dd>{phase.profitTargetBps ? f.money(applyBps(quote.size, phase.profitTargetBps), { decimals: 0 }) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{b.daily}</dt>
                    <dd>{f.money(applyBps(quote.size, phase.dailyLossBps), { decimals: 0 })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{b.max}</dt>
                    <dd>{f.money(applyBps(quote.size, phase.maxLoss.bps), { decimals: 0 })}</dd>
                  </div>
                </dl>
              </div>
              {quote.betterStandard && (
                <Notice tone="info">
                  {t(b.better, { size: formatSize(quote.betterStandard.size), price: f.money(quote.betterStandard.price, { decimals: 0 }) })}
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => go(quote!.betterStandard!.size)}>
                    {t(b.useBetter, { size: formatSize(quote.betterStandard.size) })}
                  </Button>
                </Notice>
              )}
              <Button variant="accent" size="lg" className="w-full" onClick={() => go(quote!.size)}>
                {t(b.cta, { program: l(program.name), size: formatSize(quote.size) })} <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
