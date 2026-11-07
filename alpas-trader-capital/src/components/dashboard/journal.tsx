"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { JournalEntry } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { accountTrades, deleteJournal, saveJournal } from "@/services/actions";
import { Button, Card, Dialog, EmptyState, Field, Input, Pill, Select, Textarea, useToast } from "../ui";
import { AccountHeader, PageTitle } from "./common";
import { useAccountSelection } from "./selection";

export function JournalPage() {
  const { m, f } = useI18n();
  const { state, run, actor } = useStore();
  const { account } = useAccountSelection();
  const params = useSearchParams();
  const toast = useToast();
  const linked = params.get("trade");
  const [editing, setEditing] = useState<Partial<JournalEntry> | null>(linked ? { tradeId: linked } : null);
  const [tag, setTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!state || !account || !actor) return <EmptyState title={m.dash.noAccounts} />;
  const j = m.dash.journal;
  const entries = state.journal.filter((e) => e.userId === actor.id && e.accountId === account.id);
  const tags = [...new Set(entries.flatMap((e) => e.tags))].sort();
  const shown = tag ? entries.filter((e) => e.tags.includes(tag)) : entries;
  const trades = accountTrades(state, account.id);

  const save = () => {
    if (!editing) return;
    const r = run((s, n) =>
      saveJournal(
        s,
        actor,
        { id: editing.id, accountId: account.id, tradeId: editing.tradeId || undefined, note: editing.note ?? "", tags: (editing.tags ?? []) as string[] },
        n,
      ),
    );
    if (!r.ok) setError(m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic);
    else {
      toast("gain", j.saved);
      setEditing(null);
      setError(null);
    }
  };

  return (
    <div>
      <AccountHeader account={account} />
      <PageTitle
        title={j.title}
        sub={j.sub}
        action={
          <Button onClick={() => setEditing({ tags: [] })}>
            <Plus className="size-4" aria-hidden /> {j.new}
          </Button>
        }
      />
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={j.filterTag}>
          <span className="text-sm text-muted">{j.filterTag}:</span>
          <button type="button" onClick={() => setTag(null)} aria-pressed={!tag} className={`rounded-full border px-3 py-1 text-xs ${!tag ? "border-ink bg-ink text-paper" : "border-line"}`}>
            {m.common.all}
          </button>
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTag(t)} aria-pressed={tag === t} className={`rounded-full border px-3 py-1 text-xs ${tag === t ? "border-ink bg-ink text-paper" : "border-line"}`}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <Card>
          <EmptyState title={j.empty} body={j.emptyBody} action={<Button onClick={() => setEditing({ tags: [] })}>{j.new}</Button>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((e) => (
            <Card key={e.id} as="article" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-muted">
                  {f.dateTime(e.updatedAt)}
                  {e.tradeId && <span className="num ml-2 rounded bg-paper-2 px-1.5 py-0.5 text-ink">{e.tradeId}</span>}
                  {e.dayKey && <span className="num ml-2 rounded bg-paper-2 px-1.5 py-0.5 text-ink">{e.dayKey}</span>}
                </div>
                <div className="flex gap-1">
                  <button type="button" className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label={m.common.edit} onClick={() => setEditing(e)}>
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:bg-loss-100 hover:text-loss"
                    aria-label={m.common.delete}
                    onClick={() => {
                      if (window.confirm(j.deleteConfirm)) {
                        run((s) => deleteJournal(s, actor, e.id));
                        toast("info", j.deleted);
                      }
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{e.note}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <Pill key={t} tone="petrol" icon={false}>
                    #{t}
                  </Pill>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog
        open={!!editing}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
        title={editing?.id ? j.edit : j.new}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {m.common.cancel}
            </Button>
            <Button onClick={save}>{m.common.save}</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label={j.linkTrade} htmlFor="j-trade">
              <Select id="j-trade" value={editing.tradeId ?? ""} onChange={(e) => setEditing({ ...editing, tradeId: e.target.value || undefined })} disabled={!!editing.id}>
                <option value="">{j.noTrade}</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} · {t.symbol} · {f.dateTime(t.openTime)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={j.note} htmlFor="j-note" error={error}>
              <Textarea id="j-note" rows={6} maxLength={2000} value={editing.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} aria-invalid={!!error} />
            </Field>
            <Field label={j.tags} htmlFor="j-tags" hint={j.tagsHint}>
              <Input id="j-tags" value={(editing.tags ?? []).join(", ")} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",") })} />
            </Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}
