/**
 * On-chain ingestion. The browser signs a transaction with the user's wallet, then
 * posts the transaction hash here. We fetch the result from NEAR RPC ourselves, check
 * it succeeded against OUR contract, parse the contract's EVENT_JSON logs and mirror
 * them into Postgres. Nothing the client says is trusted except the hash to look up.
 * Idempotent: a transaction hash is applied at most once.
 */
import { and, eq } from "drizzle-orm";
import type { BuyQuote, Outcome, SellQuote } from "@quire/shared";
import type { DB } from "../db/client.js";
import { markets, transactions } from "../db/schema.js";
import { applyTrade, pgErrorCode } from "../market/engine.js";
import { createMarket } from "../market/create.js";

export type ChainMode = "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET";

export interface ChainCtx {
  rpcUrl: string;
  contractId: string;
  network: "testnet" | "mainnet";
  mode: ChainMode;
  fetchFn?: typeof fetch;
}

export class IngestError extends Error {
  constructor(
    public code: "TX_NOT_FOUND" | "TX_FAILED" | "WRONG_CONTRACT" | "NO_EVENTS" | "RPC_ERROR" | "UNKNOWN_MARKET" | "BAD_EVENT" | "NOT_OWNER_TX",
    message: string,
  ) {
    super(message);
  }
}

interface QuireEvent {
  event: string;
  data: Record<string, unknown>;
}

interface TxResult {
  signerId: string;
  receiverId: string;
  hash: string;
  events: QuireEvent[];
  logs: string[];
}

async function rpc(ctx: ChainCtx, method: string, params: unknown) {
  const f = ctx.fetchFn ?? fetch;
  const r = await f(ctx.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "quire", method, params }),
  });
  if (!r.ok) throw new IngestError("RPC_ERROR", `NEAR RPC returned HTTP ${r.status}`);
  return (await r.json()) as { result?: any; error?: { name?: string; cause?: { name?: string }; message?: string; data?: unknown } };
}

/** Fetch a finished transaction and extract our contract's events. */
export async function fetchTx(ctx: ChainCtx, txHash: string, signerId: string): Promise<TxResult> {
  const res = await rpc(ctx, "tx", { tx_hash: txHash, sender_account_id: signerId, wait_until: "FINAL" });
  if (res.error || !res.result) {
    const name = res.error?.cause?.name ?? res.error?.name ?? "";
    if (/UNKNOWN_TRANSACTION|TIMEOUT/i.test(name)) throw new IngestError("TX_NOT_FOUND", "transaction not found yet; try again in a few seconds");
    throw new IngestError("RPC_ERROR", res.error?.message ?? "RPC error");
  }
  const t = res.result;
  if (t.status?.Failure !== undefined || t.status?.SuccessValue === undefined) throw new IngestError("TX_FAILED", "transaction did not succeed on-chain");
  if (t.transaction?.receiver_id !== ctx.contractId) throw new IngestError("WRONG_CONTRACT", "transaction was not sent to the Quire contract");
  const logs: string[] = [];
  for (const ro of t.receipts_outcome ?? []) {
    if (ro.outcome?.executor_id !== ctx.contractId) continue;
    if (ro.outcome?.status?.Failure !== undefined) throw new IngestError("TX_FAILED", "a contract receipt failed");
    for (const l of ro.outcome.logs ?? []) logs.push(l);
  }
  const events: QuireEvent[] = [];
  for (const l of logs) {
    if (!l.startsWith("EVENT_JSON:")) continue;
    try {
      const j = JSON.parse(l.slice("EVENT_JSON:".length));
      if (j.standard !== "quire" || !Array.isArray(j.data)) continue;
      for (const d of j.data) events.push({ event: j.event, data: d });
    } catch {
      /* ignore malformed log */
    }
  }
  return { signerId: t.transaction.signer_id, receiverId: t.transaction.receiver_id, hash: t.transaction.hash ?? txHash, events, logs };
}

/** Call a view method on the contract. */
export async function viewContract<T>(ctx: ChainCtx, method: string, args: object): Promise<T> {
  const res = await rpc(ctx, "query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: ctx.contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  if (res.error || !res.result?.result) throw new IngestError("RPC_ERROR", res.error?.message ?? "view call failed");
  return JSON.parse(Buffer.from(res.result.result).toString("utf8")) as T;
}

const big = (v: unknown, name: string): bigint => {
  if (typeof v !== "string" || !/^\d{1,39}$/.test(v)) throw new IngestError("BAD_EVENT", `bad ${name} in event`);
  return BigInt(v);
};

/** Record the transaction row; returns null if this hash was already ingested. */
async function claimTx(db: DB, ctx: ChainCtx, tx: TxResult, kind: string) {
  try {
    const [row] = await db
      .insert(transactions)
      .values({
        network: `near-${ctx.network}`,
        txHash: tx.hash,
        signerId: tx.signerId,
        receiverId: tx.receiverId,
        kind,
        status: "SUCCESS",
        logs: tx.logs,
        executionMode: ctx.mode,
        verifiedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  } catch (e) {
    if (pgErrorCode(e) === "23505") return null;
    throw e;
  }
}

/** Ingest a trade (buy/sell) transaction. Returns the trades recorded (empty if already ingested). */
export async function ingestTradeTx(db: DB, ctx: ChainCtx, txHash: string, signerId: string) {
  const tx = await fetchTx(ctx, txHash, signerId);
  const tradeEvents = tx.events.filter((e) => e.event === "trade");
  if (!tradeEvents.length) throw new IngestError("NO_EVENTS", "no trade events in this transaction");
  return db.transaction(async (dbtx) => {
    const [txRow] = await dbtx
      .insert(transactions)
      .values({ network: `near-${ctx.network}`, txHash: tx.hash, signerId: tx.signerId, receiverId: tx.receiverId, kind: "TRADE", status: "SUCCESS", logs: tx.logs, executionMode: ctx.mode, verifiedAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (!txRow) return { alreadyIngested: true as const, trades: [] };
    const out = [];
    for (const [i, ev] of tradeEvents.entries()) {
      const d = ev.data;
      const [m] = await dbtx
        .select()
        .from(markets)
        .where(and(eq(markets.contractId, ctx.contractId), eq(markets.onchainId, Number(d.market_id))))
        .for("update");
      if (!m) throw new IngestError("UNKNOWN_MARKET", `market ${String(d.market_id)} is not registered in Quire's database`);
      const side = d.side === "SELL" ? "SELL" : "BUY";
      const outcome = (d.outcome === "NO" ? "NO" : "YES") as Outcome;
      const collateral = big(d.collateral, "collateral");
      const shares = big(d.shares, "shares");
      const fee = big(d.fee, "fee");
      const poolAfter = { yes: big(d.pool_yes, "pool_yes"), no: big(d.pool_no, "pool_no") };
      if (shares === 0n) throw new IngestError("BAD_EVENT", "zero shares");
      const base = { outcome, fee, avgPricePpm: (collateral * 1_000_000n) / shares, priceBeforePpm: 0n, priceAfterPpm: 0n, poolAfter };
      // The contract already executed this trade; mirror its exact numbers rather than re-quoting.
      const q: BuyQuote | SellQuote =
        side === "BUY"
          ? { ...base, collateralIn: collateral, sharesOut: shares }
          : { ...base, sharesIn: shares, grossCollateral: collateral + fee, collateralOut: collateral };
      const account = String(d.account_id);
      const res = await applyTrade(
        dbtx,
        m,
        { marketId: m.id, traderAccount: account, actorKind: d.is_agent === true ? "AGENT" : "HUMAN", side, outcome, amount: side === "BUY" ? collateral : shares, minOut: 0n, clientOrderId: typeof d.client_order_id === "string" ? d.client_order_id : null },
        q,
        ctx.mode,
        { transactionId: txRow.id, eventIndex: i },
      );
      out.push({ trade: res.trade, market: res.market });
    }
    return { alreadyIngested: false as const, trades: out };
  });
}

export interface MarketMeta {
  subject: string;
  description: string;
  resolutionCriteria: string;
}

/** Register a market created on-chain by the contract owner. */
export async function ingestMarketTx(db: DB, ctx: ChainCtx, txHash: string, signerId: string, meta: MarketMeta) {
  const tx = await fetchTx(ctx, txHash, signerId);
  const ev = tx.events.find((e) => e.event === "market_created");
  if (!ev) throw new IngestError("NO_EVENTS", "no market_created event in this transaction");
  const d = ev.data;
  const existing = await db
    .select()
    .from(markets)
    .where(and(eq(markets.contractId, ctx.contractId), eq(markets.onchainId, Number(d.market_id))));
  if (existing[0]) return { alreadyIngested: true as const, market: existing[0] };
  const txRow = await claimTx(db, ctx, tx, "MARKET_CREATED");
  const liquidity = big(d.liquidity, "liquidity");
  const poolYes = big(d.pool_yes, "pool_yes");
  const poolNo = big(d.pool_no, "pool_no");
  // initial probability implied by the on-chain pool
  const probPpm = (poolNo * 1_000_000n) / (poolYes + poolNo);
  const { market } = await createMarket(db, {
    slug: String(d.slug),
    title: String(d.question),
    subject: meta.subject,
    category: String(d.category),
    description: meta.description,
    resolutionCriteria: meta.resolutionCriteria,
    initialProbPpm: probPpm < 10_000n ? 10_000n : probPpm > 990_000n ? 990_000n : probPpm,
    liquidity,
    feeBps: Number(d.fee_bps),
    lpAccount: tx.signerId,
    executionMode: ctx.mode,
    contractId: ctx.contractId,
    onchainId: Number(d.market_id),
    exactPool: { yes: poolYes, no: poolNo, lpYes: big(d.lp_yes, "lp_yes"), lpNo: big(d.lp_no, "lp_no") },
  });
  void txRow;
  return { alreadyIngested: false as const, market };
}
