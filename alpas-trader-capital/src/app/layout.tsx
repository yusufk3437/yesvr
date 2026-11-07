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
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    robots: { index: false, follow: false },
    icons: { icon: "/icon.svg" },
    openGraph: {
      type: "website",
      siteName: "ALPAS Trader Capital",
      title: m.title,
      description: m.description,
      locale: locale === "tr" ? "tr_TR" : "en_US",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "ALPAS Trader Capital — a clear route from evaluation to funded trading (product prototype)" }],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/og.png"] },
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
