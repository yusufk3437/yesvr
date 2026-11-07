"use client";

import { useI18n } from "@/i18n/provider";
import { Notice } from "../ui";
import { PageHero } from "./page-hero";

export function LegalPage({ slug }: { slug: "terms" | "privacy" | "risk" | "refunds" }) {
  const { m } = useI18n();
  const doc = m.legal[slug];
  return (
    <>
      <PageHero eyebrow={m.footer.legal} title={doc.title} intro={m.legal.updated} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Notice tone="warn">{m.legal.draft}</Notice>
        <div className="mt-8 space-y-6">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-lg font-bold">{s.h}</h2>
              <p className="mt-2 leading-relaxed text-graphite">{s.p}</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
