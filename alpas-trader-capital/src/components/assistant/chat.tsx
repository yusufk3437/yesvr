"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpenCheck, Calculator, LifeBuoy, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { answerQuestion, MAX_QUESTION_LENGTH, type AssistantAnswer } from "@/domain/assistant";
import { useI18n } from "@/i18n/provider";
import { useCatalog, useKnowledge } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { createTicket, recordFeedback } from "@/services/actions";
import { buildAssistantContext } from "@/services/assistant-context";
import { Monogram } from "../brand";
import { Button, Pill, cx, useToast } from "../ui";
import { useAssistant, type ChatTurn } from "./context";

type Mode = "rules" | "llm";

function useServerMode() {
  const [mode, setMode] = useState<Mode | "offline" | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { mode: Mode }) => alive && setMode(d.mode))
      .catch(() => alive && setMode("offline"));
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}

let turnSeq = 1;

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  void compact;
  const { m, locale, t } = useI18n();
  const { state, now, run, actor } = useStore();
  const toast = useToast();
  const kb = useKnowledge();
  const { programs, ruleSets } = useCatalog();
  const { turns, setTurns, consumePending, pending } = useAssistant();
  const serverMode = useServerMode();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const signedIn = !!state?.session.userId;

  const compute = (turn: ChatTurn): AssistantAnswer =>
    answerQuestion({ question: turn.question, locale, kb, programs, ruleSets, context: turn.context, now: turn.askedAt, timeZone });

  const submit = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    if (q.length > MAX_QUESTION_LENGTH) {
      setError(t(m.assistant.tooLong, { n: MAX_QUESTION_LENGTH }));
      return;
    }
    setError(null);
    setInput("");
    const context = state ? buildAssistantContext(state, state.session.userId, now) : null;
    const turn: ChatTurn = { id: turnSeq++, question: q, askedAt: now, context, mode: "pending" };
    setTurns((xs) => [...xs, turn]);
    const answer = compute(turn);
    let mode: ChatTurn["mode"] = "rules";
    let rewrite: ChatTurn["rewrite"];
    try {
      const cited = answer.citations.map((c) => kb.find((a) => a.id === c.id)).filter((a) => !!a);
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          locale,
          refusal: !!answer.refusal,
          draft: {
            paragraphs: answer.paragraphs,
            facts: answer.facts,
            notes: answer.notes,
            sources: cited.map((a) => ({ id: a!.id, title: a!.title[locale], body: a!.body[locale] })),
          },
        }),
      });
      if (!res.ok) throw new Error("http");
      const data = (await res.json()) as { mode: Mode; paragraphs?: string[] };
      if (data.mode === "llm" && data.paragraphs) {
        mode = "llm";
        rewrite = { locale, paragraphs: data.paragraphs };
      }
    } catch {
      mode = "offline";
    }
    setTurns((xs) => xs.map((x) => (x.id === turn.id ? { ...x, mode, rewrite } : x)));
  };

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => {
      const p = consumePending();
      if (p) void submit(p);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const lastMode = turns[turns.length - 1]?.mode;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, lastMode]);

  const modeLabel = serverMode === "llm" ? m.assistant.modeLlm : serverMode === "offline" ? m.assistant.modeOffline : m.assistant.modeRules;
  const modeNote = serverMode === "llm" ? m.assistant.modeLlmNote : m.assistant.modeRulesNote;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={serverMode === "llm" ? "navy" : "warn"}>{modeLabel}</Pill>
          <span className="text-xs text-muted">{signedIn ? m.assistant.signedInAs : m.assistant.signedOut}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{modeNote}</p>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {turns.length === 0 && (
          <div className="fade-up">
            <p className="text-sm text-graphite">{m.assistant.intro}</p>
            <p className="eyebrow mt-5 text-muted">{m.assistant.suggested}</p>
            <div className="mt-2 flex flex-col gap-2">
              {answerQuestion({ question: "", locale, kb, programs, ruleSets, context: null, now }).suggestions.map((s) => (
                <button key={s} type="button" onClick={() => submit(s)} className="rounded-[10px] border border-line bg-white px-3 py-2 text-left text-sm text-ink transition-colors hover:border-navy-600">
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs text-subtle">{m.assistant.limits}</p>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id}>{renderTurn(turn, turn.mode === "pending" ? null : compute(turn), submit)}</div>
        ))}
      </div>

      <form
        className="border-t border-line-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
      >
        {error && <p role="alert" className="mb-2 text-xs text-loss">{error}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">
            {m.assistant.placeholder}
          </label>
          <textarea
            id="assistant-input"
            rows={1}
            value={input}
            maxLength={MAX_QUESTION_LENGTH + 50}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            placeholder={m.assistant.placeholder}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-[10px] border border-line bg-white px-3 py-2 text-sm focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/20"
          />
          <Button type="submit" aria-label={m.assistant.send} className="h-10 w-10 px-0" disabled={!input.trim()}>
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        </div>
        {turns.length > 0 && (
          <button type="button" onClick={() => setTurns([])} className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
            <Trash2 className="size-3" aria-hidden /> {m.assistant.clear}
          </button>
        )}
      </form>
    </div>
  );

  function renderTurn(turn: ChatTurn, answer: AssistantAnswer | null, onAsk: (q: string) => void) {
    const paragraphs = turn.rewrite && turn.rewrite.locale === locale ? turn.rewrite.paragraphs : answer?.paragraphs ?? [];
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-[12px] rounded-br-sm bg-navy-800 px-3 py-2 text-sm text-paper">
            <span className="sr-only">{m.assistant.you}: </span>
            {turn.question}
          </p>
        </div>
        <div className="flex gap-2">
          <Monogram className="mt-0.5 size-6" title="" />
          <div className="min-w-0 flex-1 rounded-[12px] rounded-tl-sm border border-line-2 bg-white px-3 py-2.5 text-sm">
            {!answer ? (
              <p className="animate-pulse text-muted">{m.assistant.thinking}</p>
            ) : (
              <>
                <div className={cx("space-y-2 leading-relaxed", answer.refusal && answer.refusal !== "sign_in" && "text-graphite-2")}>
                  {paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {answer.facts.length > 0 && (
                  <div className="mt-3 rounded-[10px] bg-paper px-3 py-2">
                    <p className="flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
                      <Calculator className="size-3" aria-hidden /> {m.assistant.numbers}
                    </p>
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                      {answer.facts.map((f) => (
                        <div key={f.label} className="min-w-0">
                          <dt className="text-[0.72rem] text-muted">{f.label}</dt>
                          <dd className="num font-semibold">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {answer.notes.length > 0 && (
                  <ul className="mt-3 space-y-1 border-l-2 border-brass-300 pl-3 text-[0.8rem] text-graphite-2">
                    {answer.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
                {answer.citations.length > 0 && (
                  <div className="mt-3">
                    <p className="flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
                      <BookOpenCheck className="size-3" aria-hidden /> {m.assistant.sources}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {answer.citations.map((c) => (
                        <li key={c.id}>
                          <Link href={c.href} className="group block rounded-md px-1 py-0.5 hover:bg-paper">
                            <span className="block text-[0.7rem] font-medium text-brass-700">{c.label}</span>
                            <span className="text-[0.82rem] text-navy-700 underline decoration-navy-700/30 underline-offset-2 group-hover:decoration-navy-700">{c.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-2 pt-2 text-xs text-muted">
                  <Pill tone={turn.mode === "llm" ? "navy" : "neutral"} icon={false}>
                    {turn.mode === "llm" ? m.assistant.modeLlm : turn.mode === "offline" ? m.assistant.modeOffline : m.assistant.modeRules}
                  </Pill>
                  {turn.feedback ? (
                    <span>{m.assistant.thanks}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {m.assistant.helpful}
                      {(["up", "down"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-label={r === "up" ? m.assistant.yes : m.assistant.no}
                          className="rounded p-1 hover:bg-paper-2 hover:text-ink"
                          onClick={() => {
                            run((s, n) => recordFeedback(s, actor, { question: turn.question, intent: answer.intent, rating: r }, n));
                            setTurns((xs) => xs.map((x) => (x.id === turn.id ? { ...x, feedback: r } : x)));
                          }}
                        >
                          {r === "up" ? <ThumbsUp className="size-3.5" aria-hidden /> : <ThumbsDown className="size-3.5" aria-hidden />}
                        </button>
                      ))}
                    </span>
                  )}
                  <span className="flex-1" />
                  {turn.ticketId ? (
                    <span className="text-gain">{t(m.assistant.escalated, { id: turn.ticketId })}</span>
                  ) : actor ? (
                    <button
                      type="button"
                      className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-paper-2 hover:text-ink", answer.escalate && "font-semibold text-brass-700")}
                      onClick={() => {
                        const r = run((s, n) =>
                          createTicket(
                            s,
                            actor,
                            {
                              subject: turn.question.slice(0, 120),
                              body: `${turn.question}\n\n— ALPAS Assistant (${answer.intent}):\n${paragraphs.join("\n")}`,
                              category: "assistant",
                              source: "assistant",
                              transcript: { question: turn.question, answer: paragraphs.join("\n"), sources: answer.citations.map((c) => c.id) },
                            },
                            n,
                          ),
                        );
                        if (r.ok) {
                          setTurns((xs) => xs.map((x) => (x.id === turn.id ? { ...x, ticketId: r.value.ticketId } : x)));
                          toast("gain", t(m.assistant.escalated, { id: r.value.ticketId }));
                        } else toast("loss", m.errors.generic);
                      }}
                    >
                      <LifeBuoy className="size-3.5" aria-hidden /> {m.assistant.escalate}
                    </button>
                  ) : (
                    <Link href="/contact" className="inline-flex items-center gap-1 hover:text-ink">
                      <LifeBuoy className="size-3.5" aria-hidden /> {m.assistant.escalate}
                    </Link>
                  )}
                </div>
                {answer.suggestions.length > 0 && answer.refusal && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {answer.suggestions.slice(0, 2).map((s) => (
                      <button key={s} type="button" onClick={() => onAsk(s)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-navy-600">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
