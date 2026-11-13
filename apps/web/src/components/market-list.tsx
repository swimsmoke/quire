import Link from "next/link";
import { Bot, ChevronRight, UserRound } from "lucide-react";
import type { Market } from "@/lib/types";
import { pct, fmtNearCompact } from "@/lib/format";
import { category } from "@/lib/format";
import { ModeTag } from "./mode";

/** 24h change as a Stocks-style pill. */
export function ChangePill({ ppm }: { ppm: number }) {
  const tone = ppm > 0 ? "bg-yes text-on-accent" : ppm < 0 ? "bg-no text-on-accent" : "bg-fill text-label-2";
  return (
    <span className={`tabular inline-flex h-7 min-w-[4.5rem] items-center justify-end rounded-md px-2 text-footnote font-semibold ${tone}`}>
      {ppm === 0 ? "0.0" : `${ppm > 0 ? "+" : "−"}${(Math.abs(ppm) / 10_000).toFixed(1)}`}
    </span>
  );
}

/** Plain list rows separated by hairlines; no cards. */
export function MarketList({ markets, compact = false }: { markets: Market[]; compact?: boolean }) {
  if (!markets.length) return <p className="py-10 text-sub text-label-2">No claims here yet.</p>;
  return (
    <ul className="divide-y hairline border-y hairline">
      {markets.map((m) => (
        <li key={m.id}>
          <Link href={`/markets/${m.slug}`} className="group flex items-center gap-4 py-4 transition-colors duration-200 hover:bg-fill/40 sm:-mx-3 sm:rounded-lg sm:px-3">
            <span className="min-w-0 flex-1">
              <span className="block text-body leading-snug font-medium">{m.question}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-label-2">
                <span>{category(m.category)}</span>
                <span className="tabular">{fmtNearCompact(m.volume24h)} NEAR 24h volume</span>
                {!compact && <span className="tabular">{fmtNearCompact(m.liquidity)} NEAR liquidity</span>}
                {!compact && (
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5" title="Human traders">
                      <UserRound size={12} aria-label="humans" />
                      {m.humanTraders}
                    </span>
                    <span className="flex items-center gap-0.5" title="AI agent traders">
                      <Bot size={12} aria-label="agents" />
                      {m.agentTraders}
                    </span>
                  </span>
                )}
                {!compact && <ModeTag mode={m.executionMode} />}
                {m.status !== "ACTIVE" && <span className="text-no">{m.status.toLowerCase().replace(/_/g, " ")}</span>}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="tabular text-title3 font-semibold tracking-[-0.02em]">{pct(m.probabilityYesPpm)}</span>
              <ChangePill ppm={m.change24hPpm} />
            </span>
            <ChevronRight size={18} className="hidden text-label-3 transition-transform duration-200 group-hover:translate-x-0.5 sm:block" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
