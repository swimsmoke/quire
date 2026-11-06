/**
 * Shared API contract types. All monetary / share / price values cross the
 * wire as decimal-integer strings in base units (6 decimals) or ppm, never
 * as JS numbers, so no precision is lost.
 */

/** Where a trade/transaction actually happened. Shown in the UI on every record. */
export type ExecutionMode = "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET" | "SIMULATED";

export type MarketStatus = "ACTIVE" | "PAUSED" | "RESOLUTION_PROPOSED" | "RESOLVED_YES" | "RESOLVED_NO" | "INVALID";

export type ActorKind = "HUMAN" | "AGENT";

export interface MarketSummaryDTO {
  id: string;
  slug: string;
  onchainId: number | null;
  question: string;
  category: string;
  status: MarketStatus;
  probabilityYesPpm: string;
  poolYes: string;
  poolNo: string;
  liquidity: string; // collateral backing (complete sets) in base units
  volume: string;
  volume24h: string;
  tradeCount: number;
  humanTraders: number;
  agentTraders: number;
  feeBps: number;
  executionMode: ExecutionMode;
  updatedAt: string;
}

export interface QuoteDTO {
  side: "BUY" | "SELL";
  outcome: "YES" | "NO";
  amountIn: string; // collateral for BUY, shares for SELL
  fee: string;
  amountOut: string; // shares for BUY, collateral for SELL
  avgPricePpm: string;
  priceBeforePpm: string;
  priceAfterPpm: string;
  priceImpactPpm: string;
  minAmountOut: string; // after slippage tolerance
  slippageBps: number;
  poolAfter: { yes: string; no: string };
  quotedAt: string;
}
