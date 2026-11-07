import type { Metadata, Viewport } from "next";
import { getRequestLocale } from "@/i18n/server";
import { messages } from "@/i18n/messages";
import { Providers } from "@/components/providers";
import { DemoBanner } from "@/components/demo-banner";
import { archivo, newsreader, plex, plexMono } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const m = messages[locale].site.meta;
  return {
    title: { default: m.title, template: "%s · ALPAS Trader Capital" },
    description: m.description,
    robots: { index: false, follow: false },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = { themeColor: "#0f2240", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} className={`${archivo.variable} ${plex.variable} ${plexMono.variable} ${newsreader.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers locale={locale}>
          <a href="#main" className="skip-link">
            {messages[locale].common.skipToContent}
          </a>
          <DemoBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
