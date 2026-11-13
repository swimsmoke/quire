"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { SessionControl } from "./session-control";
import { SimulatedBadge } from "./mode";

const NAV = [
  { href: "/ask", label: "Ask" },
  { href: "/markets", label: "Markets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/agents", label: "Agents" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/how-it-works", label: "How it works" },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The Quire wordmark: a flowing script, set larger than the rest of the chrome. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-script leading-none tracking-normal ${className}`}>Quire</span>;
}

export function NavBar({ simulated }: { simulated: boolean }) {
  const path = usePathname();
  const links = (cls: string) =>
    NAV.map((n) => {
      const on = isActive(path, n.href);
      return (
        <Link
          key={n.href}
          href={n.href}
          aria-current={on ? "page" : undefined}
          className={`relative shrink-0 py-2 text-sub font-medium transition-colors duration-200 ${on ? "text-label" : "text-label-2 hover:text-label"} ${cls}`}
        >
          {n.label}
          <span
            aria-hidden
            className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tint transition-[opacity,transform] duration-300 ease-ios ${on ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"}`}
          />
        </Link>
      );
    });

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-chrome backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-5">
        <Link href="/" aria-label="Quire home" className="-mt-1 transition-opacity hover:opacity-80">
          <Wordmark className="text-[2.35rem]" />
        </Link>
        <nav aria-label="Main" className="hidden h-16 items-end gap-6 lg:gap-7 md:flex">
          {links("pb-[18px]")}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {simulated && <SimulatedBadge />}
          <ThemeToggle />
          <SessionControl />
        </div>
      </div>
      <nav aria-label="Main" className="mx-auto flex max-w-[1120px] gap-6 overflow-x-auto px-5 md:hidden">
        {links("pb-2.5")}
      </nav>
    </header>
  );
}
