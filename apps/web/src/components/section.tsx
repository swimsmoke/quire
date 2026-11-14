import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeader({ title, action, id }: { title: string; action?: { href: string; label: string }; id?: string }) {
  return (
    <div className="reveal mb-6 flex items-baseline justify-between gap-4 border-b hairline pb-3">
      <h2 id={id} className="display text-[1.85rem] leading-tight sm:text-[2.25rem]">
        {title}
      </h2>
      {action && (
        <Link href={action.href} className="shrink-0 text-sub font-medium text-tint transition-opacity hover:opacity-75">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pt-12 pb-10 md:pt-20">
      <h1 className="display rise text-[2.9rem] leading-[1.03] tracking-[-0.02em] sm:text-[4rem]">{title}</h1>
      {subtitle && (
        <p className="rise mt-4 max-w-[60ch] text-[1.05rem] leading-relaxed text-label-2" style={{ animationDelay: "90ms" }}>
          {subtitle}
        </p>
      )}
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
  { t: "Settle", d: "Once the world knows, anyone calls the AI jury. Three models give separate verdicts from the checked quotes, two in agreement go on-chain, and anyone who disagrees can put up a bond to challenge them." },
];

/** The claim's life, in order: a numbered sequence on a shared rule, not a grid of boxes. */
export function Steps() {
  return (
    <ol className="reveal-stagger grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((s, i) => (
        <li key={s.t} className="relative border-t-2 border-label/80 pt-5">
          <span className="tabular text-footnote font-semibold text-label-3">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="display mt-2 text-[1.5rem] leading-tight">{s.t}</h3>
          <p className="mt-2 text-sub leading-relaxed text-label-2">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}
