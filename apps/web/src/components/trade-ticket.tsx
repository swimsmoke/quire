"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clientRequest, humanError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { pct, price, qusd } from "@/lib/format";
import type { Market, Quote } from "@/lib/types";
import { formatUnits } from "@quire/shared";

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";
type Stage = "edit" | "review" | "submitting" | "done";

interface Holding {
  yesShares: string;
  noShares: string;
  costBasis: string;
  markValue: string;
  liquidationValue: string;
}

const AMOUNT_RE = /^\d{0,12}(\.\d{0,6})?$/;
const SLIPPAGES = [50, 100, 300];

export function TradeTicket({ market }: { market: Market }) {
  const router = useRouter();
  const { me, token, balance, refresh, claimTestFunds } = useSession();
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [side, setSide] = useState<Side>("BUY");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("edit");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [fundMsg, setFundMsg] = useState<string | null>(null);
  const orderId = useRef<string | null>(null);

  const simulated = market.executionMode === "SIMULATED";
  const held = holding ? (outcome === "YES" ? holding.yesShares : holding.noShares) : "0";

  const loadHolding = useCallback(async () => {
    if (!token) return setHolding(null);
    const pf = await clientRequest<{ positions: (Holding & { market: { slug: string } })[] }>("/portfolio", { token }).catch(() => null);
    setHolding(pf?.positions.find((p) => p.market.slug === market.slug) ?? null);
  }, [token, market.slug]);

  useEffect(() => {
    loadHolding();
  }, [loadHolding]);

  // live quote, debounced
  useEffect(() => {
    if (stage !== "edit") return;
    setQuoteError(null);
    if (!amount || Number(amount) === 0 || !AMOUNT_RE.test(amount)) {
      setQuote(null);
      return;
    }
    const ctl = setTimeout(async () => {
      try {
        const r = await clientRequest<{ quote: Quote }>(`/markets/${market.slug}/quote`, { method: "POST", body: { side, outcome, amount, slippageBps } });
        setQuote(r.quote);
      } catch (e) {
        setQuote(null);
        setQuoteError(e instanceof ApiError ? (e.code.startsWith("FPMM_") ? "That size can't be filled by the pool. Try a smaller amount." : e.message) : "Couldn't get a quote.");
      }
    }, 250);
    return () => clearTimeout(ctl);
  }, [amount, side, outcome, slippageBps, market.slug, stage]);

  function review() {
    setError(null);
    if (!quote) return;
    if (side === "BUY" && BigInt(quote.amountIn) > BigInt(balance)) {
      setError(humanError("INSUFFICIENT_BALANCE")!);
      return;
    }
    if (side === "SELL" && BigInt(quote.amountIn) > BigInt(held)) {
      setError(humanError("INSUFFICIENT_SHARES")!);
      return;
    }
    // One id per reviewed order: retries after a network failure reuse it, so the server executes at most once.
    orderId.current = crypto.randomUUID().replace(/-/g, "");
    setStage("review");
  }

  async function confirm() {
    if (!quote || !orderId.current) return;
    setStage("submitting");
    setError(null);
    try {
      const r = await clientRequest<{ trade: { shares: string; collateral: string; avgPricePpm: number }; market: { probabilityYesPpm: number } }>(`/markets/${market.slug}/trades`, {
        method: "POST",
        token,
        body: { side, outcome, amount, minOut: quote.minAmountOut, clientOrderId: orderId.current },
      });
      setResult(
        side === "BUY"
          ? `Bought ${qusd(r.trade.shares)} ${outcome} shares for ${qusd(r.trade.collateral)} qUSD (avg ${price(r.trade.avgPricePpm)}). Yes is now ${pct(r.market.probabilityYesPpm)}.`
          : `Sold ${qusd(r.trade.shares)} ${outcome} shares for ${qusd(r.trade.collateral)} qUSD (avg ${price(r.trade.avgPricePpm)}). Yes is now ${pct(r.market.probabilityYesPpm)}.`,
      );
      setStage("done");
      setAmount("");
      setQuote(null);
      orderId.current = null;
      await Promise.all([refresh(), loadHolding()]);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_ORDER") {
        setResult("This order already executed. Your position and history show it.");
        setStage("done");
        orderId.current = null;
        await Promise.all([refresh(), loadHolding()]);
        router.refresh();
        return;
      }
      if (e instanceof ApiError) {
        setError(humanError(e.code) ?? e.message);
        setStage("edit");
        orderId.current = null; // rejected: the next attempt is a new order
      } else {
        // Unknown outcome (network). Keep the same order id so "Try again" cannot double-execute.
        setError("Connection lost before we heard back. Try again: the same order is resent and can only execute once.");
        setStage("review");
      }
    }
  }

  const tab = (active: boolean) => `flex-1 py-2 text-sm ${active ? "bg-ink text-sheet" : "text-fade hover:text-ink"}`;

  return (
    <section aria-labelledby="ticket-h" className="border border-ink bg-sheet">
      <h2 id="ticket-h" className="sr-only">
        Trade this claim
      </h2>
      <div className="grid grid-cols-2 border-b border-ink">
        {(["YES", "NO"] as const).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOutcome(o);
              setStage("edit");
            }}
            aria-pressed={outcome === o}
            className={`px-3 py-3 text-left ${outcome === o ? (o === "YES" ? "bg-ledger text-sheet" : "bg-umber text-sheet") : "hover:bg-vellum"}`}
          >
            <span className="block text-sm">{o === "YES" ? "Yes" : "No"}</span>
            <span className="tabular text-xl font-semibold">{price(o === "YES" ? market.probabilityYesPpm : market.probabilityNoPpm)}</span>
            <span className="block text-xs opacity-80">qUSD per share</span>
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4">
        <div className="flex border border-rule" role="group" aria-label="Buy or sell">
          <button className={tab(side === "BUY")} aria-pressed={side === "BUY"} onClick={() => { setSide("BUY"); setStage("edit"); }}>
            Buy
          </button>
          <button className={tab(side === "SELL")} aria-pressed={side === "SELL"} onClick={() => { setSide("SELL"); setStage("edit"); }}>
            Sell
          </button>
        </div>

        <label className="block">
          <span className="mb-1 flex justify-between text-sm">
            <span>{side === "BUY" ? "Amount to spend" : "Shares to sell"}</span>
            {me && (
              <button
                type="button"
                className="text-ledger underline decoration-rule"
                onClick={() => setAmount(formatUnits(BigInt(side === "BUY" ? balance : held)))}
              >
                {side === "BUY" ? `Balance ${qusd(balance)}` : `Held ${qusd(held)}`}
              </button>
            )}
          </span>
          <span className="flex items-center border border-rule bg-vellum focus-within:border-ledger">
            <input
              inputMode="decimal"
              value={amount}
              disabled={stage === "review" || stage === "submitting"}
              onChange={(e) => {
                if (AMOUNT_RE.test(e.target.value)) {
                  setAmount(e.target.value);
                  setStage("edit");
                }
              }}
              className="tabular w-full bg-transparent px-3 py-2 text-lg outline-none"
              placeholder="0"
              aria-describedby="amount-unit"
            />
            <span id="amount-unit" className="pr-3 text-sm text-fade">
              {side === "BUY" ? "qUSD" : "shares"}
            </span>
          </span>
        </label>

        <fieldset className="flex items-center gap-2 text-sm">
          <legend className="sr-only">Slippage tolerance</legend>
          <span className="text-fade">Max slippage</span>
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlippageBps(s)}
              aria-pressed={slippageBps === s}
              disabled={stage !== "edit" && stage !== "done"}
              className={`border px-2 py-0.5 ${slippageBps === s ? "border-ink" : "border-rule text-fade"}`}
            >
              {s / 100}%
            </button>
          ))}
        </fieldset>

        {quote && (
          <dl className="tabular space-y-1 border-t border-rule pt-3 text-sm">
            <Row k={side === "BUY" ? "You receive" : "You receive"} v={side === "BUY" ? `${qusd(quote.amountOut)} ${outcome} shares` : `${qusd(quote.amountOut)} qUSD`} strong />
            <Row k="Average price" v={`${price(quote.avgPricePpm)} qUSD/share`} />
            <Row k="Fee" v={`${qusd(quote.fee)} qUSD (${market.feeBps / 100}%)`} />
            <Row k={`${outcome === "YES" ? "Yes" : "No"} probability`} v={`${pct(quote.priceBeforePpm)} → ${pct(quote.priceAfterPpm)}`} />
            <Row k="Price impact" v={pct(quote.priceImpactPpm, 2)} />
            <Row k="Minimum received" v={side === "BUY" ? `${qusd(quote.minAmountOut)} shares` : `${qusd(quote.minAmountOut)} qUSD`} />
          </dl>
        )}
        {quoteError && <p className="text-sm text-umber">{quoteError}</p>}
        {error && <p role="alert" className="text-sm text-umber">{error}</p>}

        {!simulated ? (
          <p className="text-sm text-fade">This market settles on NEAR. Wallet-signed trading arrives with NEAR wallet sign-in.</p>
        ) : !me ? (
          <p className="text-sm text-fade">Sign in to trade.</p>
        ) : stage === "review" || stage === "submitting" ? (
          <div className="space-y-2">
            <p className="text-sm">
              Confirm: {side === "BUY" ? "buy" : "sell"} {outcome} with {side === "BUY" ? `${amount} qUSD` : `${amount} shares`}. The trade fails instead of filling below the minimum.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStage("edit")} disabled={stage === "submitting"} className="flex-1 border border-rule py-2 text-sm hover:border-ink">
                Edit
              </button>
              <button onClick={confirm} disabled={stage === "submitting"} className="flex-1 bg-ledger py-2 text-sm text-sheet hover:bg-ledger-deep disabled:opacity-60">
                {stage === "submitting" ? "Placing trade…" : `Confirm ${side === "BUY" ? "buy" : "sell"}`}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={review} disabled={!quote} className="w-full bg-ledger py-2.5 text-sm text-sheet hover:bg-ledger-deep disabled:cursor-not-allowed disabled:opacity-50">
            Review {side === "BUY" ? "buy" : "sell"}
          </button>
        )}

        {stage === "done" && result && (
          <p role="status" className="border-l-2 border-ledger pl-3 text-sm">
            {result}
          </p>
        )}
      </div>

      {me && (
        <div className="space-y-3 border-t border-ink p-4 text-sm">
          <h3 className="font-medium">Your position</h3>
          {holding && (BigInt(holding.yesShares) > 0n || BigInt(holding.noShares) > 0n) ? (
            <dl className="tabular space-y-1">
              <Row k="Yes shares" v={qusd(holding.yesShares)} />
              <Row k="No shares" v={qusd(holding.noShares)} />
              <Row k="Cost basis" v={`${qusd(holding.costBasis)} qUSD`} />
              <Row k="Mark value" v={`${qusd(holding.markValue)} qUSD`} />
              <Row k="If sold now" v={`${qusd(holding.liquidationValue)} qUSD`} />
            </dl>
          ) : (
            <p className="text-fade">No position in this claim yet.</p>
          )}
        </div>
      )}

      {me && (
        <div className="space-y-3 border-t border-ink p-4 text-sm">
          <h3 className="font-medium">Funds</h3>
          <p className="tabular">
            Available: {qusd(balance)} qUSD {simulated && <span className="text-fade">(simulated)</span>}
          </p>
          {simulated && (
            <button
              className="border border-ink px-3 py-1.5 hover:bg-vellum"
              onClick={async () => {
                setFundMsg(null);
                try {
                  const c = await claimTestFunds();
                  setFundMsg(`Added ${qusd(c)} test qUSD.`);
                } catch (e) {
                  setFundMsg(e instanceof ApiError && e.code === "FAUCET_COOLDOWN" ? "Test funds already claimed today. Try again tomorrow (UTC)." : (e as Error).message);
                }
              }}
            >
              Get 1,000 test qUSD
            </button>
          )}
          {fundMsg && <p className="text-fade">{fundMsg}</p>}
          <div className="border-t border-rule pt-3">
            <p className="font-medium">Deposit from another chain</p>
            <p className="text-fade">
              Cross-chain deposits route through NEAR Intents (any supported asset on its own chain, settled as USDC). Not connected in this build, so no deposit can be started here yet.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fade">{k}</dt>
      <dd className={`text-right ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </div>
  );
}
