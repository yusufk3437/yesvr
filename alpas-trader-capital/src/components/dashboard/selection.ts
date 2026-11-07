"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Account } from "@/domain/types";
import { useStore } from "@/lib/store";
import { userAccounts } from "@/services/state";

const LIVE: Account["status"][] = ["active", "ready"];

/** Selected account lives in the URL (?account=), so views are shareable and survive reloads. */
export function useAccountSelection() {
  const { state } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const userId = state?.session.userId ?? null;
  const accounts = state && userId ? userAccounts(state, userId) : [];
  const requested = params.get("account");
  const account =
    accounts.find((a) => a.id === requested) ??
    accounts.find((a) => LIVE.includes(a.status) && a.kind !== "funded") ??
    accounts.find((a) => LIVE.includes(a.status)) ??
    accounts[0] ??
    null;
  const select = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("account", id);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  const withAccount = (href: string) => (account ? `${href}${href.includes("?") ? "&" : "?"}account=${account.id}` : href);
  return { accounts, account, select, withAccount };
}
