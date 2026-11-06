"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, ChartLine, House, WalletCards } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { SessionControl } from "./session-control";
import { SimulatedBadge } from "./mode";

const NAV = [
  { href: "/markets", label: "Markets", icon: ChartLine },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/how-it-works", label: "How it works", icon: null },
];

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/markets", label: "Markets", icon: ChartLine },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function NavBar({ simulated }: { simulated: boolean }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-chrome backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-6 px-5">
        <Link href="/" className="text-title3 font-semibold tracking-[-0.02em]">
          Quire
        </Link>
        {simulated && <SimulatedBadge />}
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sub transition-colors duration-200 ${isActive(path, n.href) ? "text-label" : "text-label-2 hover:text-label"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <SessionControl />
        </div>
      </div>
    </header>
  );
}

/** iOS tab bar for phones. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t hairline bg-chrome pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = isActive(path, t.href);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium transition-colors duration-200 ${active ? "text-tint" : "text-label-3"}`}>
                <Icon size={23} strokeWidth={active ? 2.1 : 1.7} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
