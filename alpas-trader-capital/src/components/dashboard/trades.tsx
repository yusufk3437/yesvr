"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, NotebookPen } from "lucide-react";
import { tradeNet, tradeRisk } from "@/domain/risk";
import { tradingDayKey } from "@/domain/time";
import type { Trade } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { accountTrades } from "@/services/actions";
import { getChallenge } from "@/services/state";
import { Button, Card, Dialog, EmptyState, Field, Input, LinkButton, Pill, Select, Table, pnlText, td, th, useToast } from "../ui";
import { AccountHeader, PageTitle, fmtDuration } from "./common";
import { useAccountSelection } from "./selection";

export function TradesPage() {
  const { m, t, f, locale } = useI18n();
  const { state } = useStore();
  const { account } = useAccountSelection();
  const toast = useToast();
  const [filters, setFilters] = useState({ symbol: "all", side: "all", result: "all", status: "all", from: "", to: "" });
  const [detail, setDetail] = useState<Trade | null>(null);
  if (!state || !account) return <EmptyState title={m.dash.noAccounts} />;
  const tr = m.dash.trades;
  const rs = getChallenge(state, account.challengeId)!.ruleSnapshot;
  const all = accountTrades(state, account.id);
  const symbols = [...new Set(all.map((x) => x.symbol))].sort();
  const rows = all.filter((x) => {
    const n = tradeNet(x);
    const day = tradingDayKey(x.openTime, rs.timezone, rs.dailyResetHour);
    if (filters.symbol !== "all" && x.symbol !== filters.symbol) return false;
    if (filters.side !== "all" && x.side !== filters.side) return false;
    if (filters.status !== "all" && x.status !== filters.status) return false;
    if (filters.result === "win" && !(n > 0)) return false;
    if (filters.result === "loss" && !(n < 0)) return false;
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  });
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters((x) => ({ ...x, [k]: e.target.value }));

  const exportCsv = () => {
    const header = ["ticket", "account", "symbol", "side", "lots", "open_time_utc", "open_price", "close_time_utc", "close_price", "stop_loss", "take_profit", "gross_usd", "commission_usd", "swap_usd", "net_usd", "status", "close_reason", "trading_day_ny"];
    const esc = (v: string | number | undefined) => {
      const s = v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((x) =>
      [
        x.id,
        x.accountId,
        x.symbol,
        x.side,
        x.volume,
        new Date(x.openTime).toISOString(),
        x.openPrice,
        x.closeTime ? new Date(x.closeTime).toISOString() : "",
        x.closePrice ?? "",
        x.stopLoss ?? "",
        x.takeProfit ?? "",
        (x.grossPnl / 100).toFixed(2),
        (x.commission / 100).toFixed(2),
        (x.swap / 100).toFixed(2),
        (tradeNet(x) / 100).toFixed(2),
        x.status,
        x.closeReason ?? "",
        tradingDayKey(x.openTime, rs.timezone, rs.dailyResetHour),
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `alpas-${account.id}-trades.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("gain", t(tr.exported, { n: rows.length }));
  };

  const totals = rows.reduce((s, x) => ({ gross: s.gross + x.grossPnl, comm: s.comm + x.commission, swap: s.swap + x.swap, net: s.net + tradeNet(x) }), { gross: 0, comm: 0, swap: 0, net: 0 });

  return (
    <div>
      <AccountHeader account={account} />
      <PageTitle
        title={tr.title}
        sub={`${tr.sub} ${tr.simulated}`}
        action={
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-4" aria-hidden /> {m.common.exportCsv}
          </Button>
        }
      />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
          <Field label={tr.symbol} htmlFor="f-sym">
            <Select id="f-sym" value={filters.symbol} onChange={set("symbol")}>
              <option value="all">{m.common.all}</option>
              {symbols.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label={tr.side} htmlFor="f-side">
            <Select id="f-side" value={filters.side} onChange={set("side")}>
              <option value="all">{m.common.all}</option>
              <option value="buy">{m.labels.side.buy}</option>
              <option value="sell">{m.labels.side.sell}</option>
            </Select>
          </Field>
          <Field label={tr.result} htmlFor="f-res">
            <Select id="f-res" value={filters.result} onChange={set("result")}>
              {(["all", "win", "loss"] as const).map((r) => (
                <option key={r} value={r}>
                  {tr.results[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={m.common.status} htmlFor="f-st">
            <Select id="f-st" value={filters.status} onChange={set("status")}>
              {(["all", "open", "closed"] as const).map((r) => (
                <option key={r} value={r}>
                  {tr.status[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.from} htmlFor="f-from">
            <Input id="f-from" type="date" value={filters.from} onChange={set("from")} />
          </Field>
          <Field label={tr.to} htmlFor="f-to">
            <Input id="f-to" type="date" value={filters.to} onChange={set("to")} />
          </Field>
          <Button variant="ghost" onClick={() => setFilters({ symbol: "all", side: "all", result: "all", status: "all", from: "", to: "" })}>
            {tr.clear}
          </Button>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-5 py-3 text-sm">
          <span className="text-muted">{t(tr.count, { n: rows.length })}</span>
          <span className="num">
            {tr.gross} {f.money(totals.gross, { sign: true })} · {tr.commission} {f.money(totals.comm)} · {tr.swap} {f.money(totals.swap)} ·{" "}
            <b className={pnlText(totals.net)}>
              {tr.net} {f.money(totals.net, { sign: true })}
            </b>
          </span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={all.length ? m.common.noResults : tr.empty} />
        ) : (
          <Table caption={tr.title}>
            <thead className="sticky top-14 bg-card">
              <tr>
                <th className={th}>{tr.id}</th>
                <th className={th}>{tr.symbol}</th>
                <th className={th}>{tr.side}</th>
                <th className={`${th} text-right`}>{tr.volume}</th>
                <th className={th}>{tr.open}</th>
                <th className={th}>{tr.close}</th>
                <th className={`${th} text-right`}>{tr.gross}</th>
                <th className={`${th} text-right`}>{tr.commission}</th>
                <th className={`${th} text-right`}>{tr.swap}</th>
                <th className={`${th} text-right`}>{tr.net}</th>
                <th className={th}>{tr.duration}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-paper" onClick={() => setDetail(x)}>
                  <td className={`${td} num`}>
                    <button type="button" className="text-navy-700 underline decoration-navy-700/30 underline-offset-2" onClick={() => setDetail(x)}>
                      {x.id}
                    </button>
                  </td>
                  <td className={`${td} font-medium`}>{x.symbol}</td>
                  <td className={td}>{m.labels.side[x.side]}</td>
                  <td className={`${td} num text-right`}>{f.num(x.volume)}</td>
                  <td className={`${td} num whitespace-nowrap`}>{f.dateTime(x.openTime)}</td>
                  <td className={`${td} num whitespace-nowrap`}>{x.closeTime ? f.dateTime(x.closeTime) : <Pill tone="info">{tr.openPosition}</Pill>}</td>
                  <td className={`${td} num text-right`}>{f.money(x.grossPnl, { sign: true })}</td>
                  <td className={`${td} num text-right text-muted`}>{f.money(x.commission)}</td>
                  <td className={`${td} num text-right text-muted`}>{f.money(x.swap)}</td>
                  <td className={`${td} num text-right font-semibold ${pnlText(tradeNet(x))}`}>{f.money(tradeNet(x), { sign: true })}</td>
                  <td className={`${td} whitespace-nowrap`}>{x.closeTime ? fmtDuration(x.closeTime - x.openTime, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? t(tr.detail, { id: detail.id }) : ""} footer={detail && (
        <LinkButton href={`/dashboard/journal?account=${account.id}&trade=${detail.id}`} variant="outline" size="sm">
          <NotebookPen className="size-4" aria-hidden /> {tr.addNote}
        </LinkButton>
      )}>
        {detail && <TradeDetail trade={detail} />}
      </Dialog>
    </div>
  );
}

function TradeDetail({ trade }: { trade: Trade }) {
  const { m, f } = useI18n();
  const tr = m.dash.trades;
  const risk = tradeRisk(trade);
  const n = tradeNet(trade);
  const rows: [string, React.ReactNode][] = [
    [tr.symbol, `${trade.symbol} · ${m.labels.side[trade.side]} · ${f.num(trade.volume)} ${tr.volume.toLowerCase()}`],
    [tr.openPrice, `${trade.openPrice} · ${f.dateTime(trade.openTime)}`],
    trade.status === "open" ? [tr.markPrice, String(trade.markPrice ?? trade.openPrice)] : [tr.closePrice, `${trade.closePrice} · ${f.dateTime(trade.closeTime ?? 0)}`],
    [tr.stopLoss, trade.stopLoss ?? "—"],
    [tr.takeProfit, trade.takeProfit ?? "—"],
    [tr.gross, f.money(trade.grossPnl, { sign: true })],
    [tr.commission, f.money(trade.commission)],
    [tr.swap, f.money(trade.swap)],
    [tr.net, <b key="n" className={pnlText(n)}>{f.money(n, { sign: true })}</b>],
    [tr.risk, risk !== null ? f.money(risk) : "—"],
    [tr.rMultiple, risk ? `${f.num(n / risk)}R` : "—"],
    [tr.mae, f.money(trade.mae)],
    [tr.reason, trade.closeReason ? m.labels.closeReason[trade.closeReason] : tr.openPosition],
  ];
  return (
    <div>
      <dl className="num divide-y divide-line-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {trade.newsWindow && <p className="mt-3 text-sm text-warn">{tr.newsFlag}</p>}
      <p className="mt-3 text-xs text-muted">{tr.simulated}</p>
      <Link href="/rules" className="mt-2 inline-block text-xs text-navy-700 hover:underline">
        {m.nav.rules} →
      </Link>
    </div>
  );
}
