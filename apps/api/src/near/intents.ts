/**
 * NEAR Intents (1Click API). Quire runs on NEAR testnet and NEAR Intents exists only on mainnet,
 * so this only ever asks for dry quotes: no deposit address is created and no funds can move.
 */
export const WNEAR = "nep141:wrap.near";

export interface IntentsToken {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price: number;
}

/** Assets people are likely to fund from, on the chains they're likely to hold them on. */
const SYMBOLS = new Set(["USDC", "USDT", "ETH", "SOL", "BTC", "BNB", "ZEC"]);
const CHAINS = new Set(["eth", "base", "arb", "op", "sol", "btc", "bsc", "tron", "pol", "avax", "zec"]);

/** Placeholder refund addresses for dry quotes, one per chain format. Never used to send anything. */
const DRY_REFUND: Record<string, string> = {
  eth: "0x000000000000000000000000000000000000dEaD",
  base: "0x000000000000000000000000000000000000dEaD",
  arb: "0x000000000000000000000000000000000000dEaD",
  op: "0x000000000000000000000000000000000000dEaD",
  bsc: "0x000000000000000000000000000000000000dEaD",
  pol: "0x000000000000000000000000000000000000dEaD",
  avax: "0x000000000000000000000000000000000000dEaD",
  sol: "11111111111111111111111111111111",
  tron: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  btc: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
};

export interface IntentsCfg {
  baseUrl: string;
  apiKey?: string;
  jwt?: string;
  fetchFn: typeof fetch;
}

let cache: { at: number; tokens: IntentsToken[]; near: number } | null = null;

export async function listTokens(cfg: IntentsCfg): Promise<{ tokens: IntentsToken[]; nearPrice: number }> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return { tokens: cache.tokens, nearPrice: cache.near };
  const r = await cfg.fetchFn(`${cfg.baseUrl}/v0/tokens`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`1Click token list returned ${r.status}`);
  const all = (await r.json()) as IntentsToken[];
  const near = all.find((t) => t.assetId === WNEAR)?.price;
  if (!near) throw new Error("1Click token list has no NEAR price");
  const tokens = all
    .filter((t) => SYMBOLS.has(t.symbol) && CHAINS.has(t.blockchain) && t.price > 0)
    .map(({ assetId, symbol, blockchain, decimals, price }) => ({ assetId, symbol, blockchain, decimals, price }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.blockchain.localeCompare(b.blockchain));
  cache = { at: Date.now(), tokens, near };
  return { tokens, nearPrice: near };
}

export function clearTokenCache() {
  cache = null;
}

/** Decimal string -> base units, without floating point. */
export function toBaseUnits(amount: string, decimals: number): string {
  const [w, f = ""] = amount.split(".");
  return (BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}

export interface FundingQuote {
  source: "ONECLICK_QUOTE" | "PRICE_ESTIMATE";
  amountIn: string;
  amountInUsd: number;
  amountOutNear: string;
  minAmountOutNear?: string;
  timeEstimateS?: number;
  /** Why a live quote wasn't used, when it wasn't. */
  note?: string;
}

export async function quoteToNear(cfg: IntentsCfg, token: IntentsToken, nearPrice: number, amount: string): Promise<FundingQuote> {
  const estimate = (note: string): FundingQuote => {
    const usd = Number(amount) * token.price;
    return { source: "PRICE_ESTIMATE", amountIn: amount, amountInUsd: usd, amountOutNear: (usd / nearPrice).toFixed(4), note };
  };
  const refund = DRY_REFUND[token.blockchain];
  if (!cfg.apiKey && !cfg.jwt) return estimate("Live quotes need a 1Click API key on the server, so this is worked out from 1Click's current token prices.");
  if (!refund) return estimate(`Live quotes from ${token.blockchain} aren't set up here, so this is worked out from 1Click's current token prices.`);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
  else headers.authorization = `Bearer ${cfg.jwt}`;
  try {
    const r = await cfg.fetchFn(`${cfg.baseUrl}/v0/quote`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        dry: true, // preview only: no deposit address, nothing can be sent
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: token.assetId,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: WNEAR,
        amount: toBaseUnits(amount, token.decimals),
        refundTo: refund,
        refundType: "ORIGIN_CHAIN",
        recipient: "near",
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
        quoteWaitingTimeMs: 3000,
      }),
    });
    const body = (await r.json().catch(() => ({}))) as { message?: string; quote?: { amountInUsd: string; amountOutFormatted: string; minAmountOut: string; timeEstimate: number } };
    if (!r.ok || !body.quote) return estimate(`1Click didn't return a quote${body.message ? ` (${body.message})` : ` (${r.status})`}, so this is worked out from its current token prices.`);
    const q = body.quote;
    return {
      source: "ONECLICK_QUOTE",
      amountIn: amount,
      amountInUsd: Number(q.amountInUsd),
      amountOutNear: Number(q.amountOutFormatted).toFixed(4),
      minAmountOutNear: (Number(BigInt(q.minAmountOut) / 10n ** 20n) / 10_000).toFixed(4),
      timeEstimateS: q.timeEstimate,
    };
  } catch (e) {
    return estimate(`Couldn't reach 1Click for a live quote (${(e as Error).message}), so this is worked out from its current token prices.`);
  }
}
