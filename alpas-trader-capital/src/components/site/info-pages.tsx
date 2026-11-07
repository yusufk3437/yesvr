"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircleQuestion, Search } from "lucide-react";
import { normalize } from "@/domain/assistant";
import { applyBps, usd } from "@/domain/money";
import { quotePayout } from "@/domain/payout";
import { useI18n } from "@/i18n/provider";
import { useCatalog, useKnowledge } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { createTicket } from "@/services/actions";
import { useAssistant } from "../assistant/context";
import { Button, Card, Field, Input, Notice, Select, Textarea, Table, td, th, useToast } from "../ui";
import { PageHero } from "./page-hero";

/* ───────────── Payout policy ───────────── */

export function PayoutPolicyPage() {
  const { m, l, f, locale } = useI18n();
  const { programs, current } = useCatalog();
  const kb = useKnowledge();
  const p = m.site.payoutsPage;
  const rs = current("ascent");
  const q = quotePayout(usd(4_000), rs.payout.profitSplitBps, programs[0].sizes[3].price);
  const steps = ["requested", "under_review", "approved", "processing", "paid"] as const;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} intro={p.intro} />
      <div className="mx-auto max-w-[1320px] space-y-12 px-4 py-12 sm:px-6">
        <section aria-labelledby="flow">
          <h2 id="flow" className="font-display text-2xl font-extrabold tracking-tight">
            {p.timeline}
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-5">
            {steps.map((s, i) => (
              <li key={s} className="relative rounded-[14px] border border-line-2 bg-card p-4">
                <span className="num font-display text-xs font-bold text-brass-700">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-1 font-display font-bold">{m.labels.payoutStatus[s]}</p>
                <p className="mt-1 text-sm text-muted">{p.statuses[s]}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(["rejected", "cancelled"] as const).map((s) => (
              <div key={s} className="rounded-[14px] border border-dashed border-line p-4">
                <p className="font-display font-bold">{m.labels.payoutStatus[s]}</p>
                <p className="mt-1 text-sm text-muted">{p.statuses[s]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2" aria-labelledby="quote">
          <Card className="p-5">
            <h2 id="quote" className="font-display text-xl font-extrabold">
              {p.quote}
            </h2>
            <p className="mt-1 text-sm text-muted">{l(programs[0].name)} 100K · v{rs.version}</p>
            <dl className="num mt-4 divide-y divide-line-2 text-sm">
              {[
                [p.gross, f.money(q.gross)],
                [`${p.trader} (${f.bps(q.splitBps)})`, f.money(q.traderShare)],
                [p.company, f.money(q.companyShare)],
                [p.refund, f.money(q.feeRefund)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              <div className="flex justify-between py-2 font-semibold">
                <dt>{p.net}</dt>
                <dd>{f.money(q.netToTrader)}</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-xl font-extrabold">{p.reserveTitle}</h2>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-graphite">{p.reserveBody}</p>
          </Card>
        </section>

        {programs.map((pr) => {
          const r = current(pr.id);
          const items = kb.filter((a) => a.category === "payout" && a.ruleSetId === r.id);
          return (
            <section key={pr.id} aria-labelledby={`po-${pr.id}`}>
              <h2 id={`po-${pr.id}`} className="font-display text-2xl font-extrabold tracking-tight">
                {l(pr.name)} <span className="text-base font-normal text-muted">v{r.version}</span>
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {items.map((a) => (
                  <article key={a.id} id={a.anchor} className="scroll-mt-28 rounded-[14px] border border-line-2 bg-card p-5 target:ring-2 target:ring-brass/40">
                    <h3 className="font-display font-bold">{a.title[locale]}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-graphite">{a.body[locale]}</p>
                    {a.example && <p className="num mt-2 rounded-md bg-paper px-3 py-2 text-sm">{a.example[locale]}</p>}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        {/* Older rule versions remain addressable for accounts locked to them. */}
        <OlderPayoutVersions />
      </div>
    </>
  );
}

function OlderPayoutVersions() {
  const { locale, m } = useI18n();
  const { programs, ruleSets } = useCatalog();
  const kb = useKnowledge();
  const older = ruleSets.filter((r) => !programs.some((p) => p.currentRuleSetId === r.id));
  if (!older.length) return null;
  return (
    <details className="rounded-[14px] border border-line-2 bg-paper-2/40 p-4">
      <summary className="cursor-pointer font-medium">
        {m.site.payoutsPage.older}: {older.map((r) => `${programs.find((p) => p.id === r.programId)?.code} v${r.version}`).join(", ")}
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {kb
          .filter((a) => a.category === "payout" && older.some((r) => r.id === a.ruleSetId))
          .map((a) => (
            <article key={a.id} id={a.anchor} className="scroll-mt-28 rounded-[12px] border border-line-2 bg-card p-4 target:ring-2 target:ring-brass/40">
              <h3 className="font-display text-sm font-bold">
                {a.title[locale]} · v{a.version}
              </h3>
              <p className="mt-1 text-sm text-graphite">{a.body[locale]}</p>
            </article>
          ))}
      </div>
    </details>
  );
}

/* ───────────── Scaling ───────────── */

export function ScalingPage() {
  const { m, f, t } = useI18n();
  const { current } = useCatalog();
  const s = m.site.scaling;
  const rs = current("ascent");
  const sc = rs.scaling;
  const rows: { period: string; size: number; split: number }[] = [];
  for (let i = 0, size = usd(100_000); i < 5; i++) {
    rows.push({ period: i === 0 ? "0" : `+${i * sc.reviewEveryMonths}m`, size, split: i === 0 ? rs.payout.profitSplitBps : rs.payout.scaledProfitSplitBps });
    size = Math.min(sc.maxCombinedNominal, size + applyBps(size, sc.increaseBps));
  }
  return (
    <>
      <PageHero eyebrow={s.eyebrow} title={s.title} intro={s.intro} />
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-xl font-extrabold">{s.conditions}</h2>
          <ul className="mt-4 space-y-3 text-[0.95rem]">
            {[t(s.cond1, { pct: f.bps(sc.minNetProfitBps), months: sc.reviewEveryMonths }), t(s.cond2, { n: sc.minPaidPayouts }), s.cond3].map((c, i) => (
              <li key={i} className="flex gap-3">
                <span className="num font-display font-bold text-brass-700">{String(i + 1).padStart(2, "0")}</span>
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted">{t(s.cap, { cap: f.money(sc.maxCombinedNominal, { decimals: 0 }) })}</p>
          <p className="mt-2 text-sm text-muted">{s.note}</p>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line-2 px-5 py-4">
            <h2 className="font-display text-xl font-extrabold">{s.example}</h2>
          </div>
          <Table caption={s.example}>
            <thead>
              <tr>
                <th className={th}>{s.period}</th>
                <th className={th}>{s.size}</th>
                <th className={th}>{s.split}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <td className={`${td} num`}>{r.period}</td>
                  <td className={`${td} num`}>{f.money(r.size, { decimals: 0 })}</td>
                  <td className={`${td} num`}>{f.bps(r.split)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}

/* ───────────── About ───────────── */

export function AboutPage() {
  const { m } = useI18n();
  const a = m.site.about;
  return (
    <>
      <PageHero eyebrow={a.eyebrow} title={a.title} intro={a.intro} />
      <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{a.principlesTitle}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {a.principles.map((p, i) => (
            <article key={p.title} className="flex gap-4 border-t-2 border-ink pt-4">
              <span className="num font-display text-2xl font-extrabold text-brass-700">{i + 1}</span>
              <div>
                <h3 className="font-display text-lg font-bold">{p.title}</h3>
                <p className="mt-1 text-muted">{p.body}</p>
              </div>
            </article>
          ))}
        </div>
        <Notice tone="warn" title={a.statusTitle} className="mt-10">
          {a.status}
        </Notice>
      </div>
    </>
  );
}

/* ───────────── Help center ───────────── */

export function HelpPage() {
  const { m, locale } = useI18n();
  const { programs } = useCatalog();
  const kb = useKnowledge();
  const { ask } = useAssistant();
  const h = m.site.help;
  const [q, setQ] = useState("");
  const current = new Set(programs.map((p) => p.currentRuleSetId));
  const nq = normalize(q);
  const match = (a: (typeof kb)[number]) => !nq || normalize(`${a.title[locale]} ${a.body[locale]} ${a.keywords.join(" ")}`).includes(nq);
  const cats: { key: "help" | "payout" | "faq" | "rule"; items: typeof kb }[] = [
    { key: "help", items: kb.filter((a) => a.category === "help" && match(a)) },
    { key: "payout", items: kb.filter((a) => a.category === "payout" && (!a.ruleSetId || (current.has(a.ruleSetId) && a.programId === "ascent")) && match(a)) },
    { key: "faq", items: kb.filter((a) => a.category === "faq" && !a.flagged && match(a)) },
    { key: "rule", items: nq ? kb.filter((a) => a.category === "rule" && a.ruleSetId && current.has(a.ruleSetId) && match(a)).slice(0, 8) : [] },
  ];
  const total = cats.reduce((s, c) => s + c.items.length, 0);
  return (
    <>
      <PageHero eyebrow={h.eyebrow} title={h.title} intro={h.intro}>
        <div className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="help-search" className="sr-only">
              {h.searchLabel}
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input id="help-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={h.searchPlaceholder} className="h-12 pl-9" />
          </div>
          <Button variant="primary" size="lg" onClick={() => ask(q || h.searchPlaceholder)}>
            <MessageCircleQuestion className="size-4" aria-hidden /> {m.common.openAssistant}
          </Button>
        </div>
      </PageHero>
      <div className="mx-auto max-w-[1320px] space-y-10 px-4 py-12 sm:px-6">
        {total === 0 && <p className="rounded-[12px] border border-dashed border-line p-6 text-center text-muted">{h.empty}</p>}
        {cats
          .filter((c) => c.items.length)
          .map((c) => (
            <section key={c.key} aria-labelledby={`h-${c.key}`}>
              <h2 id={`h-${c.key}`} className="font-display text-xl font-extrabold tracking-tight">
                {h.categories[c.key]}
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {c.items.map((a) => (
                  <details key={a.id} id={a.anchor} className="group scroll-mt-28 rounded-[14px] border border-line-2 bg-card p-4 open:shadow-[var(--shadow-card)] target:ring-2 target:ring-brass/40" open={!!nq || undefined}>
                    <summary className="cursor-pointer list-none font-display font-bold">
                      {a.title[locale]}
                      {a.version && <span className="ml-2 text-xs font-normal text-subtle">v{a.version}</span>}
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-graphite">{a.body[locale]}</p>
                    {a.category === "rule" && (
                      <Link href={a.href} className="mt-2 inline-block text-xs text-navy-700 hover:underline">
                        {m.nav.rules} →
                      </Link>
                    )}
                  </details>
                ))}
              </div>
            </section>
          ))}
        <Link href="/contact" className="inline-block font-medium text-navy-700 hover:underline">
          {h.contact} →
        </Link>
      </div>
    </>
  );
}

/* ───────────── Contact ───────────── */

export function ContactPage() {
  const { m, t } = useI18n();
  const { run, actor, state } = useStore();
  const toast = useToast();
  const c = m.site.contact;
  const user = state?.users.find((u) => u.id === state.session.userId);
  const [form, setForm] = useState({ name: "", email: "", category: "general" as const as string, subject: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          {sent ? (
            <Notice tone="gain" title={t(c.sent, { id: sent })}>
              {c.sentNote}
            </Notice>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const r = run((s, n) =>
                  createTicket(
                    s,
                    actor,
                    {
                      subject: form.subject,
                      body: `${form.message}${actor ? "" : `\n\n— ${form.name}`}`,
                      category: form.category as never,
                      email: actor ? undefined : form.email,
                      source: actor ? "dashboard" : "contact_form",
                    },
                    n,
                  ),
                );
                if (r.ok) {
                  setSent(r.value.ticketId);
                  toast("gain", t(c.sent, { id: r.value.ticketId }));
                } else setError(m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic);
              }}
            >
              {!user && (
                <>
                  <Field label={c.name} htmlFor="c-name">
                    <Input id="c-name" value={form.name} onChange={set("name")} autoComplete="name" />
                  </Field>
                  <Field label={c.email} htmlFor="c-email">
                    <Input id="c-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
                  </Field>
                </>
              )}
              <Field label={c.category} htmlFor="c-cat">
                <Select id="c-cat" value={form.category} onChange={set("category")}>
                  {Object.entries(c.cats).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={c.subject} htmlFor="c-subject">
                <Input id="c-subject" value={form.subject} onChange={set("subject")} required />
              </Field>
              <div className="sm:col-span-2">
                <Field label={c.message} htmlFor="c-msg" error={error}>
                  <Textarea id="c-msg" rows={6} value={form.message} onChange={set("message")} required aria-invalid={!!error} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary">
                  {c.send}
                </Button>
              </div>
            </form>
          )}
        </Card>
        <div className="space-y-4 text-sm text-muted">
          <p>{c.direct}</p>
          <p>{c.sentNote}</p>
        </div>
      </div>
    </>
  );
}
