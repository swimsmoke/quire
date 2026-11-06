import Link from "next/link";
import { Bot, UserRound } from "lucide-react";
import type { Market } from "@/lib/types";
import { pct, qusdCompact } from "@/lib/format";
import { ModeTag } from "./mode";

/** YES/NO split as a thin two-tone rule. */
export function SplitBar({ ppm, className = "" }: { ppm: number; className?: string }) {
  return (
    <div className={`flex h-1.5 w-full ${className}`} aria-hidden>
      <div className="bg-ledger" style={{ width: `${ppm / 10_000}%` }} />
      <div className="bg-umber/70" style={{ width: `${100 - ppm / 10_000}%` }} />
    </div>
  );
}

export function MarketTable({ markets, compact = false }: { markets: Market[]; compact?: boolean }) {
  if (!markets.length) return <p className="py-8 text-fade">No markets match. Clear the search or pick another category.</p>;
  const cols = compact ? "md:grid-cols-[1fr_6rem_6rem]" : "md:grid-cols-[1fr_7rem_6rem_6rem_6rem]";
  return (
    <div className="border-t border-ink">
      <div className={`hidden gap-4 border-b border-rule py-2 text-xs text-fade md:grid ${cols}`}>
        <span>Claim</span>
        <span className="text-right">Yes</span>
        <span className="text-right">24h volume</span>
        {!compact && <span className="text-right">Liquidity</span>}
        {!compact && <span className="text-right">Traders</span>}
      </div>
      <ul>
        {markets.map((m) => (
          <li key={m.id} className="border-b border-rule">
            <Link href={`/markets/${m.slug}`} className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 py-4 hover:bg-sheet/60 md:items-center ${cols}`}>
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{m.question}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fade">
                  <span>{m.category}</span>
                  {m.executionMode === "SIMULATED" && <ModeTag mode="SIMULATED" />}
                  {m.status !== "ACTIVE" && <span className="text-umber">{m.status.toLowerCase().replace(/_/g, " ")}</span>}
                </span>
              </span>
              <span className="text-right">
                <span className="tabular text-lg font-semibold">{pct(m.probabilityYesPpm)}</span>
                {!compact && <SplitBar ppm={m.probabilityYesPpm} className="mt-1" />}
              </span>
              <span className="tabular col-span-2 flex justify-between text-sm text-fade md:col-span-1 md:block md:text-right md:text-ink">
                <span className="md:hidden">24h volume</span>
                {qusdCompact(m.volume24h)}
              </span>
              {!compact && (
              <span className="tabular col-span-2 flex justify-between text-sm text-fade md:col-span-1 md:block md:text-right md:text-ink">
                <span className="md:hidden">Liquidity</span>
                {qusdCompact(m.liquidity)}
              </span>
              )}
              {!compact && (
              <span className="col-span-2 flex items-center justify-between gap-3 text-sm md:col-span-1 md:justify-end">
                <span className="md:hidden text-fade">Traders</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1" title="Human traders">
                    <UserRound size={13} aria-label="humans" /> {m.humanTraders}
                  </span>
                  <span className="flex items-center gap-1" title="AI agent traders">
                    <Bot size={13} aria-label="agents" /> {m.agentTraders}
                  </span>
                </span>
              </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
