"use client";

import { useMemo } from "react";
import { PROGRAMS, PROMO_CODES, RULE_SETS } from "@/domain/catalog";
import { buildKnowledgeBase } from "@/domain/knowledge";
import type { ProgramId } from "@/domain/types";
import { useStore } from "./store";

/** Catalog from the demo store (admin edits apply) or the static catalog before hydration. */
export function useCatalog() {
  const { state } = useStore();
  return useMemo(() => {
    const programs = state?.catalog.programs ?? PROGRAMS;
    const ruleSets = state?.catalog.ruleSets ?? RULE_SETS;
    const promos = state?.catalog.promos ?? PROMO_CODES;
    const program = (id: ProgramId) => programs.find((p) => p.id === id)!;
    const current = (id: ProgramId) => ruleSets.find((r) => r.id === program(id).currentRuleSetId)!;
    return { programs, ruleSets, promos, program, current };
  }, [state?.catalog]);
}

export function useKnowledge() {
  const { state } = useStore();
  const { programs, ruleSets } = useCatalog();
  return useMemo(() => buildKnowledgeBase(programs, ruleSets, state?.articles ?? []), [programs, ruleSets, state?.articles]);
}

export function useSessionUser() {
  const { state } = useStore();
  return state?.users.find((u) => u.id === state.session.userId) ?? null;
}
