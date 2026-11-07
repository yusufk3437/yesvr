"use client";

import { useI18n } from "@/i18n/provider";
import { cx } from "./ui";

export function LangSwitch({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  const { locale, setLocale, m } = useI18n();
  return (
    <div role="group" aria-label={m.common.language} className={cx("inline-flex rounded-[9px] border p-0.5", tone === "dark" ? "border-line bg-paper-2" : "border-paper/25 bg-paper/10", className)}>
      {(["en", "tr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => locale !== l && setLocale(l)}
          className={cx(
            "h-7 min-w-9 rounded-[7px] px-2 font-display text-[0.72rem] font-bold tracking-[0.1em] transition-colors",
            locale === l
              ? tone === "dark"
                ? "bg-ink text-paper"
                : "bg-paper text-petrol-900"
              : tone === "dark"
                ? "text-muted hover:text-ink"
                : "text-paper/70 hover:text-paper",
          )}
        >
          <span aria-hidden>{l.toUpperCase()}</span>
          <span className="sr-only">{l === "en" ? "English" : "Türkçe"}</span>
        </button>
      ))}
    </div>
  );
}
