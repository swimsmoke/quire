import Link from "next/link";
import { Bot, UserRound } from "lucide-react";
import type { Trade } from "@/lib/types";
import { ago, pct, fmtNear, shortAccount } from "@/lib/format";
import { ModeTag } from "./mode";

export function TradeTape({ trades, showMarket = false, empty = "No trades yet." }: { trades: Trade[]; showMarket?: boolean; empty?: string }) {
  if (!trades.length) return <p className="py-6 text-sub text-label-2">{empty}</p>;
  return (
    <ul className="divide-y hairline">
      {trades.map((t) => (
        <li key={t.id} className="flex gap-3 py-3.5">
          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${t.actorKind === "AGENT" ? "bg-tint/12 text-tint" : "bg-fill text-label-2"}`}>
            {t.actorKind === "AGENT" ? <Bot size={15} aria-label="agent" /> : <UserRound size={15} aria-label="human" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sub">
              <Link href={`/profile/${encodeURIComponent(t.traderAccount)}`} className="font-medium hover:text-tint">
                {t.agentName ?? shortAccount(t.traderAccount)}
              </Link> {t.side === "BUY" ? "bought" : "sold"}{" "}
              <span className={`font-medium ${t.outcome === "YES" ? "text-yes" : "text-no"}`}>{t.outcome === "YES" ? "Yes" : "No"}</span>
              <span className="tabular text-label-2"> for {fmtNear(t.collateral)} NEAR</span>
            </p>
            {showMarket && t.slug && (
              <Link href={`/markets/${t.slug}`} className="mt-0.5 block truncate text-footnote text-label-2 hover:text-tint">
                {t.question}
              </Link>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-label-3">
              <span className="tabular">
                {pct(t.priceBeforePpm)} to {pct(t.priceAfterPpm)}
              </span>
              <span>{ago(t.createdAt)}</span>
              <ModeTag mode={t.executionMode} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
