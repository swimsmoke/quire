"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, parseUnits } from "@quire/shared";
import { ApiError, clientRequest, humanError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { pct, price, fmtNear } from "@/lib/format";
import type { Market, Quote } from "@/lib/types";
import { buttonPrimary, buttonSecondary, Segmented, Sheet } from "./ui";

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";

interface Holding {
  yesShares: string;
  noShares: string;
  costBasis: string;
  markValue: string;
  liquidationValue: string;
}
interface Done {
  side: Side;
  outcome: Outcome;
  shares: string;
  collateral: string;
  avg: number;
  prob: number;
  duplicate?: boolean;
  /** on-chain: sent and final on NEAR, but not yet recorded by Quire */
  pending?: boolean;
  txHash?: string;
}

const AMOUNT_RE = /^\d{0,12}(\.\d{0,6})?$/;

export function TradeTicket({ market, initialOutcome = "YES" }: { market: Market; initialOutcome?: Outcome }) {
  const router = useRouter();
  const { me, token, balance, refresh, claimTestFunds, onchain, callContract, chain } = useSession();
  const accountId = me?.session.accountId ?? null;
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [side, setSide] = useState<Side>("BUY");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<"50" | "100" | "300">("100");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [fundMsg, setFundMsg] = useState<string | null>(null);
  const orderId = useRef<string | null>(null);

  const simulated = market.executionMode === "SIMULATED";
  const onMarketChain = !simulated && onchain && market.onchainId != null;
  const explorer = chain.network === "mainnet" ? "https://nearblocks.io/txns/" : "https://testnet.nearblocks.io/txns/";
  const held = holding ? (outcome === "YES" ? holding.yesShares : holding.noShares) : "0";

  const loadHolding = useCallback(async () => {
    if (!accountId) return setHolding(null);
    const path = onchain ? `/portfolio?account=${encodeURIComponent(accountId)}` : "/portfolio";
    const pf = await clientRequest<{ positions: (Holding & { market: { slug: string } })[] }>(path, { token }).catch(() => null);
    setHolding(pf?.positions.find((p) => p.market.slug === market.slug) ?? null);
  }, [token, accountId, onchain, market.slug]);
  useEffect(() => {
    loadHolding();
  }, [loadHolding]);

  useEffect(() => {
    if (reviewing) return;
    setQuoteError(null);
    if (!amount || !AMOUNT_RE.test(amount) || Number(amount) === 0) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await clientRequest<{ quote: Quote }>(`/markets/${market.slug}/quote`, { method: "POST", body: { side, outcome, amount, slippageBps: Number(slippage) } });
        setQuote(r.quote);
      } catch (e) {
        setQuote(null);
        setQuoteError(e instanceof ApiError && e.code.startsWith("FPMM_") ? "The pool can't fill that size. Try a smaller amount." : (e as Error).message);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [amount, side, outcome, slippage, market.slug, reviewing]);

  function addAmount(delta: string) {
    try {
      const cur = amount && AMOUNT_RE.test(amount) ? parseUnits(amount || "0") : 0n;
      setAmount(formatUnits(cur + parseUnits(delta)));
    } catch {
      setAmount(delta);
    }
  }

  function review() {
    setError(null);
    if (!quote) return;
    if (side === "BUY" && BigInt(quote.amountIn) > BigInt(balance)) return setError(humanError("INSUFFICIENT_BALANCE")!);
    if (side === "SELL" && BigInt(quote.amountIn) > BigInt(held)) return setError(humanError("INSUFFICIENT_SHARES")!);
    // One id per reviewed order; a retry after a dropped connection resends the same id, so it can execute at most once.
    orderId.current = crypto.randomUUID().replace(/-/g, "");
    setDone(null);
    setReviewing(true);
  }

  async function confirm() {
    if (!quote || !orderId.current) return;
    setSubmitting(true);
    setError(null);
    if (onMarketChain) {
      // 1) the wallet signs and sends the trade to the contract; 2) Quire verifies the transaction on NEAR and records it.
      let hash: string;
      try {
        const units = parseUnits(amount).toString();
        hash =
          side === "BUY"
            ? await callContract("buy", { market_id: market.onchainId, outcome, amount: units, min_shares_out: quote.minAmountOut, client_order_id: orderId.current }, { depositYocto: "1" })
            : await callContract("sell", { market_id: market.onchainId, outcome, shares: units, min_collateral_out: quote.minAmountOut, client_order_id: orderId.current }, { depositYocto: "1" });
      } catch (e) {
        setError((e as Error).message);
        orderId.current = null;
        setReviewing(false);
        setSubmitting(false);
        return;
      }
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await clientRequest<{ trades: { trade: { shares: string; collateral: string; avgPricePpm: number }; market: { probabilityYesPpm: number } }[] }>("/onchain/trades", {
            method: "POST",
            body: { txHash: hash, signerId: accountId },
          });
          const t = r.trades[0];
          setDone(t ? { side, outcome, shares: t.trade.shares, collateral: t.trade.collateral, avg: t.trade.avgPricePpm, prob: t.market.probabilityYesPpm, txHash: hash } : { side, outcome, shares: "0", collateral: "0", avg: 0, prob: market.probabilityYesPpm, duplicate: true, txHash: hash });
          break;
        } catch (e) {
          if (attempt < 4 && e instanceof ApiError && (e.code === "TX_NOT_FOUND" || e.code === "RPC_ERROR")) {
            await new Promise((res) => setTimeout(res, 2500));
            continue;
          }
          // The trade is final on NEAR even if Quire's record is late.
          setDone({ side, outcome, shares: "0", collateral: "0", avg: 0, prob: market.probabilityYesPpm, pending: true, txHash: hash });
          break;
        }
      }
      finish();
      setSubmitting(false);
      return;
    }
    try {
      const r = await clientRequest<{ trade: { shares: string; collateral: string; avgPricePpm: number }; market: { probabilityYesPpm: number } }>(`/markets/${market.slug}/trades`, {
        method: "POST",
        token,
        body: { side, outcome, amount, minOut: quote.minAmountOut, clientOrderId: orderId.current },
      });
      setDone({ side, outcome, shares: r.trade.shares, collateral: r.trade.collateral, avg: r.trade.avgPricePpm, prob: r.market.probabilityYesPpm });
      finish();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_ORDER") {
        setDone({ side, outcome, shares: "0", collateral: "0", avg: 0, prob: market.probabilityYesPpm, duplicate: true });
        finish();
      } else if (e instanceof ApiError) {
        setError(humanError(e.code) ?? e.message);
        orderId.current = null;
        setReviewing(false);
      } else {
        setError("The connection dropped before Quire answered. Confirm again: the same order is resent and can only execute once.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function finish() {
    orderId.current = null;
    setAmount("");
    setQuote(null);
    Promise.all([refresh(), loadHolding()]).then(() => router.refresh());
  }

  const outcomeButton = (o: Outcome) => {
    const on = outcome === o;
    const ppm = o === "YES" ? market.probabilityYesPpm : market.probabilityNoPpm;
    const tone = o === "YES" ? (on ? "bg-yes text-on-accent" : "bg-fill text-yes") : on ? "bg-no text-on-accent" : "bg-fill text-no";
    return (
      <button
        key={o}
        type="button"
        aria-pressed={on}
        onClick={() => setOutcome(o)}
        className={`flex h-14 flex-1 items-center justify-between rounded-lg px-4 transition-[background-color,color,transform] duration-300 ease-ios active:scale-[0.98] ${tone}`}
      >
        <span className="text-body font-semibold">{o === "YES" ? "Yes" : "No"}</span>
        <span className="tabular text-sub font-medium opacity-90">{price(ppm)}</span>
      </button>
    );
  };

  const outcomeLabel = outcome === "YES" ? "Yes" : "No";

  return (
    <section aria-labelledby="trade-h">
      <h2 id="trade-h" className="text-title3 font-semibold">
        Trade
      </h2>

      <div className="mt-4 space-y-4">
        <Segmented label="Buy or sell" value={side} onChange={setSide} options={[{ value: "BUY", label: "Buy" }, { value: "SELL", label: "Sell" }]} />
        <div className="flex gap-2">{(["YES", "NO"] as const).map(outcomeButton)}</div>
        <p className="text-footnote text-label-2">Price per share in NEAR. A share pays 1 NEAR if the claim resolves its way.</p>

        <div>
          <label htmlFor="amt" className="flex justify-between text-footnote text-label-2">
            <span>{side === "BUY" ? "Amount" : "Shares"}</span>
            {me && <span className="tabular">{side === "BUY" ? `${fmtNear(balance)} NEAR available` : `${fmtNear(held)} held`}</span>}
          </label>
          <div className="mt-1.5 flex items-baseline border-b hairline pb-2 transition-colors focus-within:border-tint">
            <input
              id="amt"
              inputMode="decimal"
              value={amount}
              disabled={reviewing}
              onChange={(e) => AMOUNT_RE.test(e.target.value) && setAmount(e.target.value)}
              className="tabular w-full bg-transparent text-[2rem] leading-tight font-semibold tracking-[-0.02em] outline-none placeholder:text-label-3"
              placeholder="0"
            />
            <span className="text-sub text-label-2">{side === "BUY" ? "NEAR" : "shares"}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {(side === "BUY" ? (onMarketChain ? ["0.05", "0.1", "0.25"] : ["10", "50", "100"]) : []).map((d) => (
              <button key={d} type="button" onClick={() => addAmount(d)} className="h-8 rounded-md bg-fill px-3 text-footnote font-medium transition-[background-color,transform] duration-200 hover:bg-fill-2 active:scale-95">
                +{d}
              </button>
            ))}
            {me && (
              <button
                type="button"
                onClick={() => setAmount(formatUnits(BigInt(side === "BUY" ? balance : held)))}
                className="h-8 rounded-md bg-fill px-3 text-footnote font-medium text-tint transition-[background-color,transform] duration-200 hover:bg-fill-2 active:scale-95"
              >
                Max
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-footnote text-label-2">Max slippage</span>
          <div className="w-44">
            <Segmented
              label="Max slippage"
              size="sm"
              value={slippage}
              onChange={setSlippage}
              options={[
                { value: "50", label: "0.5%" },
                { value: "100", label: "1%" },
                { value: "300", label: "3%" },
              ]}
            />
          </div>
        </div>

        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-ios ${quote ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <dl className="tabular overflow-hidden text-sub">
            {quote && (
              <div className="divide-y hairline border-y hairline">
                <Row k="You receive" v={side === "BUY" ? `${fmtNear(quote.amountOut)} ${outcomeLabel} shares` : `${fmtNear(quote.amountOut)} NEAR`} strong />
                <Row k="Average price" v={price(quote.avgPricePpm)} />
                <Row k="Fee" v={`${fmtNear(quote.fee)} NEAR`} />
                <Row k={`${outcomeLabel} probability`} v={`${pct(quote.priceBeforePpm)} to ${pct(quote.priceAfterPpm)}`} />
              </div>
            )}
          </dl>
        </div>
        {quoteError && <p className="text-footnote text-no">{quoteError}</p>}
        {error && !reviewing && (
          <p role="alert" className="text-footnote text-no">
            {error}
          </p>
        )}

        {!simulated && !onMarketChain ? (
          <p className="text-sub text-label-2">This market settles on NEAR, but this deployment isn&apos;t connected to the contract.</p>
        ) : !me ? (
          <p className="text-sub text-label-2">{onMarketChain ? "Connect your wallet to trade." : "Sign in to trade."}</p>
        ) : (
          <button onClick={review} disabled={!quote} className={`${buttonPrimary} w-full`}>
            Review {side === "BUY" ? "buy" : "sell"}
          </button>
        )}
      </div>

      {me && (
        <div className="mt-10 border-t hairline pt-6">
          <h3 className="text-sub font-semibold">Your position</h3>
          {holding && (BigInt(holding.yesShares) > 0n || BigInt(holding.noShares) > 0n) ? (
            <dl className="tabular mt-2 divide-y hairline text-sub">
              <Row k="Yes shares" v={fmtNear(holding.yesShares)} />
              <Row k="No shares" v={fmtNear(holding.noShares)} />
              <Row k="Cost" v={`${fmtNear(holding.costBasis)} NEAR`} />
              <Row k="Value at current price" v={`${fmtNear(holding.markValue)} NEAR`} />
              <Row k="If sold now" v={`${fmtNear(holding.liquidationValue)} NEAR`} />
            </dl>
          ) : (
            <p className="mt-1 text-sub text-label-2">You don&apos;t hold this claim yet.</p>
          )}

          <h3 className="mt-8 text-sub font-semibold">Funds</h3>
          <p className="tabular mt-1 text-sub">
            {fmtNear(balance, 4)} NEAR {onMarketChain ? "deposited in Quire" : "available"}
            {simulated && <span className="text-label-2"> (test funds)</span>}
          </p>
          {onMarketChain && <ChainFunds />}
          {simulated && (
            <button
              className={`${buttonSecondary} mt-3 h-9 px-4`}
              onClick={async () => {
                setFundMsg(null);
                try {
                  setFundMsg(`Added ${fmtNear(await claimTestFunds())} test NEAR.`);
                } catch (e) {
                  setFundMsg(e instanceof ApiError && e.code === "FAUCET_COOLDOWN" ? "Test funds already claimed today. Try again after midnight UTC." : (e as Error).message);
                }
              }}
            >
              Get 1,000 test NEAR
            </button>
          )}
          {fundMsg && <p className="mt-2 text-footnote text-label-2">{fundMsg}</p>}
          <p className="mt-5 text-footnote text-label-2">
            <span className="font-medium text-label">Holding USDC, ETH or SOL instead?</span>{" "}
            <Link href="/fund" className="text-tint hover:underline">
              See live NEAR Intents quotes
            </Link>{" "}
            for swapping it into NEAR. Sending opens when Quire moves to mainnet.
          </p>
        </div>
      )}

      <Sheet open={reviewing} onClose={() => !submitting && setReviewing(false)} title={done ? (done.duplicate ? "Already placed" : "Order filled") : "Review order"}>
        {done ? (
          <div className="pb-1 text-center">
            <svg viewBox="0 0 52 52" className="mx-auto size-14" aria-hidden>
              <circle cx="26" cy="26" r="24" fill="none" stroke="var(--yes)" strokeWidth="2.5" pathLength={1} className="anim-check" />
              <path d="M15 27 l7 7 l15 -16" fill="none" stroke="var(--yes)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="anim-check" />
            </svg>
            <p className="mt-3 text-sub" role="status">
              {done.pending
                ? "Your trade is final on NEAR. Quire's record of it is catching up; refresh in a moment."
                : done.duplicate
                ? "This order had already executed. Your position and history show it."
                : `${done.side === "BUY" ? "Bought" : "Sold"} ${fmtNear(done.shares)} ${done.outcome === "YES" ? "Yes" : "No"} shares for ${fmtNear(done.collateral)} NEAR at ${price(done.avg)} average. Yes is now ${pct(done.prob)}.`}
            </p>
            {done.txHash && (
              <a href={`${explorer}${done.txHash}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-footnote text-tint hover:underline">
                View the transaction on NEAR
              </a>
            )}
            <button data-autofocus onClick={() => setReviewing(false)} className={`${buttonPrimary} mt-5 w-full`}>
              Done
            </button>
          </div>
        ) : (
          quote && (
            <div>
              <p className="text-sub text-label-2">{market.question}</p>
              <dl className="tabular mt-4 divide-y hairline border-y hairline text-sub">
                <Row k="Order" v={`${side === "BUY" ? "Buy" : "Sell"} ${outcomeLabel}`} strong />
                <Row k={side === "BUY" ? "You pay" : "You sell"} v={side === "BUY" ? `${fmtNear(quote.amountIn)} NEAR` : `${fmtNear(quote.amountIn)} shares`} />
                <Row k="You receive" v={side === "BUY" ? `${fmtNear(quote.amountOut)} shares` : `${fmtNear(quote.amountOut)} NEAR`} />
                <Row k="Average price" v={price(quote.avgPricePpm)} />
                <Row k="Fee" v={`${fmtNear(quote.fee)} NEAR`} />
                <Row k="Price impact" v={pct(quote.priceImpactPpm, 2)} />
                <Row k="Fills only if you get at least" v={side === "BUY" ? `${fmtNear(quote.minAmountOut)} shares` : `${fmtNear(quote.minAmountOut)} NEAR`} />
              </dl>
              {error && (
                <p role="alert" className="mt-3 text-footnote text-no">
                  {error}
                </p>
              )}
              <button data-autofocus onClick={confirm} disabled={submitting} className={`${buttonPrimary} mt-5 w-full`}>
                {submitting ? (onMarketChain ? "Waiting for your wallet…" : "Placing order…") : `Confirm ${side === "BUY" ? "buy" : "sell"}`}
              </button>
              <p className="mt-3 text-center text-caption text-label-3">
                {onMarketChain ? `Your wallet will ask you to approve this on NEAR ${chain.network}` : "Simulated trade on Quire's test ledger"}
              </p>
            </div>
          )
        )}
      </Sheet>
    </section>
  );
}

/** Deposit NEAR into, or withdraw it from, your Quire trading balance. */
export function ChainFunds() {
  const { balance, registered, callContract, refresh } = useSession();
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const valid = AMOUNT_RE.test(amt) && Number(amt) > 0;

  async function run(kind: "deposit" | "withdraw") {
    setBusy(kind);
    setMsg(null);
    try {
      const units = parseUnits(amt);
      if (kind === "deposit") await callContract("deposit", {}, { depositYocto: (units * 10n ** 18n).toString(), gasTgas: 30 });
      else {
        if (units > BigInt(balance)) throw new Error("That's more than your Quire balance.");
        await callContract("withdraw", { amount: units.toString() }, { depositYocto: "1", gasTgas: 60 });
      }
      setMsg(kind === "deposit" ? `Deposited ${amt} NEAR.` : `Withdrew ${amt} NEAR to your wallet.`);
      setAmt("");
      setTimeout(refresh, 1500);
      await refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor="fund-amt" className="text-footnote text-label-2">
        Move NEAR between your wallet and Quire
      </label>
      <div className="mt-1.5 flex h-10 items-center rounded-lg bg-bg-2 px-3 ring-tint transition-shadow focus-within:ring-2">
        <input id="fund-amt" inputMode="decimal" value={amt} onChange={(e) => AMOUNT_RE.test(e.target.value) && setAmt(e.target.value)} placeholder="0.5" className="tabular w-full bg-transparent text-body outline-none placeholder:text-label-3" />
        <span className="text-sub text-label-2">NEAR</span>
      </div>
      <div className="mt-2 flex gap-2">
        <button disabled={!valid || busy !== null} onClick={() => run("deposit")} className={`${buttonPrimary} h-9 flex-1 px-3`}>
          {busy === "deposit" ? "Check your wallet…" : "Deposit"}
        </button>
        <button disabled={!valid || busy !== null || !registered} onClick={() => run("withdraw")} className={`${buttonSecondary} h-9 flex-1 px-3`}>
          {busy === "withdraw" ? "Check your wallet…" : "Withdraw"}
        </button>
      </div>
      {!registered && <p className="mt-2 text-footnote text-label-2">Your first deposit also registers you, which costs about 0.003 NEAR.</p>}
      {msg && (
        <p role="status" className="mt-2 text-footnote text-label-2">
          {msg}
        </p>
      )}
    </div>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-label-2">{k}</dt>
      <dd className={`text-right ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </div>
  );
}
