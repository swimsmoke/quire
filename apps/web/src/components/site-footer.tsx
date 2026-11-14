"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { BROWSER_API } from "@/lib/api";
import { useSession } from "@/lib/session";
import { REPO, Wordmark } from "./chrome";
import { ThemeToggle } from "./theme-toggle";
import { OddsRing } from "./odds-ring";

type L = { label: string; href: string; external?: boolean };

/** The last page of every page: where to go next, how to check us, and the fine print. */
export function SiteFooter({ apiOnline }: { apiOnline: boolean }) {
  const { chain, onchain } = useSession();
  const explorer = chain.contractId ? `https://${chain.network === "testnet" ? "testnet." : ""}nearblocks.io/address/${chain.contractId}` : null;
  const groups: { title: string; links: L[] }[] = [
    {
      title: "Use Quire",
      links: [
        { label: "Ask a question", href: "/ask" },
        { label: "Browse claims", href: "/markets" },
        { label: "Verdicts", href: "/verdicts" },
        { label: "Leaderboard", href: "/leaderboard" },
        { label: "Add funds from any chain", href: "/fund" },
      ],
    },
    {
      title: "Check our work",
      links: [
        { label: "How it works", href: "/how-it-works" },
        { label: "Verify every signature", href: `${REPO}#judges-start-here`, external: true },
        ...(explorer ? [{ label: "The contract on NearBlocks", href: explorer, external: true }] : []),
        { label: "API status", href: `${BROWSER_API}/health`, external: true },
        { label: "Agents", href: "/agents" },
      ],
    },
    {
      title: "Build on it",
      links: [
        { label: "Source code", href: REPO, external: true },
        { label: "Architecture", href: `${REPO}/blob/main/docs/ARCHITECTURE.md`, external: true },
        { label: "Deploy your own", href: `${REPO}/blob/main/docs/DEPLOY.md`, external: true },
      ],
    },
  ];
  const item = (l: L) =>
    l.external ? (
      <a href={l.href} target="_blank" rel="noreferrer" className="transition-colors hover:text-label">
        {l.label}
      </a>
    ) : (
      <Link href={l.href} className="transition-colors hover:text-label">
        {l.label}
      </Link>
    );

  return (
    <footer className="relative mt-28 border-t border-separator bg-bg-2/70" style={{ ["--cut" as string]: "var(--bg-2)" }}>
      <div className="mx-auto max-w-[1200px] px-5 pt-16 pb-36 md:pb-14">
        <div className="reveal grid gap-10 border-b border-separator pb-14 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="display max-w-[18ch] text-[2.4rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.4rem]">Every question deserves a price and a page.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/ask" className="inline-flex h-12 items-center rounded-xl bg-tint px-6 text-sub font-semibold text-white transition-[transform,filter] duration-300 ease-glide hover:brightness-110 active:scale-[0.98]">
                Ask your question
              </Link>
              <Link href="/how-it-works" className="inline-flex h-12 items-center rounded-xl border border-separator px-6 text-sub font-semibold transition-colors hover:bg-fill">
                See how it works
              </Link>
            </div>
          </div>
          <OddsRing ppm={620_000} size={132} stroke={9} animate={false} className="hidden opacity-90 md:block" />
        </div>

        {/* desktop: columns */}
        <div className="hidden gap-10 py-12 md:grid md:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="text-footnote font-semibold text-label">{g.title}</p>
              <ul className="mt-4 space-y-2.5 text-sub text-label-2">
                {g.links.map((l) => (
                  <li key={l.label}>{item(l)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* phone: folding sections */}
        <div className="py-6 md:hidden">
          {groups.map((g) => (
            <details key={g.title} className="group border-b border-separator">
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-body font-semibold">
                {g.title}
                <ChevronDown size={18} className="text-label-3 transition-transform duration-300 ease-glide group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="space-y-3 pb-5 text-sub text-label-2">
                {g.links.map((l) => (
                  <li key={l.label}>{item(l)}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Quire home">
              <Wordmark className="text-[2rem]" />
            </Link>
            <p className="flex items-center gap-2 text-footnote text-label-2">
              <span className={`size-1.5 rounded-full ${apiOnline ? "bg-yes" : "bg-no"}`} aria-hidden />
              {apiOnline ? "Running" : "API unreachable"} on {onchain ? `NEAR ${chain.network}` : "a practice ledger"}
            </p>
          </div>
          <ThemeToggle />
        </div>

        <p className="mt-8 max-w-[78ch] text-footnote leading-relaxed text-label-3">
          <span className="font-semibold text-label-2">A hackathon build, on testnet.</span> Quire runs on NEAR {chain.network === "mainnet" ? "mainnet" : "testnet"} with test NEAR that has no cash value, and its contract has not been audited. A price is what traders believe, not an established fact. Encyclopedia pages and verdicts are written by AI models and can be wrong, which is why every verdict can be challenged with a bond before it settles and every page shows the signature of the enclave that wrote it. Quotes from Wikipedia are used under CC BY-SA 4.0.
        </p>
        <p className="mt-4 text-footnote text-label-3">
          © 2026 Quire. Open source under the MIT licence. Built for the NEAR Hackathon.
        </p>
      </div>
    </footer>
  );
}
