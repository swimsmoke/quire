/**
 * Trade execution against the Postgres ledger (SIMULATED mode) and the shared
 * position/market accounting used when ingesting on-chain trade events.
 *
 * Guarantees (all inside one DB transaction):
 * - market row and balance row are locked FOR UPDATE -> no lost updates
 * - client order ids are unique per trader -> no duplicate execution
 * - min-out slippage bound checked against the locked pool state
 * - price/pool math is the shared integer FPMM (identical to the contract)
 */
import { and, eq, sql } from "drizzle-orm";
import {
  FpmmError,
  priceYes,
  quoteBuy,
  quoteSell,
  type BuyQuote,
  type Outcome,
  type SellQuote,
} from "@quire/shared";
import type { DB, Tx } from "../db/client.js";
import { accountBalances, marketSnapshots, markets, positions, trades } from "../db/schema.js";

export type ExecMode = "SIMULATED" | "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET";

export class TradeError extends Error {
  constructor(
    public code:
      | "MARKET_NOT_FOUND"
      | "MARKET_NOT_ACTIVE"
      | "WRONG_EXECUTION_MODE"
      | "INSUFFICIENT_BALANCE"
      | "INSUFFICIENT_SHARES"
      | "SLIPPAGE"
      | "DUPLICATE_ORDER"
      | "BAD_ORDER_ID"
      | "INVALID_AMOUNT"
      | `FPMM_${string}`,
    message: string,
    public existingTradeId?: string,
  ) {
    super(message);
    this.name = "TradeError";
  }
}

export interface TradeRequest {
  marketId: string;
  traderAccount: string;
  actorKind: "HUMAN" | "AGENT";
  userId?: string | null;
  agentId?: string | null;
  side: "BUY" | "SELL";
  outcome: Outcome;
  /** collateral for BUY, shares for SELL (base units) */
  amount: bigint;
  /** min shares out (BUY) or min collateral out (SELL) */
  minOut: bigint;
  clientOrderId?: string | null;
}

export function quote(pool: { yes: bigint; no: bigint }, side: "BUY" | "SELL", o: Outcome, amount: bigint, feeBps: bigint): BuyQuote | SellQuote {
  try {
    return side === "BUY" ? quoteBuy(pool, o, amount, feeBps) : quoteSell(pool, o, amount, feeBps);
  } catch (e) {
    if (e instanceof FpmmError) throw new TradeError(`FPMM_${e.code}`, e.message);
    throw e;
  }
}

/** Execute a trade on the Postgres ledger. Only for markets in SIMULATED mode. */
export async function executeSimulatedTrade(db: DB, req: TradeRequest) {
  if (req.amount <= 0n) throw new TradeError("INVALID_AMOUNT", "amount must be positive");
  if (req.minOut < 0n) throw new TradeError("INVALID_AMOUNT", "minOut must be >= 0");
  if (req.clientOrderId != null && (req.clientOrderId.length === 0 || req.clientOrderId.length > 64)) {
    throw new TradeError("BAD_ORDER_ID", "clientOrderId must be 1-64 chars");
  }
  try {
    return await db.transaction(async (tx) => {
      if (req.clientOrderId) {
        const dup = await tx
          .select({ id: trades.id })
          .from(trades)
          .where(and(eq(trades.traderAccount, req.traderAccount), eq(trades.clientOrderId, req.clientOrderId)));
        if (dup[0]) throw new TradeError("DUPLICATE_ORDER", "clientOrderId already used", dup[0].id);
      }

      const [m] = await tx.select().from(markets).where(eq(markets.id, req.marketId)).for("update");
      if (!m) throw new TradeError("MARKET_NOT_FOUND", "market not found");
      if (m.executionMode !== "SIMULATED") throw new TradeError("WRONG_EXECUTION_MODE", "market executes on-chain; sign the trade with your wallet");
      if (m.status !== "ACTIVE") throw new TradeError("MARKET_NOT_ACTIVE", `market is ${m.status}`);

      const q = quote({ yes: m.poolYes, no: m.poolNo }, req.side, req.outcome, req.amount, BigInt(m.feeBps));

      // lock (or create) balance row
      await tx.insert(accountBalances).values({ traderAccount: req.traderAccount, executionMode: "SIMULATED", available: 0n }).onConflictDoNothing();
      const [bal] = await tx
        .select()
        .from(accountBalances)
        .where(and(eq(accountBalances.traderAccount, req.traderAccount), eq(accountBalances.executionMode, "SIMULATED")))
        .for("update");

      if ("sharesOut" in q) {
        if (q.sharesOut < req.minOut) throw new TradeError("SLIPPAGE", "price moved beyond your slippage tolerance");
        if (bal!.available < req.amount) throw new TradeError("INSUFFICIENT_BALANCE", "insufficient NEAR balance");
      } else {
        if (q.collateralOut < req.minOut) throw new TradeError("SLIPPAGE", "price moved beyond your slippage tolerance");
      }

      const trade = await applyTrade(tx, m, req, q, "SIMULATED", { balance: bal!.available });
      return trade;
    });
  } catch (e) {
    // A concurrent duplicate that slipped past the pre-check hits the unique index.
    // Drizzle wraps driver errors, so inspect the cause chain for Postgres 23505.
    if (req.clientOrderId && pgErrorCode(e) === "23505") {
      throw new TradeError("DUPLICATE_ORDER", "clientOrderId already used");
    }
    throw e;
  }
}

export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

type MarketRow = typeof markets.$inferSelect;

/**
 * Apply a quoted trade to positions, balances, market state, trade log and
 * snapshots. Shared by simulated execution and on-chain event ingestion.
 */
export async function applyTrade(
  tx: Tx,
  m: MarketRow,
  req: TradeRequest,
  q: BuyQuote | SellQuote,
  mode: ExecMode,
  opts: { balance?: bigint; transactionId?: string; eventIndex?: number; createdAt?: Date } = {},
) {
  const isBuy = "sharesOut" in q;
  const shares = isBuy ? q.sharesOut : q.sharesIn;
  const collateral = isBuy ? q.collateralIn : q.collateralOut;

  // ---- position (average-cost accounting) ----
  await tx
    .insert(positions)
    .values({ marketId: m.id, traderAccount: req.traderAccount, actorKind: req.actorKind, userId: req.userId ?? null, agentId: req.agentId ?? null })
    .onConflictDoNothing();
  const [pos] = await tx
    .select()
    .from(positions)
    .where(and(eq(positions.marketId, m.id), eq(positions.traderAccount, req.traderAccount)))
    .for("update");
  const held = req.outcome === "YES" ? pos!.yesShares : pos!.noShares;
  const cost = req.outcome === "YES" ? pos!.yesCost : pos!.noCost;
  let newHeld: bigint;
  let newCost: bigint;
  let realized = BigInt(pos!.realizedPnl);
  if (isBuy) {
    newHeld = held + shares;
    newCost = cost + collateral;
  } else {
    if (held < shares) throw new TradeError("INSUFFICIENT_SHARES", "not enough shares to sell");
    const costRemoved = held === 0n ? 0n : (cost * shares) / held;
    newHeld = held - shares;
    newCost = newHeld === 0n ? 0n : cost - costRemoved;
    realized += collateral - (newHeld === 0n ? cost : costRemoved);
  }
  await tx
    .update(positions)
    .set(
      req.outcome === "YES"
        ? { yesShares: newHeld, yesCost: newCost, realizedPnl: realized.toString(), updatedAt: new Date() }
        : { noShares: newHeld, noCost: newCost, realizedPnl: realized.toString(), updatedAt: new Date() },
    )
    .where(eq(positions.id, pos!.id));

  // ---- balance ----
  if (opts.balance !== undefined) {
    const next = isBuy ? opts.balance - collateral : opts.balance + collateral;
    if (next < 0n) throw new TradeError("INSUFFICIENT_BALANCE", "insufficient balance");
    await tx
      .update(accountBalances)
      .set({ available: next, updatedAt: new Date() })
      .where(and(eq(accountBalances.traderAccount, req.traderAccount), eq(accountBalances.executionMode, mode)));
  }

  // ---- market ----
  const priceBefore = priceYes({ yes: m.poolYes, no: m.poolNo });
  const priceAfter = priceYes(q.poolAfter);
  const setsDelta = isBuy ? q.collateralIn - q.fee : -q.grossCollateral;
  const volumeDelta = isBuy ? q.collateralIn : q.grossCollateral;
  const [updated] = await tx
    .update(markets)
    .set({
      poolYes: q.poolAfter.yes,
      poolNo: q.poolAfter.no,
      sets: m.sets + setsDelta,
      fees: m.fees + q.fee,
      volume: m.volume + volumeDelta,
      tradeCount: m.tradeCount + 1,
      priceYesPpm: Number(priceAfter),
      version: sql`${markets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(markets.id, m.id))
    .returning();

  const [trade] = await tx
    .insert(trades)
    .values({
      marketId: m.id,
      traderAccount: req.traderAccount,
      actorKind: req.actorKind,
      userId: req.userId ?? null,
      agentId: req.agentId ?? null,
      side: req.side,
      outcome: req.outcome,
      collateral,
      shares,
      fee: q.fee,
      priceBeforePpm: Number(priceBefore),
      priceAfterPpm: Number(priceAfter),
      avgPricePpm: Number(q.avgPricePpm),
      poolYesAfter: q.poolAfter.yes,
      poolNoAfter: q.poolAfter.no,
      executionMode: mode,
      transactionId: opts.transactionId ?? null,
      eventIndex: opts.eventIndex ?? null,
      clientOrderId: req.clientOrderId ?? null,
      createdAt: opts.createdAt,
    })
    .returning();

  await tx.insert(marketSnapshots).values({
    marketId: m.id,
    priceYesPpm: Number(priceAfter),
    poolYes: q.poolAfter.yes,
    poolNo: q.poolAfter.no,
    volume: updated!.volume,
    tradeCount: updated!.tradeCount,
    cause: "TRADE",
    takenAt: opts.createdAt,
  });

  return { trade: trade!, market: updated!, position: { yesShares: req.outcome === "YES" ? newHeld : pos!.yesShares, noShares: req.outcome === "NO" ? newHeld : pos!.noShares } };
}
