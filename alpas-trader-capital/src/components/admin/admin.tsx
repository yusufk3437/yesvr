"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatSize } from "@/domain/money";
import { PAYOUT_TRANSITIONS } from "@/domain/payout";
import type { Payout, ProgramId } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useKnowledge } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import {
  closeTicket,
  opsApproveReview,
  opsDecideKyc,
  opsPublishRuleVersion,
  opsRejectReview,
  opsRevokeCertificate,
  opsTransitionPayout,
  opsUpdatePrice,
  opsUpsertArticle,
  replyTicket,
  setDemoRole,
  type Result,
} from "@/services/actions";
import { evaluateAccount, getUser } from "@/services/state";
import { AssistantLauncher } from "../assistant/launcher";
import { Wordmark } from "../brand";
import { statusTone } from "../dashboard/common";
import { payoutTone } from "../dashboard/payouts";
import { LangSwitch } from "../lang-switch";
import { Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Notice, Pill, Select, Stat, Table, Tabs, Textarea, td, th, useToast } from "../ui";

type Tab = "overview" | "catalog" | "accounts" | "reviews" | "kyc" | "payouts" | "certificates" | "support" | "knowledge" | "audit";

export function AdminPanel() {
  const { m } = useI18n();
  const { state, ready, run, now } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const router = useRouter();
  const a = m.admin;
  if (!ready || !state) return <LoadingBlock label={m.common.loading} rows={8} />;
  const isOps = state.session.role === "ops";
  const openReviews = state.reviews.filter((r) => r.status === "open").length;
  const kycPending = state.users.filter((u) => u.kyc.status === "submitted").length;
  const payoutsActive = state.payouts.filter((p) => ["requested", "under_review", "approved", "processing"].includes(p.status)).length;
  const ticketsOpen = state.tickets.filter((t) => t.status === "open").length;
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line-2 bg-ink text-paper">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/">
            <Wordmark tone="light" />
          </Link>
          <span className="font-display text-sm font-bold uppercase tracking-[0.14em] text-brass-300">{a.title}</span>
          <div className="ml-auto flex items-center gap-2">
            <LangSwitch tone="light" />
            {isOps && (
              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  run((s, n) => setDemoRole(s, "trader", n));
                  router.push("/dashboard");
                }}
              >
                <ArrowLeft className="size-4" aria-hidden /> {a.leave}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
        <Notice tone="warn" className="mb-5">
          {a.demoWarning}
        </Notice>
        {!isOps ? (
          <Card className="mx-auto max-w-md p-8 text-center">
            <p className="text-sm text-muted">{m.demo.roleNote}</p>
            <Button className="mt-4" onClick={() => run((s, n) => setDemoRole(s, "ops", n))}>
              {a.enter}
            </Button>
          </Card>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={setTab}
              label={a.title}
              tabs={[
                { value: "overview", label: a.tabs.overview },
                { value: "catalog", label: a.tabs.catalog },
                { value: "accounts", label: a.tabs.accounts },
                { value: "reviews", label: a.tabs.reviews, count: openReviews },
                { value: "kyc", label: a.tabs.kyc, count: kycPending },
                { value: "payouts", label: a.tabs.payouts, count: payoutsActive },
                { value: "certificates", label: a.tabs.certificates },
                { value: "support", label: a.tabs.support, count: ticketsOpen },
                { value: "knowledge", label: a.tabs.knowledge },
                { value: "audit", label: a.tabs.audit },
              ]}
            />
            <div className="mt-5" role="tabpanel" aria-label={a.tabs[tab]}>
              {tab === "overview" && (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    [a.kpis.reviews, openReviews, "reviews"],
                    [a.kpis.kyc, kycPending, "kyc"],
                    [a.kpis.payouts, payoutsActive, "payouts"],
                    [a.kpis.tickets, ticketsOpen, "support"],
                  ].map(([label, value, target]) => (
                    <button key={label as string} type="button" className="text-left" onClick={() => setTab(target as Tab)}>
                      <Card className="p-5 transition-shadow hover:shadow-lg">
                        <Stat label={label as string} value={String(value)} />
                      </Card>
                    </button>
                  ))}
                  <Card className="col-span-2 md:col-span-4">
                    <CardHeader title={a.tabs.audit} />
                    <AuditTable limit={8} />
                  </Card>
                </div>
              )}
              {tab === "catalog" && <CatalogAdmin />}
              {tab === "accounts" && <AccountsAdmin now={now} />}
              {tab === "reviews" && <ReviewsAdmin />}
              {tab === "kyc" && <KycAdmin />}
              {tab === "payouts" && <PayoutsAdmin />}
              {tab === "certificates" && <CertificatesAdmin />}
              {tab === "support" && <SupportAdmin />}
              {tab === "knowledge" && <KnowledgeAdmin />}
              {tab === "audit" && (
                <Card>
                  <AuditTable />
                </Card>
              )}
            </div>
          </>
        )}
      </main>
      <AssistantLauncher />
    </div>
  );
}

function useReport() {
  const { m } = useI18n();
  const toast = useToast();
  return (r: Result<unknown>, success: string) => {
    if (r.ok) toast("gain", success);
    else toast("loss", m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic);
    return r.ok;
  };
}

function CatalogAdmin() {
  const { m, f, l, t } = useI18n();
  const { state, run, opsActor } = useStore();
  const report = useReport();
  const c = m.admin.catalog;
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ program: "ascent" as ProgramId, phase: 0, target: "", daily: "", max: "", minDays: "", split: "", first: "", en: "", tr: "" });
  if (!state) return null;
  const rsProgram = state.catalog.ruleSets.filter((r) => r.programId === form.program);
  const current = state.catalog.ruleSets.find((r) => r.id === state.catalog.programs.find((p) => p.id === form.program)!.currentRuleSetId)!;
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title={c.prices} sub={c.pricesNote} />
        <div className="space-y-4 p-5">
          {state.catalog.programs.map((p) => (
            <div key={p.id}>
              <p className="mb-2 font-medium">{l(p.name)}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {p.sizes.map((s) => {
                  const key = `${p.id}-${s.size}`;
                  return (
                    <div key={key} className="space-y-1">
                      <label htmlFor={key} className="num text-xs text-muted">
                        {formatSize(s.size)} · {f.money(s.price, { decimals: 0 })}
                      </label>
                      <div className="flex gap-1">
                        <Input id={key} inputMode="numeric" value={prices[key] ?? String(s.price / 100)} onChange={(e) => setPrices({ ...prices, [key]: e.target.value })} className="h-8 px-2 text-sm" />
                        <Button size="sm" variant="outline" className="px-2" onClick={() => report(run((st, n) => opsUpdatePrice(st, opsActor, p.id, s.size, Math.round(Number(prices[key] ?? s.price / 100) * 100), n)), c.priceSaved)}>
                          ✓
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title={c.rules} sub={c.publishNote} />
        <div className="space-y-4 p-5">
          <Select aria-label={m.site.rules.program} value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value as ProgramId, phase: 0 })}>
            {state.catalog.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {l(p.name)}
              </option>
            ))}
          </Select>
          <ul className="divide-y divide-line-2 rounded-[10px] border border-line-2 text-sm">
            {rsProgram.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="num font-medium">
                  v{r.version} · {r.publishedAt}
                </span>
                <span className="text-xs text-muted">{t(c.inUse, { n: state.challenges.filter((ch) => ch.ruleSetId === r.id).length })}</span>
                {r.id === current.id && <Pill tone="navy">{c.current}</Pill>}
              </li>
            ))}
          </ul>
          <p className="font-medium">{c.publish}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={c.phase} htmlFor="pv-phase">
              <Select id="pv-phase" value={form.phase} onChange={(e) => setForm({ ...form, phase: Number(e.target.value) })}>
                {current.phases.map((p, i) => (
                  <option key={p.kind} value={i}>
                    {l(p.label)}
                  </option>
                ))}
              </Select>
            </Field>
            {(
              [
                ["target", c.target, current.phases[form.phase].profitTargetBps ?? "—"],
                ["daily", c.daily, current.phases[form.phase].dailyLossBps],
                ["max", c.max, current.phases[form.phase].maxLoss.bps],
                ["minDays", c.minDays, current.phases[form.phase].minTradingDays],
                ["split", c.split, current.payout.profitSplitBps],
                ["first", c.firstPayout, current.payout.firstPayoutAfterDays],
              ] as const
            ).map(([k, label, ph]) => (
              <Field key={k} label={label} htmlFor={`pv-${k}`}>
                <Input id={`pv-${k}`} inputMode="numeric" placeholder={String(ph)} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <Field label={c.changelogEn} htmlFor="pv-en">
            <Input id="pv-en" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} />
          </Field>
          <Field label={c.changelogTr} htmlFor="pv-tr">
            <Input id="pv-tr" value={form.tr} onChange={(e) => setForm({ ...form, tr: e.target.value })} />
          </Field>
          <Button
            onClick={() => {
              const r = run((st, n) =>
                opsPublishRuleVersion(
                  st,
                  opsActor,
                  form.program,
                  [{ phaseIndex: form.phase, profitTargetBps: num(form.target), dailyLossBps: num(form.daily), maxLossBps: num(form.max), minTradingDays: num(form.minDays) }],
                  { profitSplitBps: num(form.split), firstPayoutAfterDays: num(form.first) },
                  { en: form.en, tr: form.tr },
                  n,
                ),
              );
              if (report(r, r.ok ? t(c.published, { id: r.value.ruleSetId }) : "")) setForm({ ...form, target: "", daily: "", max: "", minDays: "", split: "", first: "", en: "", tr: "" });
            }}
          >
            {c.publish}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AccountsAdmin({ now }: { now: number }) {
  const { m, f, l } = useI18n();
  const { state } = useStore();
  const [q, setQ] = useState("");
  if (!state) return null;
  const rows = state.accounts.filter((a) => {
    const u = getUser(state, a.userId)!;
    return !q || `${a.id} ${u.name}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <Card>
      <div className="border-b border-line-2 p-4">
        <Input aria-label={m.admin.accounts.search} placeholder={m.admin.accounts.search} value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </div>
      <Table caption={m.admin.tabs.accounts}>
        <thead>
          <tr>
            <th className={th}>ID</th>
            <th className={th}>{m.admin.accounts.owner}</th>
            <th className={th}>{m.site.rules.program}</th>
            <th className={th}>{m.dash.header.stage}</th>
            <th className={th}>{m.common.status}</th>
            <th className={`${th} text-right`}>{m.admin.accounts.equity}</th>
            <th className={`${th} text-right`}>{m.admin.accounts.headroom}</th>
            <th className={th}>{m.common.version}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const ev = evaluateAccount(state, a.id, now);
            const ch = state.challenges.find((c) => c.id === a.challengeId)!;
            return (
              <tr key={a.id}>
                <td className={`${td} num`}>{a.id}</td>
                <td className={td}>{getUser(state, a.userId)?.name}</td>
                <td className={td}>
                  {l(state.catalog.programs.find((p) => p.id === a.programId)!.name)} {formatSize(a.size)}
                </td>
                <td className={td}>{m.labels.phase[a.kind]}</td>
                <td className={td}>
                  <Pill tone={statusTone(a.status)}>{m.labels.accountStatus[a.status]}</Pill>
                </td>
                <td className={`${td} num text-right`}>{f.money(ev.equity)}</td>
                <td className={`${td} num text-right`}>{f.money(ev.headroom)}</td>
                <td className={`${td} num`}>v{ch.ruleSnapshot.version}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

function ReviewsAdmin() {
  const { m, t, f } = useI18n();
  const { state, run, opsActor, now } = useStore();
  const report = useReport();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!state) return null;
  const r = m.admin.reviews;
  const list = [...state.reviews].sort((a, b) => (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) || b.openedAt - a.openedAt);
  if (!list.length)
    return (
      <Card>
        <EmptyState title={r.empty} />
      </Card>
    );
  return (
    <div className="space-y-4">
      {list.map((rv) => {
        const acc = state.accounts.find((a) => a.id === rv.accountId)!;
        const ev = evaluateAccount(state, acc.id, now);
        const user = getUser(state, acc.userId)!;
        const verified = ev.completion.ready && !ev.breach;
        return (
          <Card key={rv.id}>
            <CardHeader
              title={`${rv.id} · ${acc.id}`}
              sub={`${user.name} · ${t(r.opened, { date: f.dateTime(rv.openedAt) })}`}
              action={<Pill tone={rv.status === "approved" ? "gain" : rv.status === "rejected" ? "loss" : "warn"}>{rv.status === "open" ? m.labels.accountStatus.under_review : m.labels.challengeStatus[rv.status === "approved" ? "passed" : "rejected"]}</Pill>}
            />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold">{r.checks}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {ev.objectives.map((o) => (
                    <li key={o.id} className="flex justify-between gap-3">
                      <span>{m.labels.objective[o.id]}</span>
                      <Pill tone={o.status === "met" ? "gain" : o.status === "breached" ? "loss" : "warn"}>{m.labels.objectiveStatus[o.status]}</Pill>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3">
                    <span>{m.labels.checks.flat}</span>
                    <Pill tone={ev.completion.flat ? "gain" : "warn"}>{ev.completion.flat ? m.common.yes : m.common.no}</Pill>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-muted">{ev.violations.length ? ev.violations.map((v) => m.labels.violation[v.type]).join(", ") : r.noFlags}</p>
              </div>
              {rv.status === "open" ? (
                <div className="space-y-3">
                  {!verified && <Notice tone="loss">{r.blocked}</Notice>}
                  <Field label={`${r.note} / ${r.reason}`} htmlFor={`rv-${rv.id}`}>
                    <Textarea id={`rv-${rv.id}`} rows={3} value={notes[rv.id] ?? ""} onChange={(e) => setNotes({ ...notes, [rv.id]: e.target.value })} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" disabled={!verified} onClick={() => report(run((s, n) => opsApproveReview(s, opsActor, rv.id, notes[rv.id] ?? "", n)), r.approved)}>
                      {r.approve}
                    </Button>
                    <Button variant="danger" onClick={() => report(run((s, n) => opsRejectReview(s, opsActor, rv.id, notes[rv.id] ?? "", n)), r.rejected)}>
                      {r.reject}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {t(r.decided, { status: m.labels.challengeStatus[rv.status === "approved" ? "passed" : "rejected"], by: rv.decidedBy ?? "", date: f.dateTime(rv.decidedAt ?? 0) })}
                  {rv.reason && <span className="mt-1 block text-ink">{rv.reason}</span>}
                </p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function KycAdmin() {
  const { m, t, f } = useI18n();
  const { state, run, opsActor } = useStore();
  const report = useReport();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  if (!state) return null;
  const k = m.admin.kyc;
  const pending = state.users.filter((u) => u.kyc.status === "submitted");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={m.admin.tabs.kyc} />
        {pending.length === 0 ? (
          <EmptyState title={k.empty} />
        ) : (
          <ul className="divide-y divide-line-2">
            {pending.map((u) => (
              <li key={u.id} className="space-y-3 px-5 py-4">
                <div>
                  <p className="font-medium">
                    {u.kyc.legalName} <span className="text-xs text-muted">({u.email})</span>
                  </p>
                  <p className="text-xs text-muted">
                    {t(k.submitted, { date: f.dateTime(u.kyc.submittedAt ?? 0) })} · {u.kyc.documentType ? m.dash.verification.docs[u.kyc.documentType] : ""} · {u.kyc.dateOfBirth}
                  </p>
                </div>
                <Input aria-label={k.reason} placeholder={k.reason} value={reasons[u.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [u.id]: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => report(run((s, n) => opsDecideKyc(s, opsActor, u.id, "verified", reasons[u.id] ?? "", n)), k.done)}>
                    {k.approve}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => report(run((s, n) => opsDecideKyc(s, opsActor, u.id, "rejected", reasons[u.id] ?? "", n)), k.done)}>
                    {k.reject}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title={k.all} />
        <ul className="divide-y divide-line-2 text-sm">
          {state.users.map((u) => (
            <li key={u.id} className="flex justify-between gap-3 px-5 py-2.5">
              <span>{u.name}</span>
              <Pill tone={u.kyc.status === "verified" ? "gain" : u.kyc.status === "rejected" ? "loss" : u.kyc.status === "submitted" ? "warn" : "neutral"}>{m.labels.kyc[u.kyc.status]}</Pill>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PayoutsAdmin() {
  const { m, f } = useI18n();
  const { state, run, opsActor } = useStore();
  const report = useReport();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!state) return null;
  const p = m.admin.payouts;
  const list = [...state.payouts].sort((a, b) => b.requestedAt - a.requestedAt);
  return (
    <div className="space-y-3">
      <Notice tone="info">{p.noAutoPaid}</Notice>
      {list.length === 0 && (
        <Card>
          <EmptyState title={p.empty} />
        </Card>
      )}
      {list.map((x) => {
        const nexts = PAYOUT_TRANSITIONS[x.status].filter((s) => s !== "cancelled");
        return (
          <Card key={x.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="num font-display font-bold">
                  {x.id} · {x.accountId}
                </p>
                <p className="text-xs text-muted">
                  {p.trader}: {getUser(state, x.userId)?.name} · {f.dateTime(x.requestedAt)}
                </p>
              </div>
              <Pill tone={payoutTone(x.status)}>{m.labels.payoutStatus[x.status]}</Pill>
            </div>
            <p className="num mt-2 text-sm">
              {m.dash.payouts.gross} {f.money(x.gross)} · {m.dash.payouts.net} {f.money(x.netToTrader)}
              {x.feeRefund > 0 && ` · ${m.dash.payouts.refund} ${f.money(x.feeRefund)}`}
            </p>
            {nexts.length > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Field label={p.note} htmlFor={`pn-${x.id}`} hint={p.noteHint}>
                    <Input id={`pn-${x.id}`} value={notes[x.id] ?? ""} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} />
                  </Field>
                </div>
                {nexts.map((s) => (
                  <Button key={s} size="md" variant={s === "rejected" ? "danger" : s === "paid" ? "accent" : "outline"} onClick={() => report(run((st, n) => opsTransitionPayout(st, opsActor, x.id, s as Payout["status"], notes[x.id] ?? "", n)), p.done)}>
                    {p.move}: {m.labels.payoutStatus[s]}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function CertificatesAdmin() {
  const { m, f } = useI18n();
  const { state, run, opsActor } = useStore();
  const report = useReport();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  if (!state) return null;
  const c = m.admin.certificates;
  return (
    <Card>
      <Table caption={m.admin.tabs.certificates}>
        <thead>
          <tr>
            <th className={th}>No.</th>
            <th className={th}>{m.site.verify.type}</th>
            <th className={th}>{m.site.verify.holder}</th>
            <th className={th}>{m.site.verify.issued}</th>
            <th className={th}>{m.common.status}</th>
            <th className={th}>{m.common.actions}</th>
          </tr>
        </thead>
        <tbody>
          {state.certificates.map((x) => (
            <tr key={x.id}>
              <td className={`${td} num`}>
                <Link href={`/verify/${x.id}`} className="text-navy-700 hover:underline">
                  {x.id}
                </Link>
              </td>
              <td className={td}>{m.labels.certType[x.type]}</td>
              <td className={td}>{x.traderName}</td>
              <td className={`${td} num`}>{f.date(x.issuedAt)}</td>
              <td className={td}>
                <Pill tone={x.status === "valid" ? "gain" : "loss"}>{x.status === "valid" ? m.site.verify.valid : m.site.verify.revoked}</Pill>
              </td>
              <td className={td}>
                {x.status === "valid" ? (
                  <div className="flex gap-2">
                    <Input aria-label={c.reason} placeholder={c.reason} className="h-8 min-w-48 text-sm" value={reasons[x.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [x.id]: e.target.value })} />
                    <Button size="sm" variant="danger" onClick={() => report(run((s, n) => opsRevokeCertificate(s, opsActor, x.id, reasons[x.id] ?? "", n)), c.revoked)}>
                      {c.revoke}
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted">{x.revokedReason}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function SupportAdmin() {
  const { m, f } = useI18n();
  const { state, run, opsActor } = useStore();
  const report = useReport();
  const [reply, setReply] = useState<Record<string, string>>({});
  if (!state) return null;
  const s = m.admin.support;
  if (!state.tickets.length)
    return (
      <Card>
        <EmptyState title={s.empty} />
      </Card>
    );
  return (
    <div className="space-y-3">
      {state.tickets.map((tk) => (
        <Card key={tk.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">
                {tk.id} · {tk.subject}
              </p>
              <p className="text-xs text-muted">
                {s.from}: {tk.userId ? getUser(state, tk.userId)?.name : tk.email} · {m.site.contact.cats[tk.category]} · {tk.source} · {f.dateTime(tk.createdAt)}
              </p>
            </div>
            <Pill tone={tk.status === "answered" ? "gain" : tk.status === "closed" ? "neutral" : "warn"}>{m.labels.ticketStatus[tk.status]}</Pill>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {tk.messages.map((msg, i) => (
              <li key={i} className={msg.from === "ops" ? "rounded-md bg-navy-100/60 px-3 py-2" : "rounded-md bg-paper px-3 py-2"}>
                <p className="whitespace-pre-wrap">{msg.body}</p>
              </li>
            ))}
          </ul>
          {tk.assistantTranscript && <p className="mt-2 text-xs text-muted">{m.dash.support.fromAssistant}: {tk.assistantTranscript.sources.join(", ")}</p>}
          {tk.status !== "closed" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Input aria-label={s.reply} placeholder={s.reply} className="min-w-0 flex-1" value={reply[tk.id] ?? ""} onChange={(e) => setReply({ ...reply, [tk.id]: e.target.value })} />
              <Button
                variant="outline"
                onClick={() => {
                  if (report(run((st, n) => replyTicket(st, opsActor, tk.id, reply[tk.id] ?? "", n)), s.replied)) setReply({ ...reply, [tk.id]: "" });
                }}
              >
                {s.reply}
              </Button>
              <Button variant="ghost" onClick={() => report(run((st, n) => closeTicket(st, opsActor, tk.id, n)), s.closed)}>
                {m.dash.support.close}
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function KnowledgeAdmin() {
  const { m, t, f, locale } = useI18n();
  const { state, run, opsActor } = useStore();
  const kb = useKnowledge();
  const report = useReport();
  const k = m.admin.knowledge;
  const [form, setForm] = useState({ titleEn: "", titleTr: "", bodyEn: "", bodyTr: "", keywords: "" });
  if (!state) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={k.add} sub={k.intro} />
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted">{t(k.generated, { n: kb.filter((a) => a.category !== "faq").length })}</p>
          <Field label={k.titleEn} htmlFor="kb-te">
            <Input id="kb-te" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
          </Field>
          <Field label={k.titleTr} htmlFor="kb-tt">
            <Input id="kb-tt" value={form.titleTr} onChange={(e) => setForm({ ...form, titleTr: e.target.value })} />
          </Field>
          <Field label={k.bodyEn} htmlFor="kb-be">
            <Textarea id="kb-be" rows={3} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
          </Field>
          <Field label={k.bodyTr} htmlFor="kb-bt">
            <Textarea id="kb-bt" rows={3} value={form.bodyTr} onChange={(e) => setForm({ ...form, bodyTr: e.target.value })} />
          </Field>
          <Field label={k.keywords} htmlFor="kb-kw">
            <Input id="kb-kw" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
          </Field>
          <Button
            onClick={() => {
              const r = run((s, n) => opsUpsertArticle(s, opsActor, { title: { en: form.titleEn, tr: form.titleTr }, body: { en: form.bodyEn, tr: form.bodyTr }, keywords: form.keywords.split(",") }, n));
              if (report(r, r.ok && r.value.flagged ? k.flagged : k.saved)) setForm({ titleEn: "", titleTr: "", bodyEn: "", bodyTr: "", keywords: "" });
            }}
          >
            {m.common.save}
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title={k.custom} />
          {state.articles.length === 0 ? (
            <EmptyState title={m.common.none} />
          ) : (
            <ul className="divide-y divide-line-2 text-sm">
              {state.articles.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <p className="font-medium">{a.title[locale]}</p>
                  <p className="mt-1 text-muted">{a.body[locale]}</p>
                  {a.flagged && <p className="mt-1 text-xs text-loss">{k.flagged}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={k.feedback} />
          {state.feedback.length === 0 ? (
            <EmptyState title={k.noFeedback} />
          ) : (
            <ul className="divide-y divide-line-2 text-sm">
              {state.feedback.slice(0, 20).map((fb) => (
                <li key={fb.id} className="flex justify-between gap-3 px-5 py-2">
                  <span className="min-w-0 truncate">{fb.question}</span>
                  <span className="text-xs text-muted">
                    {fb.intent} · {fb.rating === "up" ? "👍" : "👎"} · {f.date(fb.ts)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function AuditTable({ limit }: { limit?: number }) {
  const { m, f } = useI18n();
  const { state } = useStore();
  if (!state) return null;
  const rows = limit ? state.audit.slice(0, limit) : state.audit;
  if (!rows.length) return <EmptyState title={m.admin.audit.empty} />;
  return (
    <Table caption={m.admin.tabs.audit}>
      <thead>
        <tr>
          <th className={th}>{m.common.date}</th>
          <th className={th}>{m.admin.audit.actor}</th>
          <th className={th}>{m.admin.audit.action}</th>
          <th className={th}>{m.admin.audit.entity}</th>
          <th className={th}>{m.common.reason}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td className={`${td} num whitespace-nowrap`}>{f.dateTime(a.ts)}</td>
            <td className={td}>
              {a.actor.role}:{a.actor.id}
            </td>
            <td className={`${td} num`}>{a.action}</td>
            <td className={`${td} num`}>
              {a.entity} {a.entityId}
            </td>
            <td className={`${td} max-w-xs truncate text-muted`}>{a.reason ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
