import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeader({ title, action, id }: { title: string; action?: { href: string; label: string }; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="display text-[1.75rem] leading-tight sm:text-[2rem]">
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
    <header className="pt-10 pb-8 md:pt-16">
      <h1 className="display text-[2.75rem] leading-[1.05] sm:text-[3.5rem]">{title}</h1>
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
  { t: "Settle", d: "When the answer is in, anyone asks the AI jury. Three models rule from the checked evidence; a majority proposes the outcome, anyone can dispute it, and then winners are paid." },
];

export function Steps() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((s, i) => (
        <li key={s.t} className="card p-5 sm:p-6">
          <span className="tabular grid size-8 place-items-center rounded-full bg-fill-2 text-footnote font-semibold">{i + 1}</span>
          <h3 className="display mt-4 text-[1.3rem]">{s.t}</h3>
          <p className="mt-1.5 text-sub text-label-2">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}
