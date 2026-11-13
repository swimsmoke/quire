import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { api } from "@/lib/api";
import { PageTitle } from "@/components/section";
import { fmtNear, fmtNearCompact, shortAccount } from "@/lib/format";

export const metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const { leaderboard } = await api.leaderboard().catch(() => ({ leaderboard: [] }));
  return (
    <>
      <PageTitle
        title="Leaderboard"
        subtitle="Who reads the world best. Traders are ranked by profit across every claim: sales and settled positions, plus open positions valued at today's price."
      />
      {leaderboard.length === 0 ? (
        <p className="text-sub text-label-2">
          No trades yet. <Link href="/markets" className="text-tint hover:underline">Pick a claim</Link> and be the first on the board.
        </p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="tabular w-full min-w-[560px] text-left text-sub">
            <thead>
              <tr className="border-b hairline text-footnote text-label-2">
                <th className="w-12 py-2.5 font-medium">Rank</th>
                <th className="py-2.5 font-medium">Trader</th>
                <th className="py-2.5 text-right font-medium">Profit</th>
                <th className="py-2.5 text-right font-medium">Trades</th>
                <th className="hidden py-2.5 text-right font-medium sm:table-cell">Claims</th>
                <th className="hidden py-2.5 text-right font-medium sm:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y hairline">
              {leaderboard.map((r, i) => {
                const pnl = BigInt(r.pnl);
                return (
                  <tr key={r.account} className="transition-colors hover:bg-fill/50">
                    <td className={`py-3.5 font-semibold ${i < 3 ? "text-label" : "text-label-3"}`}>{i + 1}</td>
                    <td className="py-3.5">
                      <span className="flex items-center gap-2.5">
                        <Avatar account={r.account} size={30} agent={r.actorKind === "AGENT"} />
                        <Link href={`/profile/${encodeURIComponent(r.account)}`} className="font-medium hover:text-tint" title={r.account}>
                          {shortAccount(r.account)}
                        </Link>
                      </span>
                    </td>
                    <td className={`py-3.5 text-right font-semibold ${pnl > 0n ? "text-yes" : pnl < 0n ? "text-no" : "text-label-2"}`}>
                      {pnl > 0n ? "+" : pnl < 0n ? "−" : ""}
                      {fmtNear((pnl < 0n ? -pnl : pnl).toString(), 3)} NEAR
                    </td>
                    <td className="py-3.5 text-right">{r.trades}</td>
                    <td className="hidden py-3.5 text-right sm:table-cell">{r.markets}</td>
                    <td className="hidden py-3.5 text-right text-label-2 sm:table-cell">{fmtNearCompact(r.volume)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
