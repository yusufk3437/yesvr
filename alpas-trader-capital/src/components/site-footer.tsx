"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { Contours, Wordmark } from "./brand";
import { LangSwitch } from "./lang-switch";

export function SiteFooter() {
  const { m } = useI18n();
  const cols = [
    {
      title: m.footer.product,
      links: [
        { href: "/challenges", label: m.nav.challenges },
        { href: "/rules", label: m.nav.rules },
        { href: "/payouts", label: m.nav.payouts },
        { href: "/scaling", label: m.nav.scaling },
        { href: "/verify", label: m.nav.verify },
      ],
    },
    {
      title: m.footer.company,
      links: [
        { href: "/about", label: m.nav.about },
        { href: "/help", label: m.nav.help },
        { href: "/contact", label: m.nav.contact },
        { href: "/dashboard/demo", label: m.demo.tools },
      ],
    },
    {
      title: m.footer.legal,
      links: [
        { href: "/legal/terms", label: m.footer.terms },
        { href: "/legal/privacy", label: m.footer.privacy },
        { href: "/legal/risk", label: m.footer.risk },
        { href: "/legal/refunds", label: m.footer.refunds },
      ],
    },
  ];
  return (
    <footer className="no-print relative overflow-hidden bg-navy-950 text-paper/80">
      <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.06} seed={31} />
      <div className="relative mx-auto max-w-[1320px] px-4 pb-10 pt-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark tone="light" />
            <p className="mt-4 max-w-xs font-serif text-lg italic text-paper/70">{m.footer.tagline}</p>
            <LangSwitch tone="light" className="mt-6" />
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="eyebrow text-brass-300">{c.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-paper">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-12 max-w-4xl border-t border-paper/10 pt-6 text-[0.8rem] leading-relaxed text-paper/55">{m.footer.disclaimer}</p>
        <p className="mt-3 text-[0.75rem] text-paper/40">© ALPAS Trader Capital · {m.footer.rights}</p>
      </div>
    </footer>
  );
}
