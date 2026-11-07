"use client";

/**
 * Client-side demo store. Holds the DemoState in memory, persists it to
 * localStorage (demo data only — never used as authentication), and runs every
 * mutation through the pure service functions in src/services/actions.ts.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createSeedState } from "@/services/seed";
import { SCHEMA_VERSION, nowOf, type DemoState } from "@/services/state";
import type { Actor, Result } from "@/services/actions";

const KEY = "alpas.demo.v" + SCHEMA_VERSION;

type Listener = () => void;

class DemoStore {
  state: DemoState | null = null;
  listeners = new Set<Listener>();

  load() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.accounts)) {
          this.state = parsed;
          return;
        }
      }
    } catch {
      /* corrupt or blocked storage — fall back to a fresh seed */
    }
    this.state = createSeedState(Date.now());
    this.persist();
  }

  persist() {
    if (!this.state) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage full or blocked; keep working in memory */
    }
  }

  set(next: DemoState) {
    this.state = next;
    this.persist();
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

const store = new DemoStore();

interface StoreApi {
  state: DemoState | null;
  ready: boolean;
  now: number;
  actor: Actor | null;
  opsActor: Actor;
  run: <T>(fn: (draft: DemoState, now: number) => Result<T>) => Result<T>;
  reset: () => void;
}

const Ctx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    store.subscribe,
    () => store.state,
    () => null,
  );

  useEffect(() => {
    if (!store.state) store.load();
    for (const l of store.listeners) l();
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        store.state = null;
        store.load();
        for (const l of store.listeners) l();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Re-render time-dependent views periodically (demo clock follows real time).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => (state ? nowOf(state) : 0), [state, tick]);

  const run = useCallback(<T,>(fn: (draft: DemoState, now: number) => Result<T>): Result<T> => {
    if (!store.state) return { ok: false, error: "generic" };
    const draft = structuredClone(store.state);
    const result = fn(draft, nowOf(store.state));
    if (result.ok) store.set(draft);
    return result;
  }, []);

  const reset = useCallback(() => {
    const keepLocaleSession = store.state?.session;
    const fresh = createSeedState(Date.now());
    if (keepLocaleSession?.userId && fresh.users.some((u) => u.id === keepLocaleSession.userId)) fresh.session = keepLocaleSession;
    store.set(fresh);
  }, []);

  const api = useMemo<StoreApi>(() => {
    const userId = state?.session.userId ?? null;
    return {
      state,
      ready: !!state,
      now,
      actor: userId ? { role: "trader", id: userId } : null,
      opsActor: { role: "ops", id: "ops.demo" },
      run,
      reset,
    };
  }, [state, now, run, reset]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
