"use client";

import Link from "next/link";
import { FlaskConical, RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { useToast } from "./ui";

export function DemoBanner() {
  const { m, f } = useI18n();
  const { ready, now, reset, state } = useStore();
  const toast = useToast();
  const offset = state?.clockOffsetMs ?? 0;
  return (
    <div className="no-print relative z-40 bg-ink text-paper/85">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[0.76rem] sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-copper-300">
          <FlaskConical className="size-3.5" aria-hidden /> {m.common.demo}
        </span>
        <span className="order-last min-w-0 basis-full leading-snug sm:order-none sm:basis-0 sm:flex-1">{m.demo.banner}</span>
        {ready && Math.abs(offset) > 60_000 && (
          <span className="num hidden text-paper/60 md:inline">
            {m.demo.clock}: {f.ny(now)} NY
          </span>
        )}
        <Link href="/dashboard/demo" className="ml-auto underline sm:ml-0 decoration-paper/30 underline-offset-2 hover:text-paper">
          {m.demo.tools}
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-1 underline decoration-paper/30 underline-offset-2 hover:text-paper"
          onClick={() => {
            if (window.confirm(m.demo.resetConfirm)) {
              reset();
              toast("info", m.demo.resetDone);
            }
          }}
        >
          <RotateCcw className="size-3" aria-hidden /> {m.demo.reset}
        </button>
      </div>
    </div>
  );
}
