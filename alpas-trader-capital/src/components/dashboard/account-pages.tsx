"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mail, Printer } from "lucide-react";
import { COUNTRIES, CONTRACT_VERSION } from "@/domain/catalog";
import { renderEmail } from "@/domain/emails";
import { formatSize } from "@/domain/money";
import type { Notification, Order, SupportTicket } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useSessionUser } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { changePassword, closeTicket, createTicket, markNotificationsRead, replyTicket, signContract, submitKyc, updateProfile } from "@/services/actions";
import { Monogram } from "../brand";
import { AssistantChat } from "../assistant/chat";
import { Button, Card, CardHeader, Checkbox, Dialog, EmptyState, Field, Input, Notice, Pill, Select, Table, Textarea, cx, td, th, useToast } from "../ui";
import { PageTitle } from "./common";

const err = (m: ReturnType<typeof useI18n>["m"], code: string) => m.errors[code as keyof typeof m.errors] ?? m.errors.generic;

/* ───────────── Verification: KYC + contract ───────────── */

export function VerificationPage() {
  const { m, t, f, l } = useI18n();
  const { state, run, actor } = useStore();
  const user = useSessionUser();
  const toast = useToast();
  const [kyc, setKyc] = useState({ legalName: "", dob: "", doc: "passport" as const as "passport" | "id_card" | "driving_licence", confirm: false });
  const [kycErr, setKycErr] = useState<string | null>(null);
  const [sign, setSign] = useState<Record<string, { name: string; accept: boolean; error?: string }>>({});
  if (!state || !user || !actor) return null;
  const v = m.dash.verification;
  const passed = state.challenges.filter((c) => c.userId === user.id && ["passed", "funded"].includes(c.status));
  return (
    <div>
      <PageTitle title={v.title} sub={v.sub} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={v.kycTitle} action={<Pill tone={user.kyc.status === "verified" ? "gain" : user.kyc.status === "rejected" ? "loss" : user.kyc.status === "submitted" ? "warn" : "neutral"}>{m.labels.kyc[user.kyc.status]}</Pill>} />
          <div className="space-y-4 p-5">
            <Notice tone="warn">{v.kycDemo}</Notice>
            {user.kyc.status === "verified" && <Notice tone="gain">{t(v.verified, { date: f.date(user.kyc.decidedAt ?? 0) })}</Notice>}
            {user.kyc.status === "submitted" && <Notice tone="info">{v.submitted}</Notice>}
            {user.kyc.status === "rejected" && <Notice tone="loss">{t(v.rejected, { reason: user.kyc.rejectionReason ?? "" })}</Notice>}
            {(user.kyc.status === "not_started" || user.kyc.status === "rejected") && (
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = run((s, n) => submitKyc(s, actor, { legalName: kyc.legalName, dateOfBirth: kyc.dob, documentType: kyc.doc, confirmDemo: kyc.confirm }, n));
                  if (!r.ok) setKycErr(err(m, r.error));
                  else {
                    setKycErr(null);
                    toast("gain", v.submitted);
                  }
                }}
              >
                <Field label={v.legalName} htmlFor="k-name">
                  <Input id="k-name" value={kyc.legalName} onChange={(e) => setKyc({ ...kyc, legalName: e.target.value })} autoComplete="name" />
                </Field>
                <Field label={v.dob} htmlFor="k-dob">
                  <Input id="k-dob" type="date" value={kyc.dob} onChange={(e) => setKyc({ ...kyc, dob: e.target.value })} />
                </Field>
                <Field label={v.docType} htmlFor="k-doc">
                  <Select id="k-doc" value={kyc.doc} onChange={(e) => setKyc({ ...kyc, doc: e.target.value as typeof kyc.doc })}>
                    {(["passport", "id_card", "driving_licence"] as const).map((d) => (
                      <option key={d} value={d}>
                        {v.docs[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Checkbox id="k-confirm" checked={kyc.confirm} onChange={(e) => setKyc({ ...kyc, confirm: e.target.checked })} label={v.confirmDemo} />
                </div>
                {kycErr && (
                  <p role="alert" className="text-sm text-loss sm:col-span-2">
                    {kycErr}
                  </p>
                )}
                <div className="sm:col-span-2">
                  <Button type="submit">{v.submit}</Button>
                </div>
              </form>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t(v.contractTitle, { version: CONTRACT_VERSION })} />
          <div className="space-y-4 p-5">
            {passed.length === 0 && <p className="text-sm text-muted">{v.contractNone}</p>}
            {passed.map((c) => {
              const last = c.accountIds[c.accountIds.length - 1];
              const sg = sign[c.id] ?? { name: "", accept: false };
              return (
                <div key={c.id} className="rounded-[12px] border border-line-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {l(state.catalog.programs.find((p) => p.id === c.programId)!.name)} {formatSize(c.size)} · {c.id}
                    </p>
                    <Pill tone={c.contract.status === "signed" ? "gain" : c.contract.status === "ready" ? "warn" : "neutral"}>{m.labels.contract[c.contract.status]}</Pill>
                  </div>
                  {c.contract.status === "signed" ? (
                    <div className="mt-2 text-sm text-muted">
                      <p>{t(v.signed, { name: c.contract.signerName ?? "", date: f.dateTime(c.contract.signedAt ?? 0) })}</p>
                      {c.fundedAccountId && (
                        <Link href={`/dashboard?account=${c.fundedAccountId}`} className="text-petrol-700 hover:underline">
                          {t(v.activated, { id: c.fundedAccountId })} →
                        </Link>
                      )}
                    </div>
                  ) : user.kyc.status !== "verified" ? (
                    <p className="mt-2 text-sm text-muted">{v.contractNeedKyc}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm">{t(v.contractIntro, { account: last })}</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-graphite-2">
                        {v.contractPoints.map((pt) => (
                          <li key={pt}>{pt}</li>
                        ))}
                      </ul>
                      <Field label={v.signName} htmlFor={`sign-${c.id}`} hint={user.kyc.legalName} error={sg.error}>
                        <Input id={`sign-${c.id}`} value={sg.name} onChange={(e) => setSign({ ...sign, [c.id]: { ...sg, name: e.target.value } })} className="font-serif text-lg italic" />
                      </Field>
                      <Checkbox id={`acc-${c.id}`} checked={sg.accept} onChange={(e) => setSign({ ...sign, [c.id]: { ...sg, accept: e.target.checked } })} label={v.accept} />
                      <Button
                        variant="accent"
                        onClick={() => {
                          const r = run((s, n) => signContract(s, actor, c.id, sg.name, sg.accept, n));
                          if (!r.ok) setSign({ ...sign, [c.id]: { ...sg, error: err(m, r.error) } });
                          else toast("gain", t(v.activated, { id: r.value.fundedAccountId }));
                        }}
                      >
                        {v.sign}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Orders & invoices ───────────── */

export function OrdersPage() {
  const { m, f, l } = useI18n();
  const { state } = useStore();
  const user = useSessionUser();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get("invoice"));
  if (!state || !user) return null;
  const o = m.dash.orders;
  const orders = state.orders.filter((x) => x.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const inv = orders.find((x) => x.id === open) ?? null;
  return (
    <div>
      <PageTitle title={o.title} sub={o.sub} />
      <Card>
        {orders.length === 0 ? (
          <EmptyState title={o.empty} />
        ) : (
          <Table caption={o.title}>
            <thead>
              <tr>
                <th className={th}>{o.order}</th>
                <th className={th}>{m.common.date}</th>
                <th className={th}>{o.product}</th>
                <th className={th}>{o.ruleVersion}</th>
                <th className={`${th} text-right`}>{o.total}</th>
                <th className={th}>{m.common.status}</th>
                <th className={th}>
                  <span className="sr-only">{m.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((x) => (
                <tr key={x.id}>
                  <td className={`${td} num`}>{x.id}</td>
                  <td className={`${td} num whitespace-nowrap`}>{f.date(x.createdAt)}</td>
                  <td className={td}>
                    {l(state.catalog.programs.find((p) => p.id === x.programId)!.name)} {formatSize(x.size)}
                  </td>
                  <td className={`${td} num`}>{x.ruleSetId.split("@")[1]}</td>
                  <td className={`${td} num text-right`}>{f.money(x.total)}</td>
                  <td className={td}>
                    <Pill tone="neutral" icon={false}>
                      {m.common.demo}
                    </Pill>
                  </td>
                  <td className={td}>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(x.id)}>
                      {o.invoice}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog open={!!inv} onClose={() => setOpen(null)} title={o.invoiceTitle} wide footer={<Button onClick={() => window.print()}><Printer className="size-4" aria-hidden /> {m.common.print}</Button>}>
        {inv && <Invoice order={inv} />}
      </Dialog>
    </div>
  );
}

function Invoice({ order }: { order: Order }) {
  const { m, f, l, locale } = useI18n();
  const { state } = useStore();
  const o = m.dash.orders;
  const program = state!.catalog.programs.find((p) => p.id === order.programId)!;
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Monogram className="size-10" />
          <div>
            <p className="font-display font-bold">ALPAS Trader Capital</p>
            <p className="text-xs text-muted">{o.issuer}</p>
          </div>
        </div>
        <dl className="num text-right text-xs">
          <dt className="text-muted">{o.invoice}</dt>
          <dd className="font-semibold">{order.invoiceNo}</dd>
          <dt className="mt-1 text-muted">{m.common.date}</dt>
          <dd>{f.date(order.createdAt)}</dd>
        </dl>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted">{o.billedTo}</p>
        <p>{order.billing.name}</p>
        <p className="text-muted">{[order.billing.city, COUNTRIES.find((c) => c.code === order.billing.country)?.[locale]].filter(Boolean).join(", ")}</p>
      </div>
      <table className="num w-full">
        <tbody>
          <tr className="border-b border-line-2">
            <td className="py-2">{o.line.replace("{program}", l(program.name)).replace("{size}", formatSize(order.size))}</td>
            <td className="py-2 text-right">{f.money(order.listPrice)}</td>
          </tr>
          {order.discount > 0 && (
            <tr className="border-b border-line-2 text-gain">
              <td className="py-2">
                {m.checkout.discount} ({order.promoCode})
              </td>
              <td className="py-2 text-right">−{f.money(order.discount)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-2">{m.checkout.total}</td>
            <td className="py-2 text-right">{f.money(order.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted">
        {o.ruleVersion}: {order.ruleSetId} · {o.payment}: {order.paymentMethod === "card_demo" ? m.checkout.payCard : m.checkout.payBank} · {order.id}
      </p>
      <Notice tone="warn">{o.invoiceNote}</Notice>
    </div>
  );
}

/* ───────────── Notifications + e-mail samples ───────────── */

export function NotificationsPage() {
  const { m, t, f } = useI18n();
  const { state, run, actor } = useStore();
  const user = useSessionUser();
  const [email, setEmail] = useState<Notification | null>(null);
  if (!state || !user || !actor) return null;
  const n = m.dash.notifications;
  const items = state.notifications.filter((x) => x.userId === user.id).sort((a, b) => b.ts - a.ts);
  const statusLabel = (s: string) => m.labels.payoutStatus[s as keyof typeof m.labels.payoutStatus] ?? s;
  const text = (x: Notification) => t(n.kinds[x.kind], { ...x.params, status: statusLabel(x.params.status ?? "") });
  const mail = email ? renderEmail(email, user.name.split(" ")[0], m, statusLabel) : null;
  return (
    <div>
      <PageTitle title={n.title} sub={n.sub} action={<Button variant="outline" size="sm" onClick={() => run((s) => markNotificationsRead(s, actor))}>{n.markAll}</Button>} />
      <Card>
        {items.length === 0 ? (
          <EmptyState title={n.empty} />
        ) : (
          <ul className="divide-y divide-line-2">
            {items.map((x) => (
              <li key={x.id} className={cx("flex flex-wrap items-center gap-3 px-5 py-3", !x.read && "bg-copper-100/30")}>
                {!x.read && (
                  <span className="size-2 rounded-full bg-copper" aria-label={n.unread} role="img" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{text(x)}</p>
                  <p className="num text-xs text-muted">{f.dateTime(x.ts)}</p>
                </div>
                {x.email && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEmail(x);
                      run((s) => markNotificationsRead(s, actor, [x.id]));
                    }}
                  >
                    <Mail className="size-4" aria-hidden /> {n.viewEmail}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog open={!!email} onClose={() => setEmail(null)} title={n.viewEmail}>
        {mail && (
          <div className="overflow-hidden rounded-[12px] border border-line-2 text-sm">
            <dl className="space-y-1 border-b border-line-2 bg-paper px-4 py-3 text-xs">
              <div className="flex gap-2">
                <dt className="w-14 text-muted">{m.emails.fromLabel}</dt>
                <dd>{m.emails.from}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 text-muted">{m.emails.to}</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 text-muted">{m.emails.subject}</dt>
                <dd className="font-semibold">{mail.subject}</dd>
              </div>
            </dl>
            <div className="space-y-3 bg-white px-5 py-5">
              <Monogram className="size-8" />
              <p>{mail.greeting}</p>
              <p className="leading-relaxed text-graphite">{mail.body}</p>
              <span className="inline-block rounded-[8px] bg-petrol-800 px-4 py-2 text-paper">{m.emails.cta}</span>
              <p className="text-graphite">{m.emails.signoff}</p>
            </div>
            <p className="border-t border-line-2 bg-paper px-4 py-2 text-xs text-muted">{m.emails.footer}</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ───────────── Profile & security ───────────── */

export function ProfilePage() {
  const { m, locale } = useI18n();
  const { state, run, actor } = useStore();
  const user = useSessionUser();
  const toast = useToast();
  const [form, setForm] = useState(() => (user ? { name: user.name, country: user.country, marketingOptIn: user.marketingOptIn, twoFactorEnabled: user.twoFactorEnabled, locale: user.locale } : null));
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [profErr, setProfErr] = useState<string | null>(null);
  if (!state || !user || !actor || !form) return null;
  const p = m.dash.profile;
  return (
    <div>
      <PageTitle title={p.title} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={p.profile} />
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              const r = run((s, n) => updateProfile(s, actor, form, n));
              if (r.ok) {
                setProfErr(null);
                toast("gain", p.saved);
              } else setProfErr(err(m, r.error));
            }}
          >
            <Field label={p.name} htmlFor="p-name" error={profErr}>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={p.email} htmlFor="p-email" hint={p.emailNote}>
              <Input id="p-email" value={user.email} readOnly disabled />
            </Field>
            <Field label={p.country} htmlFor="p-country">
              <Select id="p-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c[locale]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={p.language} htmlFor="p-lang">
              <Select id="p-lang" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as "en" | "tr" })}>
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </Select>
            </Field>
            <Checkbox id="p-mkt" checked={form.marketingOptIn} onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })} label={p.marketing} />
            <Button type="submit">{m.common.save}</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title={p.security} />
          <div className="space-y-5 p-5">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const r = run((s, n) => changePassword(s, actor, pw.current, pw.next, n));
                if (r.ok) {
                  setPw({ current: "", next: "" });
                  setPwErr(null);
                  toast("gain", p.passwordChanged);
                } else setPwErr(err(m, r.error));
              }}
            >
              <Field label={p.currentPassword} htmlFor="p-cur">
                <Input id="p-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label={p.newPassword} htmlFor="p-new" hint={m.auth.passwordHint} error={pwErr}>
                <Input id="p-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <Button type="submit" variant="outline">
                {p.changePassword}
              </Button>
            </form>
            <div className="border-t border-line-2 pt-4">
              <Checkbox
                id="p-2fa"
                checked={form.twoFactorEnabled}
                onChange={(e) => {
                  const next = { ...form, twoFactorEnabled: e.target.checked };
                  setForm(next);
                  run((s, n) => updateProfile(s, actor, next, n));
                }}
                label={p.twoFactor}
              />
              <p className="mt-1 pl-6 text-xs text-muted">{p.twoFactorNote}</p>
            </div>
            <p className="text-xs text-muted">{p.sessions}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Support ───────────── */

export function SupportPage() {
  const { m, t, f } = useI18n();
  const { state, run, actor } = useStore();
  const user = useSessionUser();
  const toast = useToast();
  const [form, setForm] = useState({ subject: "", category: "general" as SupportTicket["category"], body: "" });
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  if (!state || !user || !actor) return null;
  const s = m.dash.support;
  const tickets = state.tickets.filter((x) => x.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <PageTitle title={s.title} sub={s.sub} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title={s.new} />
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              const r = run((st, n) => createTicket(st, actor, { subject: form.subject, body: form.body, category: form.category, source: "dashboard" }, n));
              if (!r.ok) setError(err(m, r.error));
              else {
                setError(null);
                setForm({ subject: "", category: "general", body: "" });
                toast("gain", t(s.created, { id: r.value.ticketId }));
              }
            }}
          >
            <Field label={s.subject} htmlFor="s-sub">
              <Input id="s-sub" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label={s.category} htmlFor="s-cat">
              <Select id="s-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as SupportTicket["category"] })}>
                {Object.entries(m.site.contact.cats).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.message} htmlFor="s-body" error={error}>
              <Textarea id="s-body" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-invalid={!!error} />
            </Field>
            <Button type="submit">{s.create}</Button>
          </form>
        </Card>
        <div className="space-y-3">
          {tickets.length === 0 && (
            <Card>
              <EmptyState title={s.empty} />
            </Card>
          )}
          {tickets.map((tk) => (
            <Card key={tk.id} as="article">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-5 py-3">
                <div>
                  <p className="font-medium">{tk.subject}</p>
                  <p className="num text-xs text-muted">
                    {tk.id} · {f.dateTime(tk.createdAt)} · {m.site.contact.cats[tk.category]}
                  </p>
                </div>
                <Pill tone={tk.status === "answered" ? "gain" : tk.status === "closed" ? "neutral" : "warn"}>{m.labels.ticketStatus[tk.status]}</Pill>
              </div>
              {tk.source === "assistant" && <p className="border-b border-line-2 px-5 py-2 text-xs text-muted">{s.fromAssistant}</p>}
              <ul className="space-y-3 px-5 py-4">
                {tk.messages.map((msg, i) => (
                  <li key={i} className={cx("rounded-[10px] px-3 py-2 text-sm", msg.from === "ops" ? "bg-petrol-100/60" : "bg-paper")}>
                    <p className="text-xs font-semibold text-muted">
                      {msg.from === "ops" ? s.ops : s.you} · {f.dateTime(msg.at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{msg.body}</p>
                  </li>
                ))}
              </ul>
              {tk.status !== "closed" && (
                <div className="flex flex-wrap gap-2 border-t border-line-2 px-5 py-3">
                  <label htmlFor={`r-${tk.id}`} className="sr-only">
                    {s.reply}
                  </label>
                  <Input id={`r-${tk.id}`} className="min-w-0 flex-1" placeholder={s.reply} value={reply[tk.id] ?? ""} onChange={(e) => setReply({ ...reply, [tk.id]: e.target.value })} />
                  <Button
                    size="md"
                    variant="outline"
                    onClick={() => {
                      const r = run((st, n) => replyTicket(st, actor, tk.id, reply[tk.id] ?? "", n));
                      if (r.ok) setReply({ ...reply, [tk.id]: "" });
                    }}
                  >
                    {s.send}
                  </Button>
                  <Button size="md" variant="ghost" onClick={() => run((st, n) => closeTicket(st, actor, tk.id, n))}>
                    {s.close}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Assistant (full page) ───────────── */

export function AssistantPage() {
  const { m } = useI18n();
  return (
    <div>
      <PageTitle title={m.assistant.title} sub={m.assistant.limits} />
      <Card className="h-[calc(100dvh-14rem)] min-h-[520px] overflow-hidden">
        <AssistantChat />
      </Card>
    </div>
  );
}
