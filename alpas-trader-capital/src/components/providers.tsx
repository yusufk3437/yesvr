"use client";

import type { Locale } from "@/domain/l10n";
import { I18nProvider } from "@/i18n/provider";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "./ui";
import { AssistantProvider } from "./assistant/context";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <I18nProvider initialLocale={locale}>
      <StoreProvider>
        <ToastProvider>
          <AssistantProvider>{children}</AssistantProvider>
        </ToastProvider>
      </StoreProvider>
    </I18nProvider>
  );
}
