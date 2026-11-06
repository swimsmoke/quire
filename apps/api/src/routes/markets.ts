import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { BPS, parseUnits, type Outcome } from "@quire/shared";
import { claims, marketSnapshots, markets, positions, trades } from "../db/schema.js";
import { executeSimulatedTrade, quote } from "../market/engine.js";

const OutcomeZ = z.enum(["YES", "NO"]);
const SideZ = z.enum(["BUY", "SELL"]);
const Amount = z.string().max(40).transform((v, ctx) => {
  try {
    const n = parseUnits(v);
    if (n <= 0n) throw new RangeError("must be positive");
    return n;
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});

/** Per-market aggregate stats computed in SQL. */
const statsSql = sql`
  select m.id as market_id,
    coalesce((select sum(t.collateral) from trades t where t.market_id = m.id and t.created_at > now() - interval '24 hours'), 0)::text as volume_24h,
    (select count(distinct t.trader_account) from trades t where t.market_id = m.id and t.actor_kind = 'HUMAN')::int as human_traders,
    (select count(distinct t.trader_account) from trades t where t.market_id = m.id and t.actor_kind = 'AGENT')::int as agent_traders,
    (select max(t.created_at) from trades t where t.market_id = m.id) as last_trade_at
  from markets m`;

type StatRow = { market_id: string; volume_24h: string; human_traders: number; agent_traders: number; last_trade_at: Date | null };

async function statsByMarket(app: FastifyInstance) {
  const r = await app.db.execute<StatRow>(statsSql);
  return new Map(r.rows.map((s) => [s.market_id, s]));
}

function present(m: typeof markets.$inferSelect, c: typeof claims.$inferSelect, s?: StatRow) {
  return {
    id: m.id,
    slug: m.slug,
    question: c.title,
    subject: c.subject,
    category: c.category,
    status: m.status,
    executionMode: m.executionMode,
    contractId: m.contractId,
    onchainId: m.onchainId,
    probabilityYesPpm: m.priceYesPpm,
    probabilityNoPpm: 1_000_000 - m.priceYesPpm,
    poolYes: m.poolYes,
    poolNo: m.poolNo,
    liquidity: m.sets,
    volume: m.volume,
    volume24h: s?.volume_24h ?? "0",
    fees: m.fees,
    feeBps: m.feeBps,
    tradeCount: m.tradeCount,
    humanTraders: s?.human_traders ?? 0,
    agentTraders: s?.agent_traders ?? 0,
    lastTradeAt: s?.last_trade_at ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

async function findMarket(app: FastifyInstance, slug: string) {
  const [row] = await app.db.select().from(markets).innerJoin(claims, eq(markets.claimId, claims.id)).where(eq(markets.slug, slug));
  return row;
}

export async function marketRoutes(app: FastifyInstance) {
  app.get("/categories", async () => {
    const r = await app.db.select({ category: claims.category, count: sql<number>`count(*)::int` }).from(claims).groupBy(claims.category).orderBy(claims.category);
    return r;
  });

  app.get("/markets", async (req) => {
    const q = z
      .object({
        q: z.string().max(100).optional(),
        category: z.string().max(32).optional(),
        sort: z.enum(["volume", "probability", "new", "activity", "liquidity"]).default("activity"),
      })
      .parse(req.query);
    const where = and(
      q.category ? eq(claims.category, q.category) : undefined,
      q.q ? or(ilike(claims.title, `%${q.q}%`), ilike(claims.subject, `%${q.q}%`)) : undefined,
    );
    const order =
      q.sort === "volume" ? desc(markets.volume) : q.sort === "probability" ? desc(markets.priceYesPpm) : q.sort === "new" ? desc(markets.createdAt) : q.sort === "liquidity" ? desc(markets.sets) : desc(markets.updatedAt);
    const rows = await app.db.select().from(markets).innerJoin(claims, eq(markets.claimId, claims.id)).where(where).orderBy(order).limit(100);
    const stats = await statsByMarket(app);
    return { markets: rows.map((r) => present(r.markets, r.claims, stats.get(r.markets.id))) };
  });

  app.get("/markets/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await findMarket(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const stats = await statsByMarket(app);
    const related = await app.db
      .select()
      .from(markets)
      .innerJoin(claims, eq(markets.claimId, claims.id))
      .where(and(eq(claims.category, row.claims.category), sql`${markets.id} <> ${row.markets.id}`))
      .orderBy(desc(markets.volume))
      .limit(4);
    return {
      market: present(row.markets, row.claims, stats.get(row.markets.id)),
      claim: row.claims,
      related: related.map((r) => present(r.markets, r.claims, stats.get(r.markets.id))),
    };
  });

  app.get("/markets/:slug/history", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const { range } = z.object({ range: z.enum(["24h", "7d", "30d", "all"]).default("all") }).parse(req.query);
    const row = await findMarket(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const since = range === "all" ? new Date(0) : new Date(Date.now() - { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 }[range]);
    const points = await app.db
      .select({ t: marketSnapshots.takenAt, p: marketSnapshots.priceYesPpm, v: marketSnapshots.volume, cause: marketSnapshots.cause })
      .from(marketSnapshots)
      .where(and(eq(marketSnapshots.marketId, row.markets.id), gte(marketSnapshots.takenAt, since)))
      .orderBy(asc(marketSnapshots.takenAt))
      .limit(5000);
    return { points };
  });

  app.get("/markets/:slug/trades", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const { limit, before } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.coerce.date().optional() }).parse(req.query);
    const row = await findMarket(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const list = await app.db
      .select()
      .from(trades)
      .where(and(eq(trades.marketId, row.markets.id), before ? lt(trades.createdAt, before) : undefined))
      .orderBy(desc(trades.createdAt))
      .limit(limit);
    return { trades: list };
  });

  /** Execution quote from current pool state (same integer math as the contract). */
  app.post("/markets/:slug/quote", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const body = z.object({ side: SideZ, outcome: OutcomeZ, amount: Amount, slippageBps: z.number().int().min(0).max(5000).default(100) }).parse(req.body);
    const row = await findMarket(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const m = row.markets;
    const q = quote({ yes: m.poolYes, no: m.poolNo }, body.side, body.outcome as Outcome, body.amount, BigInt(m.feeBps));
    const out = "sharesOut" in q ? q.sharesOut : q.collateralOut;
    const minOut = (out * (BPS - BigInt(body.slippageBps))) / BPS;
    const impact = q.priceAfterPpm - q.priceBeforePpm;
    return {
      quote: {
        side: body.side,
        outcome: body.outcome,
        amountIn: body.amount,
        fee: q.fee,
        amountOut: out,
        avgPricePpm: q.avgPricePpm,
        priceBeforePpm: q.priceBeforePpm,
        priceAfterPpm: q.priceAfterPpm,
        priceImpactPpm: impact < 0n ? -impact : impact,
        minAmountOut: minOut,
        slippageBps: body.slippageBps,
        poolAfter: q.poolAfter,
        marketVersion: m.version,
        executionMode: m.executionMode,
        quotedAt: new Date().toISOString(),
      },
    };
  });

  /** Execute a trade on the SIMULATED ledger. On-chain markets are traded via wallet-signed txs. */
  app.post("/markets/:slug/trades", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await app.requireSession(req, reply);
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const body = z
      .object({
        side: SideZ,
        outcome: OutcomeZ,
        amount: Amount,
        minOut: z.string().regex(/^\d{1,39}$/).transform((v) => BigInt(v)),
        clientOrderId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
      })
      .parse(req.body);
    const row = await findMarket(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const res = await executeSimulatedTrade(app.db, {
      marketId: row.markets.id,
      traderAccount: s.accountId,
      actorKind: "HUMAN",
      userId: s.userId,
      side: body.side,
      outcome: body.outcome,
      amount: body.amount,
      minOut: body.minOut,
      clientOrderId: body.clientOrderId,
    });
    return reply.code(201).send({ trade: res.trade, market: { probabilityYesPpm: res.market.priceYesPpm, poolYes: res.market.poolYes, poolNo: res.market.poolNo }, position: res.position });
  });

  /** Positions currently held in a market, split human/agent (public). */
  app.get("/markets/:slug/holders", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const row = await findMarket(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const list = await app.db
      .select({ traderAccount: positions.traderAccount, actorKind: positions.actorKind, yesShares: positions.yesShares, noShares: positions.noShares })
      .from(positions)
      .where(and(eq(positions.marketId, row.markets.id), sql`(${positions.yesShares} > 0 or ${positions.noShares} > 0)`))
      .orderBy(desc(sql`${positions.yesShares} + ${positions.noShares}`))
      .limit(50);
    return { holders: list };
  });
}
