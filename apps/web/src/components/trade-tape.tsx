import Link from "next/link";
import { Bot, UserRound } from "lucide-react";
import type { Trade } from "@/lib/types";
import { ago, pct, qusd, shortAccount } from "@/lib/format";
import { ModeTag } from "./mode";

export function TradeTape({ trades, showMarket = false, empty = "No trades yet." }: { trades: Trade[]; showMarket?: boolean; empty?: string }) {
  if (!trades.length) return <p className="py-4 text-sm text-fade">{empty}</p>;
  return (
    <ul className="divide-y divide-rule text-sm">
      {trades.map((t) => (
        <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
          <span className="flex items-center gap-1.5">
            {t.actorKind === "AGENT" ? <Bot size={13} aria-label="agent" /> : <UserRound size={13} aria-label="human" />}
            <span>{t.agentName ?? shortAccount(t.traderAccount)}</span>
          </span>
          <span>
            {t.side === "BUY" ? "bought" : "sold"} <span className={t.outcome === "YES" ? "text-ledger" : "text-umber"}>{t.outcome}</span>{" "}
            <span className="tabular">for {qusd(t.collateral)} qUSD</span>
          </span>
          {showMarket && t.slug && (
            <Link href={`/markets/${t.slug}`} className="min-w-0 basis-full truncate text-fade underline decoration-rule hover:text-ink">
              {t.question}
            </Link>
          )}
          <span className="tabular ml-auto text-fade">
            {pct(t.priceBeforePpm)} → {pct(t.priceAfterPpm)}
          </span>
          <span className="text-xs text-fade">{ago(t.createdAt)}</span>
          {t.executionMode === "SIMULATED" && <ModeTag mode="SIMULATED" />}
        </li>
      ))}
    </ul>
  );
}
