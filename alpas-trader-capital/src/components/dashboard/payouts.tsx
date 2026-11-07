"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, CircleDashed, Printer, XCircle } from "lucide-react";
import { PAYOUT_METHODS } from "@/domain/catalog";
import { quotePayout } from "@/domain/payout";
import type { Payout } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useSessionUser } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { cancelPayout, eligibilityFor, requestPayout } from "@/services/actions";
import { getChallenge } from "@/services/state";
import { Monogram } from "../brand";
import { Button, Card, CardHeader, Dialog, EmptyState, Field, Input, LinkButton, Notice, Pill, Select, Stat, cx, useToast, type Tone } from "../ui";
import { PageTitle } from "./common";
import { useAccountSelection } from "./selection";

export const payoutTone = (s: Payout["status"]): Tone => (s === "paid" ? "gain" : s === "rejected" ? "loss" : s === "cancelled" ? "neutral" : s === "approved" || s === "processing" ? "navy" : "warn");

export function PayoutsPage() {
  const { m, t, f, l } = useI18n();
  const { state, run, actor, now } = useStore();
  const user = useSessionUser();
  const { accounts, account: selected } = useAccountSelection();
  const toast = useToast();
  const funded = accounts.filter((a) => a.kind === "funded");
  const [accountId, setAccountId] = useState<string | null>(null);
  const account = funded.find((a) => a.id === accountId) ?? (selected?.kind === "funded" ? selected : funded[0]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payout["method"]>("bank_transfer_demo");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Payout | null>(null);
  if (!state || !user || !actor) return null;
  const p = m.dash.payouts;
  if (!account)
    return (
      <div>
        <PageTitle title={p.title} sub={p.sub} />
        <Card>
          <EmptyState title={p.noFunded} body={p.noFundedBody} action={<LinkButton href="/dashboard">{m.dash.nav.overview}</LinkButton>} />
        </Card>
      </div>
    );
  const ch = getChallenge(state, account.challengeId)!;
  const elig = eligibilityFor(state, account.id, now)!;
  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const validAmount = Number.isFinite(cents) && cents > 0;
  const quote = quotePayout(validAmount ? cents : 0, elig.splitBps, elig.feeRefundDue);
  const history = state.payouts.filter((x) => x.accountId === account.id).sort((a, b) => b.requestedAt - a.requestedAt);

  const submit = () => {
    setError(null);
    const r = run((s, n) => requestPayout(s, actor, { accountId: account.id, amount: cents, method }, n));
    if (!r.ok) {
      const tpl = m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic;
      setError(t(tpl, { min: f.money(Number(r.params?.min ?? 0)), max: f.money(Number(r.params?.max ?? 0)) }));
      return;
    }
    setAmount("");
    toast("gain", t(p.submitted, { id: r.value.payoutId }));
  };

  return (
    <div>
      <PageTitle
        title={p.title}
        sub={p.sub}
        action={
          funded.length > 1 ? (
            <Select aria-label={p.accountLabel} value={account.id} onChange={(e) => setAccountId(e.target.value)} className="w-auto">
              {funded.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line-2 bg-line-2 md:grid-cols-4">
        <div className="bg-card p-4">
          <Stat label={p.available} value={f.money(elig.profitAvailable)} sub={p.availableSub} />
        </div>
        <div className="bg-card p-4">
          <Stat label={p.split} value={f.bps(elig.splitBps)} sub={`${l(state.catalog.programs.find((x) => x.id === account.programId)!.name)} · v${ch.ruleSnapshot.version}`} />
        </div>
        <div className="bg-card p-4">
          <Stat label={p.minRequest} value={f.money(elig.minRequest, { decimals: 0 })} />
        </div>
        <div className="bg-card p-4">
          <Stat label={p.nextDate} value={elig.eligibleFrom && elig.eligibleFrom > now ? f.date(elig.eligibleFrom) : p.eligibleNow} sub={t(p.firstRule, { days: ch.ruleSnapshot.payout.firstPayoutAfterDays, cycle: ch.ruleSnapshot.payout.cycleDays })} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader title={p.checklist} sub={account.id} />
          <ul className="divide-y divide-line-2">
            {elig.checks.map((c) => {
              const Icon = c.status === "met" ? CheckCircle2 : c.status === "failed" ? XCircle : CircleDashed;
              const extra =
                c.id === "trading_days"
                  ? t(p.cycleDays, { current: c.params.current, required: c.params.required })
                  : c.id === "cycle_date" && c.params.date
                    ? f.dateTime(c.params.date)
                    : c.id === "min_amount"
                      ? `${f.money(c.params.requestable)} / ${f.money(c.params.min)}`
                      : c.id === "consistency" && c.params.current
                        ? `${f.bps(c.params.current)} / ${f.bps(c.params.max)}`
                        : "";
              return (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Icon className={cx("size-5 shrink-0", c.status === "met" ? "text-gain" : c.status === "failed" ? "text-loss" : "text-warn")} aria-hidden />
                  <span className="flex-1">{m.labels.checks[c.id]}</span>
                  <span className="num text-xs text-muted">{extra}</span>
                  <span className="sr-only">{m.labels.objectiveStatus[c.status === "failed" ? "breached" : c.status]}</span>
                </li>
              );
            })}
          </ul>
          {elig.newsExcluded > 0 && <p className="border-t border-line-2 px-5 py-2 text-xs text-warn">{t(p.newsExcluded, { value: f.money(elig.newsExcluded) })}</p>}
        </Card>

        <Card>
          <CardHeader title={p.request} sub={elig.eligible ? p.eligibleNow : p.notEligible} />
          <div className="space-y-4 p-5">
            {!elig.eligible && !elig.pending && <Notice tone="info">{m.errors.not_eligible}</Notice>}
            {elig.pending && <Notice tone="warn">{m.errors.pending_exists}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={p.amount} htmlFor="po-amount" hint={t(p.amountHint, { min: f.money(elig.minRequest), max: f.money(elig.requestable) })} error={error}>
                <Input id="po-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(elig.requestable / 100).toFixed(2)} disabled={!elig.eligible} aria-invalid={!!error} />
              </Field>
              <Field label={p.method} htmlFor="po-method" hint={p.methodNote}>
                <Select id="po-method" value={method} onChange={(e) => setMethod(e.target.value as Payout["method"])} disabled={!elig.eligible}>
                  {PAYOUT_METHODS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {l(x.label)} · {x.masked}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!elig.eligible} onClick={() => setAmount((elig.requestable / 100).toFixed(2))}>
                {p.fillMax}
              </Button>
              <Button size="sm" variant="outline" disabled={!elig.eligible} onClick={() => setAmount((elig.minRequest / 100).toFixed(2))}>
                {p.fillMin}
              </Button>
            </div>
            <dl className="num rounded-[12px] border border-line-2 bg-paper px-4 py-2 text-sm">
              <p className="py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{p.summary}</p>
              {[
                [p.gross, f.money(quote.gross)],
                [t(p.trader, { split: f.bps(quote.splitBps) }), f.money(quote.traderShare)],
                [p.company, f.money(quote.companyShare)],
                [p.refund, f.money(quote.feeRefund)],
                [p.fee, f.money(quote.processingFee)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line-2 py-1.5 font-semibold">
                <dt>{p.net}</dt>
                <dd>{f.money(quote.netToTrader)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">{p.reserveNote}</p>
            <Button variant="accent" disabled={!elig.eligible || !validAmount} onClick={submit}>
              {p.submit}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={p.history} />
        {history.length === 0 ? (
          <EmptyState title={p.emptyHistory} />
        ) : (
          <ul className="divide-y divide-line-2">
            {history.map((x) => (
              <li key={x.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-display font-bold">{x.id}</span>
                    <Pill tone={payoutTone(x.status)}>{m.labels.payoutStatus[x.status]}</Pill>
                  </div>
                  <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted">{p.gross}</dt>
                    <dd>{f.money(x.gross)}</dd>
                    <dt className="text-muted">{t(p.trader, { split: f.bps(x.splitBps) })}</dt>
                    <dd>{f.money(x.traderShare)}</dd>
                    {x.feeRefund > 0 && (
                      <>
                        <dt className="text-muted">{p.refund}</dt>
                        <dd>{f.money(x.feeRefund)}</dd>
                      </>
                    )}
                    <dt className="font-medium">{p.net}</dt>
                    <dd className="font-semibold">{f.money(x.netToTrader)}</dd>
                    <dt className="text-muted">{p.method}</dt>
                    <dd className="text-xs">{m.labels.method[x.method]}</dd>
                  </dl>
                  {x.rejectionReason && <p className="mt-2 text-sm text-loss">{t(p.reason, { reason: x.rejectionReason })}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {x.status === "requested" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const r = run((s, n) => cancelPayout(s, actor, x.id, n));
                          toast(r.ok ? "info" : "loss", r.ok ? p.cancelled : m.errors.invalid_transition);
                        }}
                      >
                        {p.cancel}
                      </Button>
                    )}
                    {x.status === "paid" && (
                      <Button size="sm" variant="outline" onClick={() => setReceipt(x)}>
                        <Printer className="size-4" aria-hidden /> {p.receipt}
                      </Button>
                    )}
                    {x.certificateId && (
                      <Link href="/dashboard/certificates" className="inline-flex h-8 items-center rounded-[10px] px-3 text-[0.82rem] text-navy-700 hover:bg-paper-2">
                        {p.certificate} →
                      </Link>
                    )}
                  </div>
                </div>
                <ol className="relative space-y-3 border-l border-line pl-5" aria-label={p.timeline}>
                  {x.timeline.map((e, i) => (
                    <li key={i} className="relative text-sm">
                      <span className={cx("absolute -left-[26px] top-1 size-3 rounded-full border-2 border-card", e.status === "paid" ? "bg-gain" : e.status === "rejected" ? "bg-loss" : e.status === "cancelled" ? "bg-subtle" : "bg-brass")} aria-hidden />
                      <p className="font-medium">{m.labels.payoutStatus[e.status]}</p>
                      <p className="num text-xs text-muted">
                        {f.dateTime(e.at)} · {p.actor[e.actor]}
                      </p>
                      {e.note && <p className="text-xs text-graphite-2">{e.note}</p>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        <Link href="/payouts" className="text-navy-700 hover:underline">
          {m.site.payoutsPage.title} →
        </Link>
      </p>

      <Dialog open={!!receipt} onClose={() => setReceipt(null)} title={p.receiptTitle} footer={<Button onClick={() => window.print()}>{m.common.print}</Button>}>
        {receipt && (
          <div className="space-y-3 text-sm" id="print-area">
            <div className="flex items-center gap-3">
              <Monogram className="size-9" />
              <div>
                <p className="font-display font-bold">ALPAS Trader Capital</p>
                <p className="text-xs text-muted">{m.dash.orders.issuer}</p>
              </div>
            </div>
            <dl className="num divide-y divide-line-2">
              {[
                ["No.", receipt.receiptNo ?? "—"],
                [m.labels.payoutStatus.paid, f.dateTime(receipt.timeline.find((e) => e.status === "paid")?.at ?? 0)],
                [p.accountLabel, receipt.accountId],
                [p.gross, f.money(receipt.gross)],
                [t(p.trader, { split: f.bps(receipt.splitBps) }), f.money(receipt.traderShare)],
                [p.refund, f.money(receipt.feeRefund)],
                [p.net, f.money(receipt.netToTrader)],
                [p.method, `${m.labels.method[receipt.method]} · ${receipt.methodLabel}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <Notice tone="warn">{p.receiptNote}</Notice>
          </div>
        )}
      </Dialog>
    </div>
  );
}
