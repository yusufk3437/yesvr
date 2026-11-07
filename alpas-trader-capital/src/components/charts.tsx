"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayStat, EquityPoint } from "@/domain/risk";
import { addDaysToKey, parseDayKey, weekdayOfKey } from "@/domain/time";
import { useI18n } from "@/i18n/provider";
import { cx } from "./ui";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

function compactUsd(cents: number, locale: "en" | "tr") {
  const d = cents / 100;
  const abs = Math.abs(d);
  const fmt = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    style: "currency",
    currency: "USD",
    notation: abs >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: abs >= 10_000 ? 1 : 0,
  });
  return fmt.format(d);
}

/* ───────────── Balance & equity line chart ───────────── */

export interface RefLine {
  value: number;
  label: string;
}

export function EquityChart({ points, refs, height = 260, labels }: { points: EquityPoint[]; refs: RefLine[]; height?: number; labels: { balance: string; equity: string; table: string; date: string } }) {
  const { locale, f } = useI18n();
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.ts - b.ts);
    if (sorted.length <= 700) return sorted;
    const step = Math.ceil(sorted.length / 700);
    return sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1);
  }, [points]);

  const m = { top: 14, right: 16, bottom: 26, left: 64 };
  const W = Math.max(280, width);
  const H = height;
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const values = data.flatMap((p) => [p.balance, p.equity]);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.004, 10_000);
  const visibleRefs = refs.filter((r) => r.value >= lo - span * 0.9 && r.value <= hi + span * 0.5);
  for (const r of visibleRefs) {
    lo = Math.min(lo, r.value);
    hi = Math.max(hi, r.value);
  }
  const pad = (hi - lo || span) * 0.08;
  lo -= pad;
  hi += pad;
  const t0 = data[0]?.ts ?? 0;
  const t1 = data[data.length - 1]?.ts ?? 1;
  const x = (ts: number) => m.left + ((ts - t0) / (t1 - t0 || 1)) * iw;
  const y = (v: number) => m.top + (1 - (v - lo) / (hi - lo || 1)) * ih;
  const ticks = niceTicks(lo, hi, 4);
  const xCount = Math.min(5, Math.max(2, Math.floor(iw / 110)));
  const xTicks = Array.from({ length: xCount }, (_, i) => t0 + ((t1 - t0) * i) / (xCount - 1));

  // Balance moves only at closes → step line; equity includes intraday dips.
  const balancePath = data.map((p, i) => (i === 0 ? `M${x(p.ts)} ${y(p.balance)}` : `H${x(p.ts)} V${y(p.balance)}`)).join(" ");
  const equityPath = data.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)} ${y(p.equity).toFixed(1)}`).join(" ");
  const hidden = refs.filter((r) => !visibleRefs.includes(r));

  const nearest = (px: number) => {
    const ts = t0 + ((px - m.left) / iw) * (t1 - t0);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(data[i].ts - ts);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  const hp = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--color-series-1)]" aria-hidden /> {labels.balance}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[var(--color-series-2)]" aria-hidden /> {labels.equity}
        </span>
        {visibleRefs.map((r) => (
          <span key={r.label} className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 bg-[var(--color-neg)]" aria-hidden /> {r.label}
          </span>
        ))}
      </div>
      <div ref={wrap} className="relative">
        {width > 0 && data.length > 1 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={`${labels.balance} / ${labels.equity}`}
            tabIndex={0}
            className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brass"
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              setHover(nearest(e.clientX - r.left));
            }}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setHover((h) => Math.max(0, Math.min(data.length - 1, (h ?? data.length - 1) + (e.key === "ArrowRight" ? 1 : -1))));
              }
              if (e.key === "Escape") setHover(null);
            }}
            onBlur={() => setHover(null)}
          >
            {ticks.map((tv) => (
              <g key={tv}>
                <line x1={m.left} x2={W - m.right} y1={y(tv)} y2={y(tv)} stroke="var(--color-grid)" strokeWidth={1} />
                <text x={m.left - 8} y={y(tv)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)" className="num">
                  {compactUsd(tv, locale)}
                </text>
              </g>
            ))}
            {xTicks.map((ts, i) => (
              <text key={i} x={x(ts)} y={H - 6} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--color-muted)">
                {f.date(ts)}
              </text>
            ))}
            {visibleRefs.map((r) => (
              <g key={r.label}>
                <line x1={m.left} x2={W - m.right} y1={y(r.value)} y2={y(r.value)} stroke="var(--color-neg)" strokeWidth={1} opacity={0.75} />
                <text x={W - m.right} y={y(r.value) - 4} textAnchor="end" fontSize={10.5} fill="var(--color-muted)" className="num">
                  {r.label} {compactUsd(r.value, locale)}
                </text>
              </g>
            ))}
            <path d={`${balancePath} V${m.top + ih} H${m.left} Z`} fill="var(--color-series-1)" opacity={0.07} />
            <path d={balancePath} fill="none" stroke="var(--color-series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={equityPath} fill="none" stroke="var(--color-series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
            {(() => {
              const last = data[data.length - 1];
              return <circle cx={x(last.ts)} cy={y(last.equity)} r={4} fill="var(--color-series-2)" stroke="var(--color-card)" strokeWidth={2} />;
            })()}
            {hp && (
              <g pointerEvents="none">
                <line x1={x(hp.ts)} x2={x(hp.ts)} y1={m.top} y2={m.top + ih} stroke="var(--color-graphite-3)" strokeWidth={1} />
                <circle cx={x(hp.ts)} cy={y(hp.balance)} r={4} fill="var(--color-series-1)" stroke="var(--color-card)" strokeWidth={2} />
                <circle cx={x(hp.ts)} cy={y(hp.equity)} r={4} fill="var(--color-series-2)" stroke="var(--color-card)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hp && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-[10px] border border-line-2 bg-card px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(hp.ts) + 12, 0), W - 180) }}
            role="status"
          >
            <div className="text-muted">{f.dateTime(hp.ts)}</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="h-0.5 w-3 bg-[var(--color-series-1)]" aria-hidden />
                {labels.balance}
              </span>
              <span className="num font-semibold text-ink">{f.money(hp.balance)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span className="h-0.5 w-3 bg-[var(--color-series-2)]" aria-hidden />
                {labels.equity}
              </span>
              <span className="num font-semibold text-ink">{f.money(hp.equity)}</span>
            </div>
          </div>
        )}
      </div>
      {hidden.length > 0 && (
        <p className="num mt-1 text-xs text-muted">
          {hidden.map((r) => `${r.label}: ${f.money(r.value)}`).join(" · ")} ↓
        </p>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-ink">{labels.table}</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-line-2">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-paper">
              <tr>
                <th className="px-2 py-1 font-medium">{labels.date}</th>
                <th className="px-2 py-1 text-right font-medium">{labels.balance}</th>
                <th className="px-2 py-1 text-right font-medium">{labels.equity}</th>
              </tr>
            </thead>
            <tbody>
              {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 60)) === 0 || i === data.length - 1).map((p) => (
                <tr key={p.ts} className="border-t border-line-2">
                  <td className="px-2 py-1">{f.dateTime(p.ts)}</td>
                  <td className="num px-2 py-1 text-right">{f.money(p.balance)}</td>
                  <td className="num px-2 py-1 text-right">{f.money(p.equity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* ───────────── Sparkline ───────────── */

export function Sparkline({ values, className, label }: { values: number[]; className?: string; label: string }) {
  if (values.length < 2) return null;
  const w = 240;
  const h = 56;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => 4 + (i / (values.length - 1)) * (w - 8);
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("w-full", className)} role="img" aria-label={label} preserveAspectRatio="none">
      <path d={`${d} L${x(values.length - 1)} ${h} L${x(0)} ${h} Z`} fill="var(--color-series-1)" opacity={0.1} />
      <path d={d} fill="none" stroke="var(--color-series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill="var(--color-series-1)" stroke="var(--color-card)" strokeWidth={2} />
    </svg>
  );
}

/* ───────────── Daily P&L calendar ───────────── */

export function PnlCalendar({ days, monthKey, labels }: { days: DayStat[]; monthKey: string; labels: { weekdays: string[]; trades: string; noTrades: string } }) {
  const { locale, f, t } = useI18n();
  const byKey = new Map(days.map((d) => [d.key, d]));
  const { year, month } = parseDayKey(monthKey);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lead = (weekdayOfKey(first) + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDaysToKey(first, i))];
  while (cells.length % 7) cells.push(null);
  const maxAbs = Math.max(1, ...days.filter((d) => d.key.startsWith(first.slice(0, 7))).map((d) => Math.abs(d.net)));
  const tint = (net: number) => {
    if (net === 0) return "var(--color-paper-2)";
    const k = 0.14 + 0.5 * Math.min(1, Math.abs(net) / maxAbs);
    const c = net > 0 ? "19 145 122" : "210 69 79";
    return `rgb(${c} / ${k.toFixed(2)})`;
  };
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-medium uppercase tracking-[0.06em] text-muted" aria-hidden>
        {labels.weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={monthKey}>
        {cells.map((key, i) => {
          if (!key) return <div key={i} aria-hidden />;
          const d = byKey.get(key);
          const wd = weekdayOfKey(key);
          const weekend = wd === 0 || wd === 6;
          const traded = !!d && (d.closed > 0 || d.opened > 0);
          const label = `${f.date(Date.UTC(year, month - 1, Number(key.slice(8)), 12))}: ${traded ? `${f.money(d!.net, { sign: true })}, ${t(labels.trades, { n: d!.closed })}` : labels.noTrades}`;
          return (
            <div
              key={key}
              role="gridcell"
              tabIndex={traded ? 0 : -1}
              aria-label={label}
              title={label}
              className={cx(
                "flex min-h-14 flex-col justify-between rounded-[8px] p-1.5 text-left transition-shadow sm:min-h-16",
                traded ? "hover:ring-2 hover:ring-graphite-3/40 focus-visible:ring-2" : weekend ? "bg-transparent" : "bg-paper/60",
              )}
              style={traded ? { background: tint(d!.net) } : undefined}
            >
              <span className={cx("text-[0.7rem]", weekend ? "text-subtle" : "text-muted")}>{Number(key.slice(8))}</span>
              {traded && (
                <span className="leading-tight">
                  <span className="num block truncate text-[0.72rem] font-semibold text-ink sm:text-[0.78rem]">
                    {(d!.net > 0 ? "+" : d!.net < 0 ? "−" : "") + compactUsd(Math.abs(d!.net), locale)}
                  </span>
                  <span className="hidden text-[0.64rem] text-graphite-2 sm:block">{t(labels.trades, { n: d!.closed })}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
