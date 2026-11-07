"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useStore } from "@/lib/store";
import { Wordmark } from "./brand";
import { LangSwitch } from "./lang-switch";
import { LinkButton, cx } from "./ui";

export function SiteHeader() {
  const { m } = useI18n();
  const { ready, state } = useStore();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(path);
  if (openedAt !== path) {
    setOpenedAt(path);
    setOpen(false);
  }
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const signedIn = ready && !!state?.session.userId;
  const links = [
    { href: "/challenges", label: m.nav.challenges },
    { href: "/rules", label: m.nav.rules },
    { href: "/payouts", label: m.nav.payouts },
    { href: "/scaling", label: m.nav.scaling },
    { href: "/help", label: m.nav.help },
    { href: "/about", label: m.nav.about },
  ];
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line-2 bg-paper/92 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="ALPAS Trader Capital — home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav aria-label={m.nav.primary} className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path.startsWith(l.href) ? "page" : undefined}
              className={cx("rounded-md px-3 py-2 text-[0.9rem] font-medium transition-colors", path.startsWith(l.href) ? "text-ink" : "text-muted hover:text-ink")}
            >
              {l.label}
              {path.startsWith(l.href) && <span className="mt-0.5 block h-0.5 rounded-full bg-copper" aria-hidden />}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <LangSwitch />
          {signedIn ? (
            <LinkButton href="/dashboard" variant="outline" size="sm">
              {m.common.dashboard}
            </LinkButton>
          ) : (
            <LinkButton href="/login" variant="ghost" size="sm">
              {m.common.signIn}
            </LinkButton>
          )}
          <LinkButton href="/challenges" variant="accent" size="sm">
            {m.common.startChallenge}
          </LinkButton>
        </div>
        <button type="button" className="ml-auto rounded-md p-2 lg:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? m.common.closeMenu : m.common.openMenu} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="absolute inset-x-0 top-full z-30 h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line-2 bg-paper px-4 pb-10 pt-4 lg:hidden">
          <nav aria-label={m.nav.primary} className="flex flex-col">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="border-b border-line-2 py-3.5 font-display text-lg font-bold" aria-current={path.startsWith(l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
            <Link href="/contact" className="border-b border-line-2 py-3.5 font-display text-lg font-bold">
              {m.nav.contact}
            </Link>
          </nav>
          <div className="mt-6 flex flex-col gap-3">
            <LinkButton href="/challenges" variant="accent" size="lg">
              {m.common.startChallenge}
            </LinkButton>
            <LinkButton href={signedIn ? "/dashboard" : "/login"} variant="outline" size="lg">
              {signedIn ? m.common.dashboard : m.common.signIn}
            </LinkButton>
            <LangSwitch className="self-start" />
          </div>
        </div>
      )}
    </header>
  );
}
