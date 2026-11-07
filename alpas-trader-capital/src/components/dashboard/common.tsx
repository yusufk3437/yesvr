"use client";

import Link from "next/link";
import type { Account } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { getChallenge } from "@/services/state";
import { Pill, type Tone } from "../ui";

export const statusTone = (s: Account["status"]): Tone =>
  s === "active" ? "gain" : s === "breached" || s === "expired" || s === "review_rejected" ? "loss" : s === "under_review" ? "warn" : s === "passed" ? "petrol" : "neutral";

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[1.7rem] font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function AccountHeader({ account }: { account: Account }) {
  const { m, l, f } = useI18n();
  const { state } = useStore();
  const { programs } = useCatalog();
  const ch = getChallenge(state!, account.challengeId)!;
  const program = programs.find((p) => p.id === account.programId)!;
  const h = m.dash.header;
  const items: [string, React.ReactNode][] = [
    [h.model, l(program.model)],
    [h.platform, `${m.labels.platform[account.platform]} (${m.common.simulated.toLowerCase()})`],
    [h.currency, account.currency],
    [h.stage, l(ch.ruleSnapshot.phases[account.phaseIndex].label)],
    [
      h.rules,
      <Link key="r" href={`/rules?program=${account.programId}&stage=${account.kind}&version=${ch.ruleSnapshot.version}`} className="text-petrol-700 underline decoration-petrol-700/30 underline-offset-2">
        v{ch.ruleSnapshot.version}
      </Link>,
    ],
  ];
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[14px] border border-line-2 bg-card px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="num font-display text-xl font-extrabold tracking-tight">{account.id}</h1>
          <Pill tone={statusTone(account.status)}>{m.labels.accountStatus[account.status]}</Pill>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {l(program.name)} · {f.money(account.size, { decimals: 0 })} {m.common.simulated.toLowerCase()}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[0.7rem] uppercase tracking-[0.08em] text-muted">{k}</dt>
            <dd className="truncate font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function fmtDuration(ms: number, locale: "en" | "tr") {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return locale === "tr" ? `${mins} dk` : `${mins}m`;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  if (h < 48) return locale === "tr" ? `${h} sa ${mm} dk` : `${h}h ${mm}m`;
  return locale === "tr" ? `${Math.round(h / 24)} gün` : `${Math.round(h / 24)}d`;
}
