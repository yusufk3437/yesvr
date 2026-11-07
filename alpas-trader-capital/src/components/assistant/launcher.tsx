"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Expand, MessageCircleQuestion, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { AssistantChat } from "./chat";
import { useAssistant } from "./context";

export function AssistantLauncher() {
  const { m } = useI18n();
  const { open, setOpen } = useAssistant();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-navy-800 pl-3 pr-4 text-sm font-medium text-paper shadow-xl ring-1 ring-paper/10 transition-transform hover:-translate-y-0.5 hover:bg-navy-700 sm:bottom-6 sm:right-6"
        aria-haspopup="dialog"
      >
        <MessageCircleQuestion className="size-5 text-brass-300" aria-hidden />
        <span className="hidden sm:inline">{m.common.openAssistant}</span>
        <span className="sm:hidden">{m.assistant.title.replace("ALPAS ", "")}</span>
      </button>
      <dialog
        ref={ref}
        aria-label={m.assistant.title}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-[440px] border-0 border-l border-line-2 bg-card p-0 text-ink shadow-2xl"
      >
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 bg-navy-900 px-4 py-3 text-paper">
              <h2 className="font-display text-base font-bold tracking-tight">{m.assistant.title}</h2>
              <div className="flex items-center gap-1">
                <Link href="/dashboard/assistant" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-paper/70 hover:bg-paper/10 hover:text-paper" aria-label={m.assistant.fullPage} title={m.assistant.fullPage}>
                  <Expand className="size-4" aria-hidden />
                </Link>
                <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-paper/70 hover:bg-paper/10 hover:text-paper" aria-label={m.assistant.closeLabel}>
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <AssistantChat compact />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
