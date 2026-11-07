"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  Award,
  Bell,
  BookText,
  Briefcase,
  CandlestickChart,
  FlaskConical,
  Gauge,
  HandCoins,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Receipt,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { formatSize } from "@/domain/money";
import { useI18n } from "@/i18n/provider";
import { useCatalog, useSessionUser } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { logout } from "@/services/actions";
import { AssistantLauncher } from "../assistant/launcher";
import { Wordmark } from "../brand";
import { LangSwitch } from "../lang-switch";
import { Card, LinkButton, LoadingBlock, cx } from "../ui";
import { useAccountSelection } from "./selection";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  const { ready, state } = useStore();
  const path = usePathname();
  const signedIn = !!state?.session.userId;
  return (
    <div className="min-h-dvh bg-paper">
      <Suspense>
        <Inner>
          {!ready ? (
            <Card className="m-4">
              <LoadingBlock label={m.common.loading} rows={8} />
            </Card>
          ) : !signedIn ? (
            <Card className="mx-auto mt-16 max-w-md p-8 text-center">
              <p className="font-display text-lg font-bold">{m.dash.signInRequired}</p>
              <LinkButton href={`/login?next=${encodeURIComponent(path)}`} className="mt-5">
                {m.common.signIn}
              </LinkButton>
            </Card>
          ) : (
            children
          )}
        </Inner>
      </Suspense>
      <AssistantLauncher />
    </div>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  const path = usePathname();
  const { state, run } = useStore();
  const user = useSessionUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(path);
  if (openedAt !== path) {
    setOpenedAt(path);
    setOpen(false);
  }
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);
  const { withAccount } = useAccountSelection();
  const unread = state && user ? state.notifications.filter((n) => n.userId === user.id && !n.read).length : 0;
  const n = m.dash.nav;
  const groups = [
    {
      title: n.groupTrading,
      items: [
        { href: "/dashboard", label: n.overview, icon: Gauge, keep: true },
        { href: "/dashboard/trades", label: n.trades, icon: CandlestickChart, keep: true },
        { href: "/dashboard/journal", label: n.journal, icon: BookText, keep: true },
        { href: "/dashboard/account", label: n.account, icon: Briefcase, keep: true },
      ],
    },
    {
      title: n.groupMoney,
      items: [
        { href: "/dashboard/payouts", label: n.payouts, icon: HandCoins, keep: false },
        { href: "/dashboard/certificates", label: n.certificates, icon: Award, keep: false },
        { href: "/dashboard/verification", label: n.verification, icon: ShieldCheck, keep: false },
      ],
    },
    {
      title: n.groupAccount,
      items: [
        { href: "/dashboard/orders", label: n.orders, icon: Receipt, keep: false },
        { href: "/dashboard/notifications", label: n.notifications, icon: Bell, keep: false, badge: unread },
        { href: "/dashboard/profile", label: n.profile, icon: UserRound, keep: false },
        { href: "/dashboard/support", label: n.support, icon: LifeBuoy, keep: false },
        { href: "/dashboard/assistant", label: n.assistant, icon: MessageCircleQuestion, keep: false },
        { href: "/dashboard/demo", label: n.demo, icon: FlaskConical, keep: true },
      ],
    },
  ];
  const isActive = (href: string) => (href === "/dashboard" ? path === "/dashboard" : path.startsWith(href));
  const nav = (
    <nav aria-label="Dashboard" className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="eyebrow px-3 text-paper/60">{g.title}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.keep ? withAccount(it.href) : it.href}
                  aria-current={isActive(it.href) ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-[9px] px-3 py-2 text-[0.88rem] transition-colors",
                    isActive(it.href) ? "bg-paper/10 text-paper" : "text-paper/65 hover:bg-paper/5 hover:text-paper",
                  )}
                >
                  <it.icon className={cx("size-4", isActive(it.href) ? "text-brass-300" : "")} aria-hidden />
                  <span className="flex-1">{it.label}</span>
                  {"badge" in it && it.badge ? <span className="num rounded-full bg-brass px-1.5 text-[0.7rem] font-semibold text-white">{it.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-paper/10 pt-4">
        <Link href="/admin" className="flex items-center gap-3 rounded-[9px] px-3 py-2 text-[0.84rem] text-paper/55 hover:bg-paper/5 hover:text-paper">
          <Wrench className="size-4" aria-hidden /> {n.admin}
        </Link>
      </div>
    </nav>
  );
  return (
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* The column stretches to the full page height; the nav inside stays pinned. */}
      <div className="no-print hidden bg-navy-950 lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-3 py-5">
          <Link href="/" className="px-3">
            <Wordmark tone="light" />
          </Link>
          <div className="mt-8 flex-1">{nav}</div>
        </aside>
      </div>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line-2 bg-paper/90 px-4 backdrop-blur sm:px-6">
          <button type="button" className="rounded-md p-1.5 lg:hidden" aria-label={m.common.openMenu} aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </button>
          <AccountSelect />
          <div className="ml-auto flex items-center gap-2">
            <LangSwitch className="hidden sm:inline-flex" />
            <Link href="/dashboard/notifications" className="relative rounded-md p-2 text-muted hover:text-ink" aria-label={`${n.notifications}${unread ? ` (${unread})` : ""}`}>
              <Bell className="size-5" aria-hidden />
              {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-brass" aria-hidden />}
            </Link>
            <span className="hidden text-sm font-medium md:inline">{user?.name}</span>
            <button
              type="button"
              className="rounded-md p-2 text-muted hover:text-ink"
              aria-label={m.common.signOut}
              title={m.common.signOut}
              onClick={() => {
                run((s) => logout(s));
                router.push("/");
              }}
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6">
          {children}
        </main>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={m.common.menu}>
          <button type="button" className="absolute inset-0 bg-navy-950/60" aria-label={m.common.closeMenu} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-xs overflow-y-auto bg-navy-950 px-3 py-5">
            <div className="flex items-center justify-between px-3">
              <Wordmark tone="light" />
              <button type="button" className="rounded-md p-1.5 text-paper/70" aria-label={m.common.closeMenu} onClick={() => setOpen(false)}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-8">{nav}</div>
            <LangSwitch tone="light" className="mx-3 mt-6" />
          </div>
        </div>
      )}
    </div>
  );
}

function AccountSelect() {
  const { m, l } = useI18n();
  const { programs } = useCatalog();
  const { state } = useStore();
  const { accounts, account, select } = useAccountSelection();
  if (!state || !accounts.length) return null;
  return (
    <div className="min-w-0 flex-1 sm:flex-none">
      <label htmlFor="acct" className="sr-only">
        {m.dash.accountSelector}
      </label>
      <select
        id="acct"
        value={account?.id}
        onChange={(e) => select(e.target.value)}
        className="num h-9 w-full max-w-[min(420px,100%)] truncate rounded-[9px] border border-line bg-white px-2.5 text-[0.84rem] font-medium focus:border-navy-600 focus:outline-none"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.id} · {l(programs.find((p) => p.id === a.programId)!.name)} {formatSize(a.size)} · {m.labels.phase[a.kind]} · {m.labels.accountStatus[a.status]}
          </option>
        ))}
      </select>
    </div>
  );
}
