"use client";

import Link from "next/link";
import { PLATFORMS } from "@/domain/catalog";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { getAccount, getChallenge } from "@/services/state";
import { evaluationRows, fundedRows } from "../site/rule-rows";
import { Card, CardHeader, EmptyState, Notice, Pill } from "../ui";
import { AccountHeader, PageTitle, statusTone } from "./common";
import { useAccountSelection } from "./selection";

export function AccountPage() {
  const { m, f, l, t, locale } = useI18n();
  const { state } = useStore();
  const { account } = useAccountSelection();
  if (!state || !account) return <EmptyState title={m.dash.noAccounts} />;
  const a = m.dash.account;
  const ch = getChallenge(state, account.challengeId)!;
  const rs = ch.ruleSnapshot;
  const order = state.orders.find((o) => o.id === ch.orderId);
  const ev = evaluationRows(rs, account.size, m, locale);
  const fu = fundedRows(rs, account.size, m, locale);
  const evals = rs.phases.filter((p) => p.kind !== "funded");
  return (
    <div>
      <AccountHeader account={account} />
      <PageTitle title={a.title} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={a.details} />
          <dl className="num divide-y divide-line-2 px-5 text-sm">
            {[
              [a.id, account.id],
              [a.program, `${l(state.catalog.programs.find((p) => p.id === account.programId)!.name)} · ${m.labels.phase[account.kind]}`],
              [a.size, f.money(account.size, { decimals: 0 })],
              [a.created, f.dateTime(account.createdAt)],
              [a.started, f.dateTime(account.startedAt)],
              [a.reset, t(a.resetValue, { hour: rs.dailyResetHour, tz: rs.timezone })],
              [a.challenge, `${ch.id} · ${order?.id ?? ""}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title={a.platformTitle} />
          <div className="space-y-4 p-5">
            <Notice tone="warn">{a.platformNote}</Notice>
            <dl className="num divide-y divide-line-2 text-sm">
              {[
                [m.dash.header.platform, `${PLATFORMS[account.platform].name}`],
                [a.login, account.login],
                [a.server, account.server],
                [a.passwordLabel, a.passwordValue],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-sm font-semibold">{a.downloads}</p>
              <p className="mt-1 text-sm text-muted">{a.downloadsNote}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link href="/help#help-platform" className="text-petrol-700 hover:underline">
                  {m.nav.help} →
                </Link>
                <Link href={`/rules?program=${account.programId}&version=${rs.version}`} className="text-petrol-700 hover:underline">
                  {m.nav.rules} →
                </Link>
              </div>
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={a.rulesTitle} sub={t(a.rulesNote, { v: rs.version, date: rs.publishedAt })} />
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <dl className="space-y-1.5 text-sm">
              <p className="eyebrow text-petrol-700">{m.site.selector.evalStage}</p>
              {ev.map((r) => (
                <div key={r.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="num text-right">{evals.length > 1 ? r.values.join(" / ") : r.values[0]}</dd>
                </div>
              ))}
            </dl>
            <dl className="space-y-1.5 text-sm">
              <p className="eyebrow text-petrol-700">{m.site.selector.fundedStage}</p>
              {fu.map((r) => (
                <div key={r.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="num text-right">{r.values[0]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={a.phases} />
          <ul className="divide-y divide-line-2">
            {ch.accountIds.map((id) => {
              const acc = getAccount(state, id)!;
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <Link href={`/dashboard?account=${id}`} className="num font-medium text-petrol-700 hover:underline">
                    {id}
                  </Link>
                  <span className="text-muted">{l(rs.phases[acc.phaseIndex].label)}</span>
                  <span className="num text-muted">{f.date(acc.startedAt)}</span>
                  <Pill tone={statusTone(acc.status)}>{m.labels.accountStatus[acc.status]}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
