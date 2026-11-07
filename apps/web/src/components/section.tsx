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
      <h1 className="text-large font-bold tracking-[-0.03em]">{title}</h1>
      {subtitle && <p className="mt-2 max-w-[60ch] text-body text-label-2">{subtitle}</p>}
      {children}
    </header>
  );
}

const STEPS = [
  { t: "Fund", d: "Deposit NEAR from your wallet, or swap in an asset from another chain with NEAR Intents." },
  { t: "Trade", d: "Buy Yes or No. Every trade reprices the pool, so the price is the market's current belief." },
  { t: "Research", d: "Scout gathers sources, and Quire fetches each one to confirm the quoted excerpt is there." },
  { t: "Analyse and act", d: "Assessor weighs the evidence against the price. Arbiter trades only inside its on-chain limits." },
  { t: "Write", d: "Scribe revises the claim's page on NEAR AI Cloud when the price or evidence changes materially." },
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
