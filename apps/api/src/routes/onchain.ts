import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { IngestError, ingestMarketTx, ingestTradeTx, viewContract, type ChainCtx } from "../near/ingest.js";
import { runKnowledgePipeline } from "./scribe.js";
import { markets } from "../db/schema.js";
import { eq } from "drizzle-orm";

const Hash = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
const AccountId = z.string().regex(/^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/).min(2).max(64);

const STATUS: Record<string, number> = { TX_NOT_FOUND: 404, TX_FAILED: 422, WRONG_CONTRACT: 422, NO_EVENTS: 422, UNKNOWN_MARKET: 409, BAD_EVENT: 422, NOT_OWNER_TX: 403, RPC_ERROR: 502 };

export function chainCtx(app: FastifyInstance): ChainCtx | null {
  const c = app.cfg;
  if (c.QUIRE_EXECUTION_MODE === "SIMULATED" || !c.QUIRE_MARKET_CONTRACT) return null;
  return { rpcUrl: c.NEAR_RPC_URL, contractId: c.QUIRE_MARKET_CONTRACT, network: c.NEAR_NETWORK, mode: c.QUIRE_EXECUTION_MODE, fetchFn: app.chainFetch };
}

export async function onchainRoutes(app: FastifyInstance) {
  const guard = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const ctx = chainCtx(app);
    if (!ctx) reply.code(409).send({ error: "NOT_ONCHAIN", message: "this deployment runs in simulated mode" });
    return ctx;
  };
  const fail = (e: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (e instanceof IngestError) return reply.code(STATUS[e.code] ?? 400).send({ error: e.code, message: e.message });
    throw e;
  };

  /** Record a wallet-signed trade after verifying it on NEAR. */
  app.post("/onchain/trades", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ctx = guard(reply);
    if (!ctx) return;
    const body = z.object({ txHash: Hash, signerId: AccountId }).parse(req.body);
    try {
      const r = await ingestTradeTx(app.db, ctx, body.txHash, body.signerId);
      // A trade may have moved the price enough for a new revision; the update policy decides.
      for (const t of r.trades) {
        const [m] = await app.db.select({ slug: markets.slug }).from(markets).where(eq(markets.id, t.market.id));
        if (m) void runKnowledgePipeline(app, m.slug, { research: false });
      }
      return reply.code(r.alreadyIngested ? 200 : 201).send({
        alreadyIngested: r.alreadyIngested,
        trades: r.trades.map((t) => ({ trade: t.trade, market: { probabilityYesPpm: t.market.priceYesPpm, poolYes: t.market.poolYes, poolNo: t.market.poolNo } })),
      });
    } catch (e) {
      return fail(e, reply);
    }
  });

  /** Register a market created on-chain, with its off-chain description. */
  app.post("/onchain/markets", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ctx = guard(reply);
    if (!ctx) return;
    const body = z
      .object({ txHash: Hash, signerId: AccountId, subject: z.string().min(1).max(80), description: z.string().min(1).max(600), resolutionCriteria: z.string().min(1).max(600) })
      .parse(req.body);
    try {
      // Anyone may create a market on the contract; the event carries the creator and the seeded pool.
      const r = await ingestMarketTx(app.db, ctx, body.txHash, body.signerId, body);
      // New claim: Scout looks for sources and Scribe writes the first page, in the background.
      if (!r.alreadyIngested) void runKnowledgePipeline(app, r.market.slug, { research: true });
      return reply.code(r.alreadyIngested ? 200 : 201).send({ alreadyIngested: r.alreadyIngested, slug: r.market.slug });
    } catch (e) {
      return fail(e, reply);
    }
  });

  /** Contract configuration as read from chain (owner, caps, market count). */
  app.get("/onchain/config", async (_req, reply) => {
    const ctx = guard(reply);
    if (!ctx) return;
    try {
      return { contractId: ctx.contractId, network: ctx.network, config: await viewContract(ctx, "get_config", {}) };
    } catch (e) {
      return fail(e, reply);
    }
  });
}
