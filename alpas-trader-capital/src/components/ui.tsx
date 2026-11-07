"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, OctagonAlert, X } from "lucide-react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ───────────── Buttons ───────────── */

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap";
const btnVariant: Record<Variant, string> = {
  primary: "bg-navy-800 text-paper hover:bg-navy-700 active:bg-navy-900",
  accent: "bg-brass text-navy-950 hover:bg-brass-300",
  outline: "border border-line bg-card text-ink hover:border-graphite-3 hover:bg-white",
  ghost: "text-ink hover:bg-paper-2",
  danger: "bg-loss text-white hover:brightness-110",
  light: "bg-paper text-navy-900 hover:bg-white",
};
const btnSize: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.82rem]",
  md: "h-10 px-4 text-[0.92rem]",
  lg: "h-12 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={cx(btnBase, btnVariant[variant], btnSize[size], className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  href,
  children,
  ...rest
}: { variant?: Variant; size?: Size; className?: string; href: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={cx(btnBase, btnVariant[variant], btnSize[size], className)} {...rest}>
      {children}
    </Link>
  );
}

/* ───────────── Surfaces ───────────── */

export function Card({ className, children, as: As = "section", ...rest }: { className?: string; children: React.ReactNode; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx("rounded-[var(--radius-card)] border border-line-2 bg-card shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, sub, action, id }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[1.02rem] font-bold tracking-tight text-ink">
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ───────────── Status ───────────── */

export type Tone = "gain" | "loss" | "warn" | "info" | "neutral" | "accent" | "navy";
const toneCls: Record<Tone, string> = {
  gain: "bg-gain-100 text-gain-700 border-gain/25",
  loss: "bg-loss-100 text-loss border-loss/25",
  warn: "bg-warn-100 text-warn-700 border-warn-500/30",
  info: "bg-info-100 text-info border-info/25",
  neutral: "bg-paper-2 text-graphite-2 border-line",
  accent: "bg-brass-100 text-brass-700 border-brass/25",
  navy: "bg-navy-100 text-navy-800 border-navy-700/20",
};
const toneIcon: Record<Tone, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> | null> = {
  gain: CheckCircle2,
  loss: OctagonAlert,
  warn: AlertTriangle,
  info: CircleDashed,
  neutral: null,
  accent: null,
  navy: Info,
};

export function Pill({ tone = "neutral", children, icon = true, className }: { tone?: Tone; children: React.ReactNode; icon?: boolean; className?: string }) {
  const Icon = icon ? toneIcon[tone] : null;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.75rem] font-medium leading-5 whitespace-nowrap", toneCls[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export const pnlTone = (v: number): Tone => (v > 0 ? "gain" : v < 0 ? "loss" : "neutral");
export const pnlText = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-ink");

export function Meter({ value, max, tone = "navy", label, className }: { value: number; max: number; tone?: "navy" | "gain" | "loss" | "warn" | "brass"; label: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar = { navy: "bg-navy-700", gain: "bg-gain", loss: "bg-loss", warn: "bg-warn-500", brass: "bg-brass" }[tone];
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-paper-2", className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "gain" | "loss"; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[0.74rem] font-medium uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={cx("num mt-1 truncate font-display text-[1.28rem] font-bold tracking-tight", tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink")}>{value}</div>
      {sub && <div className="num mt-0.5 text-[0.8rem] text-muted">{sub}</div>}
    </div>
  );
}

/* ───────────── Forms ───────────── */

export function Field({ label, hint, error, children, htmlFor, optional }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; htmlFor: string; optional?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-subtle">{optional}</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="flex items-center gap-1 text-xs font-medium text-loss">
          <AlertTriangle className="size-3.5" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-line bg-white px-3 py-2 text-[0.94rem] text-ink placeholder:text-subtle focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/20 aria-[invalid=true]:border-loss";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, "h-10", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "h-10 pr-8", props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "min-h-24", props.className)} />;
}
export function Checkbox({ label, id, ...props }: { label: React.ReactNode; id: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-graphite">
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-navy-700" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-[11px] border border-line bg-paper-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-8 rounded-[9px] px-3 py-1 text-[0.84rem] font-medium leading-tight transition-colors",
            value === o.value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Tabs ───────────── */

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number }[]; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].value);
  };
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-px">
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(t.value)}
          className={cx(
            "relative h-9 shrink-0 rounded-[9px] px-3 text-[0.86rem] font-medium transition-colors",
            value === t.value ? "bg-ink text-paper" : "text-muted hover:bg-paper-2 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cx("num ml-1.5 rounded-full px-1.5 text-[0.72rem]", value === t.value ? "bg-paper/20" : "bg-paper-2")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Dialog ───────────── */

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-[16px] border border-line-2 bg-card p-0 text-ink shadow-2xl backdrop:backdrop-blur-[1px]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line-2 px-5 py-4">
            <h2 id={titleId} className="font-display text-lg font-bold tracking-tight">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-2 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ───────────── Toasts ───────────── */

type ToastItem = { id: number; tone: "gain" | "loss" | "info" | "warn"; text: string };
const ToastCtx = createContext<(tone: ToastItem["tone"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastItem["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div key={t.id} className={cx("fade-up pointer-events-auto flex max-w-md items-start gap-2 rounded-[12px] border px-4 py-3 text-sm shadow-lg", toneCls[t.tone], "bg-card")}>
            {t.tone === "gain" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : t.tone === "loss" ? <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span className="text-ink">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ───────────── States ───────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-paper-2", className)} aria-hidden />;
}

export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cx("h-4", i % 2 ? "w-2/3" : "w-full")} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-subtle">{icon ?? <CircleDashed className="size-8" aria-hidden />}</div>
      <p className="font-display font-bold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, body, onRetry, retryLabel }: { title: string; body?: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <OctagonAlert className="mb-3 size-8 text-loss" aria-hidden />
      <p className="font-display font-bold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "loss" | "gain" | "accent"; title?: string; children: React.ReactNode; className?: string }) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "loss" ? OctagonAlert : tone === "gain" ? CheckCircle2 : Info;
  return (
    <div className={cx("flex gap-3 rounded-[12px] border px-4 py-3 text-sm", toneCls[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-ink">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5 text-graphite-2" : ""}>{children}</div>
      </div>
    </div>
  );
}

/* ───────────── Tables ───────────── */

export function Table({ children, caption, className }: { children: React.ReactNode; caption: string; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)} tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[0.86rem]">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const th = "border-b border-line px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted whitespace-nowrap";
export const td = "border-b border-line-2 px-4 py-2.5 align-middle";

export function SectionTitle({ eyebrow, title, intro, align = "left", tone = "dark" }: { eyebrow?: string; title: React.ReactNode; intro?: React.ReactNode; align?: "left" | "center"; tone?: "dark" | "light" }) {
  return (
    <div className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className={cx("eyebrow", tone === "light" ? "text-brass-300" : "text-brass-700")}>{eyebrow}</p>}
      <h2 className={cx("mt-2 font-serif text-[2rem] font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[2.5rem]", tone === "light" ? "text-paper" : "text-ink")}>{title}</h2>
      {intro && <p className={cx("mt-4 text-[1.02rem] leading-relaxed", tone === "light" ? "text-paper/75" : "text-muted")}>{intro}</p>}
    </div>
  );
}
