"use client";

import { PageIn } from "@/components/page-in";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { clientRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dateTime, pct, price, fmtNear } from "@/lib/format";
import { ModeTag } from "@/components/mode";
import { PageTitle, SectionHeader } from "@/components/section";
import { Segmented } from "@/components/ui";
import type { Trade } from "@/lib/types";

interface Portfolio {
  accountId: string;
  balances: { executionMode: string; available: string }[];
  positions: {
    market: { slug: string; question: string; probabilityYesPpm: number; status: string; executionMode: "SIMULATED" | "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET" };
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

const signed = (v: string) => `${BigInt(v) > 0n ? "+" : BigInt(v) < 0n ? "−" : ""}${fmtNear(BigInt(v) < 0n ? (-BigInt(v)).toString() : v)}`;
const tone = (v: string) => (BigInt(v) > 0n ? "text-yes" : BigInt(v) < 0n ? "text-no" : "text-label-2");

export default function PortfolioPage() {
  const { me, token, ready, onchain, balance: sessionBalance } = useSession();
  const accountId = me?.session.accountId;
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"positions" | "trades" | "funding">("positions");

  useEffect(() => {
    if (!accountId) return;
    const path = onchain ? `/portfolio?account=${encodeURIComponent(accountId)}` : "/portfolio";
    clientRequest<Portfolio>(path, { token }).then(setPf, (e) => setError((e as Error).message));
  }, [token, accountId, onchain]);

  if (!ready) return <PageTitle title="Portfolio" />;
  if (!me) return <PageTitle title="Portfolio" subtitle={onchain ? "Connect your wallet to see your positions and trades." : "Sign in to see your positions, trades and funding history."} />;
  if (error) return <PageTitle title="Portfolio" subtitle={<span className="text-no">{error}</span>} />;
  if (!pf) return <PageTitle title="Portfolio" subtitle="Loading…" />;

  const open = pf.positions.filter((p) => BigInt(p.yesShares) > 0n || BigInt(p.noShares) > 0n);
  const balance = onchain ? sessionBalance : (pf.balances.find((b) => b.executionMode === "SIMULATED")?.available ?? "0");
  const total = (BigInt(balance) + BigInt(pf.totals.markValue)).toString();

  return (
    <PageIn>
    <>
      <PageTitle title="Portfolio" subtitle={pf.accountId}>
        <p className="tabular mt-8 text-[3rem] leading-none font-semibold tracking-[-0.035em] md:text-[4rem]">
          {fmtNear(total)} <span className="text-title2 font-medium text-label-2">NEAR</span>
        </p>
        <p className="mt-2 text-sub text-label-2">
          Total value at current prices. <span className={`tabular font-medium ${tone(pf.totals.unrealizedPnl)}`}>{signed(pf.totals.unrealizedPnl)} NEAR</span> unrealised.
        </p>
      </PageTitle>

      <dl className="tabular grid grid-cols-2 gap-x-8 border-t hairline md:grid-cols-4">
        {[
          ["Available", `${fmtNear(balance)} NEAR`],
          ["Positions at current price", `${fmtNear(pf.totals.markValue)} NEAR`],
          ["If everything were sold now", `${fmtNear(pf.totals.liquidationValue)} NEAR`],
          ["Cost of positions", `${fmtNear(pf.totals.costBasis)} NEAR`],
        ].map(([k, v]) => (
          <div key={k} className="border-b hairline py-4">
            <dt className="text-footnote text-label-2">{k}</dt>
            <dd className="mt-0.5 text-body font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 max-w-[70ch] text-footnote text-label-3">
        &ldquo;At current price&rdquo; multiplies shares by the probability. &ldquo;If everything were sold now&rdquo; is what selling into the pools would actually pay after price impact and fees.
      </p>

      <div className="mt-10 max-w-md">
        <Segmented
          label="Portfolio view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "positions", label: `Positions ${open.length || ""}` },
            { value: "trades", label: "Trades" },
            { value: "funding", label: "Funding" },
          ]}
        />
      </div>

      <div className="mt-6" key={tab}>
        <div className="anim-fade">
          {tab === "positions" &&
            (open.length ? (
              <ul className="divide-y hairline border-y hairline">
                {open.map((p) => (
                  <li key={p.market.slug}>
                    <Link href={`/markets/${p.market.slug}`} className="group flex items-center gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-medium group-hover:text-tint">{p.market.question}</p>
                        <p className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-label-2">
                          {BigInt(p.yesShares) > 0n && <span className="text-yes">{fmtNear(p.yesShares)} Yes</span>}
                          {BigInt(p.noShares) > 0n && <span className="text-no">{fmtNear(p.noShares)} No</span>}
                          <span>Yes now {pct(p.market.probabilityYesPpm)}</span>
                          <span>cost {fmtNear(p.costBasis)}</span>
                          <ModeTag mode={p.market.executionMode} />
                        </p>
                      </div>
                      <div className="tabular text-right">
                        <p className="text-body font-semibold">{fmtNear(p.markValue)}</p>
                        <p className={`text-footnote font-medium ${tone(p.unrealizedPnl)}`}>{signed(p.unrealizedPnl)}</p>
                      </div>
                      <ChevronRight size={17} className="text-label-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sub text-label-2">
                No open positions.{" "}
                <Link href="/markets" className="text-tint hover:underline">
                  Find a claim to trade
                </Link>
                .
              </p>
            ))}

          {tab === "trades" &&
            (pf.trades.length ? (
              <ul className="divide-y hairline border-y hairline">
                {pf.trades.map((t) => (
                  <li key={t.id} className="flex gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sub">
                        {t.side === "BUY" ? "Bought" : "Sold"} <span className="tabular">{fmtNear(t.shares)}</span>{" "}
                        <span className={`font-medium ${t.outcome === "YES" ? "text-yes" : "text-no"}`}>{t.outcome === "YES" ? "Yes" : "No"}</span> at{" "}
                        <span className="tabular">{price(t.avgPricePpm)}</span>
                      </p>
                      <Link href={`/markets/${t.slug}`} className="mt-0.5 block truncate text-footnote text-label-2 hover:text-tint">
                        {t.question}
                      </Link>
                      <p className="mt-1 flex items-center gap-2 text-footnote text-label-3">
                        {dateTime(t.createdAt)} <ModeTag mode={t.executionMode} />
                      </p>
                    </div>
                    <p className={`tabular text-body font-medium ${t.side === "BUY" ? "" : "text-yes"}`}>
                      {t.side === "BUY" ? "−" : "+"}
                      {fmtNear(t.collateral)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sub text-label-2">No trades yet.</p>
            ))}

          {tab === "funding" &&
            (pf.funding.length ? (
              <ul className="divide-y hairline border-y hairline">
                {pf.funding.map((f) => (
                  <li key={f.id} className="flex justify-between gap-4 py-4 text-sub">
                    <span>{f.originAsset}</span>
                    <span className="capitalize">{f.status.toLowerCase()}</span>
                    <span className="text-label-2">{dateTime(f.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <SectionHeader title="No deposits yet" />
                <p className="max-w-[62ch] text-sub text-label-2">Cross-chain deposits through NEAR Intents will be listed here with their status: pending, processing, completed, failed, expired or refunded.</p>
              </>
            ))}
        </div>
      </div>
    </>
    </PageIn>
  );
}
