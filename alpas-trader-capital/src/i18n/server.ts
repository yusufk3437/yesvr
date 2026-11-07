import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/domain/l10n";
import { LOCALE_COOKIE } from "./config";

export async function getRequestLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
