"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, type L10n, type Locale } from "@/domain/l10n";
import { formatBps, formatMoney, formatNumber, formatRatio, formatSize } from "@/domain/money";
import { formatInZone } from "@/domain/time";
import { LOCALE_COOKIE } from "./config";
import { messages, type Messages } from "./messages";

const NY = "America/New_York";

function makeFormat(locale: Locale) {
  const userTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  return {
    money: (c: number, opts: { sign?: boolean; decimals?: 0 | 2 } = {}) => formatMoney(c, locale, opts),
    size: formatSize,
    bps: (b: number, digits?: number) => formatBps(b, locale, digits),
    ratio: (r: number, digits?: number) => formatRatio(r, locale, digits),
    num: (n: number, digits = 2) => formatNumber(n, locale, digits),
    /** Date in the user's own time zone. */
    date: (ts: number) => formatInZone(ts, userTz, locale, { dateStyle: "medium" }),
    dateTime: (ts: number) => formatInZone(ts, userTz, locale, { dateStyle: "medium", timeStyle: "short" }),
    time: (ts: number) => formatInZone(ts, userTz, locale, { timeStyle: "short" }),
    /** Date/time in the rule time zone (New York). */
    ny: (ts: number, withDate = true) =>
      formatInZone(ts, NY, locale, withDate ? { dateStyle: "medium", timeStyle: "short" } : { timeStyle: "short" }),
    userTz,
  };
}

interface I18nApi {
  locale: Locale;
  m: Messages;
  t: (template: string, values?: Record<string, string | number>) => string;
  l: (text: L10n) => string;
  f: ReturnType<typeof makeFormat>;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<I18nApi | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );
  const api = useMemo<I18nApi>(
    () => ({
      locale,
      m: messages[locale],
      t: fmt,
      l: (text: L10n) => text[locale] ?? text.en,
      f: makeFormat(locale),
      setLocale,
    }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
