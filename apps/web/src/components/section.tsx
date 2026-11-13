import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeader({ title, action, id }: { title: string; action?: { href: string; label: string }; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-title2 font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      {action && (
        <Link href={action.href} className="text-sub text-tint hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pt-10 pb-6 md:pt-14">
      <h1 className="text-large font-semibold tracking-[-0.03em]">{title}</h1>
      {subtitle && <p className="mt-2 max-w-[60ch] text-body text-label-2">{subtitle}</p>}
      {children}
    </header>
  );
}

const STEPS = [
  { t: "Ask", d: "Type a yes or no question. If Quire already has a market on it you see the current odds; if not, AI drafts one and you open it with as little as 0.1 NEAR." },
  { t: "Trade", d: "Buy Yes or No. Every trade reprices the pool, so the price is the market's current belief." },
  { t: "Research", d: "Scout finds sources on its own, and anyone can add more. Every quote is checked against the page it came from." },
  { t: "Write", d: "Scribe writes the claim's encyclopedia page on NEAR AI Cloud from the live price and verified evidence, with no prompt needed." },
  { t: "Revise", d: "When the price moves materially or new evidence is verified, Scribe writes a new revision. Old ones are kept." },
];

export function Steps() {
  return (
    <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
      {STEPS.map((s, i) => (
        <li key={s.t} className="border-t hairline pt-4">
          <span className="tabular text-footnote font-semibold text-tint">Step {i + 1}</span>
          <h3 className="mt-1 text-body font-semibold">{s.t}</h3>
          <p className="mt-1 text-sub text-label-2">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}
