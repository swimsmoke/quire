import Link from "next/link";
import { SessionControl } from "./session-control";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/agents", label: "Agents" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Quire
        </Link>
        <nav className="order-3 flex w-full gap-5 overflow-x-auto text-sm sm:order-none sm:w-auto">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-fade hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <SessionControl />
        </div>
      </div>
    </header>
  );
}
