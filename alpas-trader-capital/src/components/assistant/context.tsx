"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AssistantContext } from "@/domain/assistant";
import type { Locale } from "@/domain/l10n";

export interface ChatTurn {
  id: number;
  question: string;
  askedAt: number;
  context: AssistantContext | null;
  /** Language-model wording, valid only for the locale it was produced in. */
  rewrite?: { locale: Locale; paragraphs: string[] };
  mode: "rules" | "llm" | "offline" | "pending";
  feedback?: "up" | "down";
  ticketId?: string;
}

interface Api {
  turns: ChatTurn[];
  setTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>;
  open: boolean;
  setOpen: (v: boolean) => void;
  pending: string | null;
  ask: (q: string) => void;
  consumePending: () => string | null;
}

const Ctx = createContext<Api | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const ask = useCallback((q: string) => {
    setPending(q);
    setOpen(true);
  }, []);
  const consumePending = useCallback(() => {
    const p = pending;
    setPending(null);
    return p;
  }, [pending]);
  const api = useMemo(() => ({ turns, setTurns, open, setOpen, pending, ask, consumePending }), [turns, open, pending, ask, consumePending]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAssistant() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAssistant outside AssistantProvider");
  return c;
}
