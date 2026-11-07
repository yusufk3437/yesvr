"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, FastForward, Flame, MoveDown, MoveUp, Plus, RotateCcw, Shield, SquareX, TrendingDown, TrendingUp, Shuffle } from "lucide-react";
import { HOUR_MS, DAY_MS } from "@/domain/time";
import { formatSize } from "@/domain/money";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { demoAdvanceClock, demoCloseAll, demoCompleteObjectives, demoMoveMarket, demoOpenPosition, demoSimulateSession, setDemoRole, type Result } from "@/services/actions";
import { SCENARIO_ACCOUNTS } from "@/services/seed";
import { Button, Card, CardHeader, Notice, Pill, Select, useToast } from "../ui";
import { PageTitle, statusTone } from "./common";
import { useAccountSelection } from "./selection";

export function DemoToolsPage() {
  const { m, t, f, l } = useI18n();
  const { state, run, actor, now, reset } = useStore();
  const { accounts, account, select } = useAccountSelection();
  const router = useRouter();
  const toast = useToast();
  if (!state || !actor) return null;
  const d = m.dash.demoTools;
  const live = account && ["ready", "active"].includes(account.status);
  const open = account ? state.trades.filter((x) => x.accountId === account.id && x.status === "open").length : 0;
  const report = (r: Result<unknown>) => {
    if (r.ok) toast("gain", d.done);
    else toast("loss", m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic);
  };
  const scenarioIds = Object.entries(SCENARIO_ACCOUNTS).filter(([k]) => k !== "otherUserFunded") as [keyof typeof d.list, string][];
  return (
    <div>
      <PageTitle title={d.title} sub={d.sub} />
      <Notice tone="warn" className="mb-4">
        {m.demo.banner} {m.demo.storageNote}
      </Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.scenarios} sub={d.scenariosSub} />
          <ul className="divide-y divide-line-2">
            {scenarioIds.map(([key, id]) => {
              const acc = state.accounts.find((a) => a.id === id);
              const mine = acc && acc.userId === actor.id;
              return (
                <li key={key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{d.list[key]}</p>
                    <p className="num text-xs text-muted">
                      {id}
                      {acc ? ` · ${l(state.catalog.programs.find((p) => p.id === acc.programId)!.name)} ${formatSize(acc.size)}` : ""}
                    </p>
                  </div>
                  {acc && <Pill tone={statusTone(acc.status)}>{m.labels.accountStatus[acc.status]}</Pill>}
                  <Button size="sm" variant="outline" disabled={!mine} onClick={() => router.push(`/dashboard?account=${id}`)}>
                    {d.open}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title={d.account} sub={t(d.clockNow, { time: f.ny(now) })} />
          <div className="space-y-5 p-5">
            <Select aria-label={d.account} value={account?.id} onChange={(e) => select(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} · {m.labels.phase[a.kind]} · {m.labels.accountStatus[a.status]}
                </option>
              ))}
            </Select>
            <div>
              <p className="mb-2 text-sm font-medium">{d.session}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!live || open > 0} onClick={() => report(run((s, n) => demoSimulateSession(s, actor, account!.id, "profit", n)))}>
                  <TrendingUp className="size-4 text-gain" aria-hidden /> {d.profit}
                </Button>
                <Button size="sm" variant="outline" disabled={!live || open > 0} onClick={() => report(run((s, n) => demoSimulateSession(s, actor, account!.id, "loss", n)))}>
                  <TrendingDown className="size-4 text-loss" aria-hidden /> {d.loss}
                </Button>
                <Button size="sm" variant="outline" disabled={!live || open > 0} onClick={() => report(run((s, n) => demoSimulateSession(s, actor, account!.id, "mixed", n)))}>
                  <Shuffle className="size-4" aria-hidden /> {d.mixed}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!live || open > 0}
                  onClick={() => {
                    if (window.confirm(d.breachConfirm)) report(run((s, n) => demoSimulateSession(s, actor, account!.id, "breach", n)));
                  }}
                >
                  <Flame className="size-4" aria-hidden /> {d.breach}
                </Button>
              </div>
              {open > 0 && <p className="mt-2 text-xs text-muted">{m.errors.close_positions_first}</p>}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{d.positions}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!live} onClick={() => report(run((s, n) => demoOpenPosition(s, actor, account!.id, n)))}>
                  <Plus className="size-4" aria-hidden /> {d.openPos}
                </Button>
                <Button size="sm" variant="outline" disabled={!live || !open} onClick={() => report(run((s, n) => demoMoveMarket(s, actor, account!.id, "against", n)))}>
                  <MoveDown className="size-4 text-loss" aria-hidden /> {d.against}
                </Button>
                <Button size="sm" variant="outline" disabled={!live || !open} onClick={() => report(run((s, n) => demoMoveMarket(s, actor, account!.id, "favor", n)))}>
                  <MoveUp className="size-4 text-gain" aria-hidden /> {d.favor}
                </Button>
                <Button size="sm" variant="outline" disabled={!live || !open} onClick={() => report(run((s, n) => demoCloseAll(s, actor, account!.id, n)))}>
                  <SquareX className="size-4" aria-hidden /> {d.closeAll}
                </Button>
              </div>
            </div>
            <div>
              <Button size="sm" disabled={!live || account?.kind === "funded"} onClick={() => report(run((s, n) => demoCompleteObjectives(s, actor, account!.id, n)))}>
                <FastForward className="size-4" aria-hidden /> {d.fastForward}
              </Button>
              <p className="mt-1 text-xs text-muted">{d.fastForwardNote}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{d.clock}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  [d.plus1h, HOUR_MS],
                  [d.plus1d, DAY_MS],
                  [d.plus7d, 7 * DAY_MS],
                  [d.plus14d, 14 * DAY_MS],
                ].map(([label, ms]) => (
                  <Button key={label as string} size="sm" variant="outline" onClick={() => report(run((s, n) => demoAdvanceClock(s, ms as number, n)))}>
                    {label as string}
                  </Button>
                ))}
              </div>
            </div>
            <Link href={account ? `/dashboard?account=${account.id}` : "/dashboard"} className="inline-block text-sm text-petrol-700 hover:underline">
              {m.dash.nav.overview} →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title={d.role} sub={m.demo.roleNote} />
          <div className="flex flex-wrap gap-2 p-5">
            <Button
              variant="outline"
              onClick={() => {
                run((s, n) => setDemoRole(s, "ops", n));
                router.push("/admin");
              }}
            >
              <Shield className="size-4" aria-hidden /> {d.roleOps}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(m.demo.resetConfirm)) {
                  reset();
                  toast("info", m.demo.resetDone);
                }
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> {d.reset}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title={d.flowTitle} />
          <ol className="space-y-2 p-5 text-sm">
            {d.flow.map((s, i) => (
              <li key={i} className="flex gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-copper" aria-hidden />
                <span>
                  <span className="num mr-1 text-muted">{i + 1}.</span>
                  {s}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
