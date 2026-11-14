"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Briefcase, Gavel, Home, LayoutList, LogOut, Sparkles, Trophy, UserRound } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { SessionControl } from "./session-control";
import { SimulatedBadge } from "./mode";
import { Avatar } from "./avatar";
import { useSession } from "@/lib/session";
import { fmtNear, shortAccount } from "@/lib/format";

const NAV = [
  { href: "/ask", label: "Ask" },
  { href: "/markets", label: "Markets" },
  { href: "/verdicts", label: "Verdicts" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-it-works", label: "How it works" },
];

export const REPO = "https://github.com/swimsmoke/quire";
const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The Quire wordmark: a flowing script, set larger than the rest of the chrome. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-script leading-none tracking-normal ${className}`}>Quire</span>;
}

export function NavBar({ simulated }: { simulated: boolean; apiOnline?: boolean }) {
  const path = usePathname();
  const [account, setAccount] = useState(false);
  useEffect(() => setAccount(false), [path]);

  return (
    <>
      <header className="site-header sticky top-0 z-40 border-b border-separator bg-chrome backdrop-blur-xl backdrop-saturate-150" style={{ viewTransitionName: "site-header" }}>
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-9 px-5">
          <Link href="/" aria-label="Quire home" className="-mt-1 transition-opacity hover:opacity-75">
            <Wordmark className="text-[2.3rem]" />
          </Link>
          <nav aria-label="Main" className="hidden h-16 items-center gap-1 md:flex">
            {NAV.map((n) => {
              const on = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative rounded-full px-3.5 py-1.5 text-sub font-medium transition-colors duration-300 ${on ? "bg-fill-2 text-label" : "text-label-2 hover:text-label"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="relative ml-auto flex items-center gap-1.5">
            {simulated && <SimulatedBadge />}
            <ThemeToggle />
            <SessionControl onOpenMenu={() => setAccount((v) => !v)} />
            {account && <AccountMenu onClose={() => setAccount(false)} />}
          </div>
        </div>
      </header>
      <TabBar path={path} />
    </>
  );
}

/** Opens from your avatar: the few things that are about you. */
function AccountMenu({ onClose }: { onClose: () => void }) {
  const { me, balance, onchain, signOut } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest("[data-account-button]")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  if (!me) return null;
  const account = me.session.accountId;
  const links = [
    { href: `/profile/${encodeURIComponent(account)}`, label: "Your profile", icon: UserRound },
    { href: "/portfolio", label: "Positions and balance", icon: Briefcase },
    { href: "/fund", label: "Add funds from any chain", icon: ArrowLeftRight },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  ];
  return (
    <div ref={ref} role="menu" className="anim-pop absolute top-12 right-0 z-50 w-[min(19rem,calc(100vw-2.5rem))] origin-top-right rounded-2xl border border-separator bg-elevated p-2 shadow-[var(--card-lift)]">
      <div className="flex items-center gap-3 px-3 pt-2 pb-3">
        <Avatar account={account} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sub font-semibold" title={account}>
            {shortAccount(account)}
          </p>
          <p className="tabular text-footnote text-label-2">
            {fmtNear(balance)} NEAR {onchain ? "in Quire" : "to practise with"}
          </p>
        </div>
      </div>
      <div className="border-t border-separator pt-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} role="menuitem" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sub text-label-2 transition-colors hover:bg-fill hover:text-label">
            <l.icon size={16} strokeWidth={1.8} aria-hidden />
            {l.label}
          </Link>
        ))}
        <button
          role="menuitem"
          onClick={() => {
            signOut();
            onClose();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sub text-no transition-colors hover:bg-fill"
        >
          <LogOut size={16} strokeWidth={1.8} aria-hidden />
          {onchain ? "Disconnect wallet" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

/** Phone tab bar. */
function TabBar({ path }: { path: string }) {
  const { me } = useSession();
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/markets", label: "Markets", icon: LayoutList },
    { href: "/ask", label: "Ask", icon: Sparkles },
    { href: "/verdicts", label: "Verdicts", icon: Gavel },
    { href: me ? `/profile/${encodeURIComponent(me.session.accountId)}` : "/me", label: "Me", icon: UserRound },
  ];
  return (
    <nav aria-label="Tabs" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden" style={{ viewTransitionName: "site-tabs" }}>
      <ul className="frost mx-auto flex max-w-[440px] justify-between rounded-[1.4rem] p-1.5 shadow-[0_14px_40px_-16px_rgba(0,0,0,0.4)]">
        {tabs.map((t) => {
          const on = t.label === "Me" ? path.startsWith("/profile") || path === "/me" : isActive(path, t.href);
          const Icon = t.icon;
          return (
            <li key={t.label} className="flex-1">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[0.68rem] font-semibold transition-[background-color,color] duration-300 ${on ? "bg-fill-2 text-label" : "text-label-2"}`}
              >
                <Icon size={19} strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
