export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** A string that exists in every supported locale. */
export type L10n = Record<Locale, string>;

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "tr";

export function l(text: L10n, locale: Locale): string {
  return text[locale] ?? text.en;
}

/** Interpolate `{name}` placeholders. Values are inserted as plain text. */
export function fmt(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}
