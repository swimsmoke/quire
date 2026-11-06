"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clientRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dateTime, pct, price, qusd } from "@/lib/format";
import { ModeTag } from "@/components/mode";
import type { Trade } from "@/lib/types";

interface Portfolio {
  accountId: string;
  balances: { executionMode: string; available: string }[];
  positions: {
    market: { slug: string; question: string; probabilityYesPpm: number; status: string; executionMode: "SIMULATED" | "ONCHAIN_TESTNET" };
    yesShares: string;
    noShares: string;
    costBasis: string;
    markValue: string;
    liquidationValue: string;
    unrealizedPnl: string;
    realizedPnl: string;
  }[];
  totals: { costBasis: string; markValue: string; liquidationValue: string; unrealizedPnl: string };
  trades: (Trade & { slug: string; question: string })[];
  funding: { id: string; originAsset: string; amountIn: string; status: string; createdAt: string }[];
}

const signed = (v: string) => {
  const n = BigInt(v);
  return `${n > 0n ? "+" : ""}${qusd(v)}`;
};

export default function PortfolioPage() {
  const { me, token, ready } = useSession();
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    clientRequest<Portfolio>("/portfolio", { token }).then(setPf, (e) => setError((e as Error).message));
  }, [token]);

  if (!ready) return <p className="py-10 text-fade">Loading…</p>;
  if (!me)
    return (
      <div className="py-10">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <p className="mt-3 text-fade">Sign in to see your positions, trades and funding history.</p>
      </div>
    );
  if (error) return <p className="py-10 text-umber">{error}</p>;
  if (!pf) return <p className="py-10 text-fade">Loading…</p>;

  const open = pf.positions.filter((p) => BigInt(p.yesShares) > 0n || BigInt(p.noShares) > 0n);
  const balance = pf.balances.find((b) => b.executionMode === "SIMULATED")?.available ?? "0";

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-1 text-fade">{pf.accountId}</p>

      <dl className="tabular mt-8 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
        {[
          ["Available", `${qusd(balance)} qUSD`],
          ["Positions at mark", `${qusd(pf.totals.markValue)} qUSD`],
          ["If all sold now", `${qusd(pf.totals.liquidationValue)} qUSD`],
          ["Unrealised", `${signed(pf.totals.unrealizedPnl)} qUSD`],
        ].map(([k, v]) => (
          <div key={k} className="bg-vellum p-4">
            <dt className="text-xs text-fade">{k}</dt>
            <dd className="mt-1 text-lg">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-fade">Mark value uses the current probability. &ldquo;If all sold now&rdquo; is what selling into the pools would actually pay, after price impact and fees.</p>

      <section className="mt-12">
        <h2 className="mb-3 text-xl font-semibold">Open positions</h2>
        {open.length ? (
          <div className="overflow-x-auto border-t border-ink">
            <table className="tabular w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-fade">
                <tr className="border-b border-rule">
                  <th className="py-2 font-normal">Claim</th>
                  <th className="py-2 text-right font-normal">Yes / No shares</th>
                  <th className="py-2 text-right font-normal">Cost</th>
                  <th className="py-2 text-right font-normal">Mark</th>
                  <th className="py-2 text-right font-normal">If sold</th>
                  <th className="py-2 text-right font-normal">Unrealised</th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => (
                  <tr key={p.market.slug} className="border-b border-rule align-top">
                    <td className="py-3 pr-4">
                      <Link href={`/markets/${p.market.slug}`} className="hover:underline">
                        {p.market.question}
                      </Link>
                      <span className="mt-1 flex items-center gap-2 text-xs text-fade">
                        Yes now {pct(p.market.probabilityYesPpm)} <ModeTag mode={p.market.executionMode} />
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-ledger">{qusd(p.yesShares)}</span> / <span className="text-umber">{qusd(p.noShares)}</span>
                    </td>
                    <td className="py-3 text-right">{qusd(p.costBasis)}</td>
                    <td className="py-3 text-right">{qusd(p.markValue)}</td>
                    <td className="py-3 text-right">{qusd(p.liquidationValue)}</td>
                    <td className={`py-3 text-right ${BigInt(p.unrealizedPnl) < 0n ? "text-umber" : "text-ledger"}`}>{signed(p.unrealizedPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-fade">
            No open positions. <Link href="/markets" className="text-ledger underline decoration-rule">Find a claim to trade</Link>.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-xl font-semibold">Trade history</h2>
        {pf.trades.length ? (
          <ul className="divide-y divide-rule border-t border-ink text-sm">
            {pf.trades.map((t) => (
              <li key={t.id} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr_auto] sm:gap-4">
                <span className="text-fade">{dateTime(t.createdAt)}</span>
                <span>
                  {t.side === "BUY" ? "Bought" : "Sold"} {qusd(t.shares)} <span className={t.outcome === "YES" ? "text-ledger" : "text-umber"}>{t.outcome}</span> at {price(t.avgPricePpm)} on{" "}
                  <Link href={`/markets/${t.slug}`} className="underline decoration-rule">
                    {t.question}
                  </Link>
                </span>
                <span className="tabular flex items-center gap-2 sm:justify-end">
                  {t.side === "BUY" ? "-" : "+"}
                  {qusd(t.collateral)} <ModeTag mode={t.executionMode} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fade">No trades yet.</p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-xl font-semibold">Funding history</h2>
        {pf.funding.length ? (
          <ul className="divide-y divide-rule border-t border-ink text-sm">
            {pf.funding.map((f) => (
              <li key={f.id} className="flex justify-between py-3">
                <span>{f.originAsset}</span>
                <span>{f.status.toLowerCase()}</span>
                <span className="text-fade">{dateTime(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fade">No cross-chain deposits yet.</p>
        )}
      </section>
    </div>
  );
}
