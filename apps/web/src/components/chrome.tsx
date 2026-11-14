"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftRight, BookOpen, Bot, Briefcase, Code2, Home, LayoutList, LogOut, Menu, Sparkles, Trophy, UserRound } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { SessionControl } from "./session-control";
import { SimulatedBadge } from "./mode";
import { Sheet } from "./ui";
import { Avatar } from "./avatar";
import { useSession } from "@/lib/session";
import { fmtNear, shortAccount } from "@/lib/format";

const NAV = [
  { href: "/ask", label: "Ask" },
  { href: "/markets", label: "Markets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/agents", label: "Agents" },
  { href: "/how-it-works", label: "How it works" },
];

const REPO = "https://github.com/swimsmoke/quire";
const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The Quire wordmark: a flowing script, set larger than the rest of the chrome. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-script leading-none tracking-normal ${className}`}>Quire</span>;
}

export function NavBar({ simulated, apiOnline }: { simulated: boolean; apiOnline: boolean }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b hairline bg-chrome backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-5">
          <Link href="/" aria-label="Quire home" className="-mt-1 transition-opacity hover:opacity-80">
            <Wordmark className="text-[2.35rem]" />
          </Link>
          <nav aria-label="Main" className="hidden h-16 items-end gap-6 md:flex lg:gap-7">
            {NAV.map((n) => {
              const on = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative shrink-0 pb-[18px] text-sub font-medium transition-colors duration-200 ${on ? "text-label" : "text-label-2 hover:text-label"}`}
                >
                  {n.label}
                  <span aria-hidden className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tint transition-[opacity,transform] duration-300 ease-ios ${on ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"}`} />
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {simulated && <SimulatedBadge />}
            <SessionControl onOpenMenu={() => setMenu(true)} />
            <button
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              className="grid size-9 place-items-center rounded-full text-label-2 transition-colors hover:bg-fill hover:text-label"
            >
              <Menu size={19} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </header>
      <MenuDrawer open={menu} onClose={() => setMenu(false)} apiOnline={apiOnline} />
      <TabBar path={path} />
    </>
  );
}

function MenuDrawer({ open, onClose, apiOnline }: { open: boolean; onClose: () => void; apiOnline: boolean }) {
  const { me, balance, onchain, chain, signOut, connectWallet } = useSession();
  const account = me?.session.accountId;
  const big = [
    { href: account ? `/profile/${encodeURIComponent(account)}` : "/me", label: "Profile", icon: <UserRound size={20} />, color: "text-tint" },
    { href: "/leaderboard", label: "Leaderboard", icon: <Trophy size={20} />, color: "text-[#e0a92b]" },
    { href: "/ask", label: "Ask a question", icon: <Sparkles size={20} />, color: "text-violet" },
    { href: "/fund", label: "Fund from any chain", icon: <ArrowLeftRight size={20} />, color: "text-yes" },
  ];
  const small = [
    { href: "/markets", label: "Markets", icon: <LayoutList size={16} /> },
    { href: "/agents", label: "Agents", icon: <Bot size={16} /> },
    { href: "/portfolio", label: "Portfolio details", icon: <Briefcase size={16} /> },
    { href: "/how-it-works", label: "How it works", icon: <BookOpen size={16} /> },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Menu" side="left" bare>
      <div className="flex min-h-full flex-col px-6 pt-8">
        {account ? (
          <div className="flex items-center gap-4">
            <Avatar account={account} size={56} />
            <div className="min-w-0">
              <p className="truncate text-title3 font-semibold" title={account}>
                {shortAccount(account)}
              </p>
              <p className="tabular text-footnote text-label-2">
                {fmtNear(balance)} NEAR {onchain ? "in Quire" : "practice balance"}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-title3 font-semibold">Not signed in</p>
            <p className="mt-1 text-footnote text-label-2">{onchain ? `Connect a NEAR ${chain.network} wallet to trade and ask.` : "Sign in with a practice account to try it."}</p>
            <button
              onClick={() => {
                onClose();
                if (onchain) connectWallet().catch(() => undefined);
                else window.dispatchEvent(new Event("quire:signin"));
              }}
              className="mt-4 h-10 rounded-full bg-label px-5 text-sub font-semibold text-bg active:scale-[0.98]"
            >
              {onchain ? "Connect wallet" : "Sign in"}
            </button>
          </div>
        )}

        <nav aria-label="Menu" className="mt-8 space-y-1">
          {big.map((l) => (
            <Link key={l.href} href={l.href} onClick={onClose} className="-mx-3 flex items-center gap-4 rounded-xl px-3 py-3 text-[1.35rem] font-semibold tracking-[-0.02em] transition-colors hover:bg-fill">
              <span className={l.color}>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <hr className="my-6 hairline" />
        <nav aria-label="More" className="space-y-0.5">
          {small.map((l) => (
            <Link key={l.href} href={l.href} onClick={onClose} className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-body text-label-2 transition-colors hover:bg-fill hover:text-label">
              {l.icon}
              {l.label}
            </Link>
          ))}
          <a href={REPO} target="_blank" rel="noreferrer" className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-body text-label-2 transition-colors hover:bg-fill hover:text-label">
            <Code2 size={16} />
            Source code
          </a>
          {chain.contractId && (
            <a
              href={`https://${chain.network === "testnet" ? "testnet." : ""}nearblocks.io/address/${chain.contractId}`}
              target="_blank"
              rel="noreferrer"
              className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-body text-label-2 transition-colors hover:bg-fill hover:text-label"
            >
              <Home size={16} />
              Contract on NearBlocks
            </a>
          )}
        </nav>

        <div className="mt-auto pt-8">
          <p className="flex items-center gap-2 text-footnote text-label-2">
            <span className={`size-2 rounded-full ${apiOnline ? "bg-yes" : "bg-no"}`} aria-hidden />
            {apiOnline ? "All systems running" : "API unreachable"} · {onchain ? `NEAR ${chain.network}` : "Simulated"}
          </p>
          <div className="mt-4 flex items-center justify-between border-t hairline pt-4">
            <ThemeToggle />
            {account && (
              <button
                onClick={() => {
                  signOut();
                  onClose();
                }}
                className="flex items-center gap-2 rounded-full px-3 py-2 text-sub font-medium text-no transition-colors hover:bg-fill"
              >
                <LogOut size={16} />
                {onchain ? "Disconnect" : "Sign out"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** Phone tab bar, Polymarket style. */
function TabBar({ path }: { path: string }) {
  const { me } = useSession();
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/markets", label: "Markets", icon: LayoutList },
    { href: "/ask", label: "Ask", icon: Sparkles },
    { href: "/leaderboard", label: "Ranks", icon: Trophy },
    { href: me ? `/profile/${encodeURIComponent(me.session.accountId)}` : "/me", label: "Me", icon: UserRound },
  ];
  return (
    <nav aria-label="Tabs" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden">
      <ul className="frost mx-auto flex max-w-[440px] justify-between rounded-full p-1.5 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.35)]">
        {tabs.map((t) => {
          const on = t.label === "Me" ? path.startsWith("/profile") || path === "/me" : isActive(path, t.href);
          const Icon = t.icon;
          return (
            <li key={t.label} className="flex-1">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[0.68rem] font-semibold transition-colors ${on ? "bg-fill-2 text-label" : "text-label-2"}`}
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
