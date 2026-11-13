"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { ApiError, clientRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { FundingQuote, IntentsToken } from "@/lib/types";

const CHAIN: Record<string, string> = { eth: "Ethereum", base: "Base", arb: "Arbitrum", op: "Optimism", sol: "Solana", btc: "Bitcoin", bsc: "BNB Chain", tron: "Tron", pol: "Polygon", avax: "Avalanche", zec: "Zcash" };
const field = "w-full rounded-xl border hairline bg-bg-2/70 px-3.5 py-2.5 text-body outline-none transition-[box-shadow,border-color] focus:border-tint focus:ring-4 focus:ring-tint/15";

export function FundPanel() {
  const { chain } = useSession();
  const [tokens, setTokens] = useState<IntentsToken[] | null>(null);
  const [nearPrice, setNearPrice] = useState(0);
  const [available, setAvailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("USDC");
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState("10");
  const [quote, setQuote] = useState<FundingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    clientRequest<{ tokens: IntentsToken[]; nearPrice: number; liveQuotes: boolean; available: boolean }>("/intents/tokens").then(
      (r) => {
        setTokens(r.tokens);
        setNearPrice(r.nearPrice);
        setAvailable(r.available);
      },
      (e) => setLoadError(e instanceof ApiError ? e.message : "Couldn't reach Quire."),
    );
  }, []);

  const symbols = useMemo(() => [...new Set((tokens ?? []).map((t) => t.symbol))], [tokens]);
  const chains = useMemo(() => (tokens ?? []).filter((t) => t.symbol === symbol), [tokens, symbol]);
  useEffect(() => {
    if (chains.length && !chains.some((c) => c.assetId === assetId)) setAssetId((chains.find((c) => c.blockchain === "base") ?? chains[0]!).assetId);
  }, [chains, assetId]);

  useEffect(() => {
    if (!assetId || !/^\d{1,12}(\.\d{1,8})?$/.test(amount) || Number(amount) <= 0) {
      setQuote(null);
      return;
    }
    const n = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const r = await clientRequest<{ quote: FundingQuote }>(`/intents/quote?asset=${encodeURIComponent(assetId)}&amount=${amount}`);
        if (n === seq.current) {
          setQuote(r.quote);
          setQError(null);
        }
      } catch (e) {
        if (n === seq.current) setQError(e instanceof ApiError ? e.message : "Couldn't get a quote.");
      } finally {
        if (n === seq.current) setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [assetId, amount]);

  const token = chains.find((c) => c.assetId === assetId);

  return (
    <div className="mx-auto max-w-[560px] pt-12 md:pt-20">
      <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] md:text-[2.75rem]">Fund from another chain</h1>
      <p className="mt-3 text-body text-label-2">
        Hold USDC on Base, ETH, SOL or BTC instead of NEAR? NEAR Intents swaps it to NEAR for you: you send to a one-time address on your chain, and solvers deliver NEAR to your wallet, usually within a minute.
      </p>

      {!available && (
        <p className="mt-6 rounded-xl border border-sim/30 bg-sim/10 px-4 py-3 text-sub text-label">
          Prices and quotes come live from NEAR Intents on mainnet. Quire is on NEAR {chain.network}, and NEAR Intents only runs on mainnet, so sending is switched off here. Nothing on this page can move funds.
        </p>
      )}

      {loadError && <p className="mt-6 text-sub text-no">NEAR Intents isn&apos;t reachable right now: {loadError}</p>}
      {!tokens && !loadError && <p className="mt-8 text-sub text-label-2">Loading assets from NEAR Intents…</p>}

      {tokens && (
        <div className="glass mt-8 rounded-2xl p-5 sm:p-6">
          <p className="text-footnote font-medium text-label-2">You send</p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-3">
            <label className="sr-only" htmlFor="fund-amt">
              Amount
            </label>
            <input id="fund-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} className={`${field} tabular text-title3 font-semibold`} />
            <label className="sr-only" htmlFor="fund-sym">
              Asset
            </label>
            <select id="fund-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={`${field} w-auto font-semibold`}>
              {symbols.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="From chain">
            {chains.map((c) => (
              <button
                key={c.assetId}
                role="radio"
                aria-checked={c.assetId === assetId}
                onClick={() => setAssetId(c.assetId)}
                className={`h-8 rounded-full px-3.5 text-footnote font-medium transition-colors ${c.assetId === assetId ? "bg-label text-bg" : "border hairline text-label-2 hover:text-label"}`}
              >
                {CHAIN[c.blockchain] ?? c.blockchain}
              </button>
            ))}
          </div>
          {token && <p className="tabular mt-2 text-footnote text-label-3">≈ ${(Number(amount || 0) * token.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>}

          <div className="my-4 flex justify-center text-label-3" aria-hidden>
            <ArrowDown size={18} />
          </div>

          <p className="text-footnote font-medium text-label-2">You receive in your NEAR wallet</p>
          <p className={`tabular mt-2 text-[2rem] leading-none font-semibold tracking-[-0.03em] transition-opacity ${quoting ? "opacity-50" : ""}`}>
            {quote ? quote.amountOutNear : "–"} <span className="text-title3 font-medium text-label-2">NEAR</span>
          </p>
          {quote && (
            <dl className="tabular mt-4 space-y-1.5 text-footnote">
              {quote.minAmountOutNear && (
                <div className="flex justify-between">
                  <dt className="text-label-2">Guaranteed at least</dt>
                  <dd>{quote.minAmountOutNear} NEAR</dd>
                </div>
              )}
              {quote.timeEstimateS !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-label-2">Estimated time</dt>
                  <dd>about {Math.max(1, Math.round(quote.timeEstimateS / 60))} min</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-label-2">NEAR price</dt>
                <dd>${nearPrice.toFixed(3)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-label-2">Source</dt>
                <dd className="text-right">{quote.source === "ONECLICK_QUOTE" ? "Live 1Click quote from NEAR Intents solvers" : "Estimate from 1Click token prices"}</dd>
              </div>
            </dl>
          )}
          {quote?.note && <p className="mt-3 text-footnote text-label-3">{quote.note}</p>}
          {qError && <p className="mt-3 text-footnote text-no">{qError}</p>}

          <button disabled className="mt-6 h-11 w-full rounded-full bg-fill-2 text-sub font-semibold text-label-3">
            {available ? "Get deposit address" : `Sending opens with Quire on mainnet`}
          </button>
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-title3 font-semibold">How it will work</h2>
        <ol className="mt-4 space-y-4 text-sub text-label-2">
          {[
            "Pick the asset and chain you hold, and the amount.",
            "Quire asks NEAR Intents for a quote and a one-time deposit address on that chain.",
            "You send from your usual wallet. Solvers compete to fill the swap, and NEAR lands in your NEAR wallet. If it can't be filled, your funds go back to you automatically.",
            "Deposit that NEAR into Quire as usual, and trade.",
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-fill-2 text-footnote font-semibold text-label">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sub text-label-2">
          Already have NEAR?{" "}
          <Link href="/me" className="text-tint hover:underline">
            Deposit it from your profile
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
