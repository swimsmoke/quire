import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { pnlByMarket } from "../market/pnl.js";
import {
  agentActivities,
  agentPermissions,
  agents,
  agentStrategies,
  aiInferences,
  articleRevisions,
  claims,
  encyclopediaPages,
  evidence,
  markets,
  trades,
  positions,
} from "../db/schema.js";

async function marketBySlug(app: FastifyInstance, slug: string) {
  const [row] = await app.db.select().from(markets).innerJoin(claims, eq(markets.claimId, claims.id)).where(eq(markets.slug, slug));
  return row;
}

/** Public metadata about an inference. Raw prompts are never exposed. */
function inferenceMeta(i: typeof aiInferences.$inferSelect | null) {
  if (!i) return null;
  return {
    id: i.id,
    mode: i.mode,
    provider: i.provider,
    model: i.model,
    chatId: i.chatId,
    requestHash: i.requestHash,
    responseHash: i.responseHash,
    signatureText: i.signatureText,
    signature: i.signature,
    signingAddress: i.signingAddress,
    signingAlgo: i.signingAlgo,
    signatureVerified: i.signatureVerified,
    attestationBindsSigner: i.attestationBindsSigner,
    attestationNonce: i.attestationNonce,
    createdAt: i.createdAt,
  };
}

export async function knowledgeRoutes(app: FastifyInstance) {
  /** Recent trading activity across all markets (homepage feed). */
  app.get("/activity", async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(15) }).parse(req.query);
    const rows = await app.db
      .select({ trade: trades, slug: markets.slug, question: claims.title, agentName: agents.name, agentSlug: agents.slug })
      .from(trades)
      .innerJoin(markets, eq(trades.marketId, markets.id))
      .innerJoin(claims, eq(markets.claimId, claims.id))
      .leftJoin(agents, eq(trades.agentId, agents.id))
      .orderBy(desc(trades.createdAt))
      .limit(limit);
    return { activity: rows.map((r) => ({ ...r.trade, slug: r.slug, question: r.question, agentName: r.agentName, agentSlug: r.agentSlug })) };
  });

  app.get("/markets/:slug/encyclopedia", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const [page] = await app.db.select().from(encyclopediaPages).where(eq(encyclopediaPages.claimId, row.claims.id));
    if (!page) return { page: null, current: null, revisions: [] };
    const revisions = await app.db
      .select({
        id: articleRevisions.id,
        revisionNumber: articleRevisions.revisionNumber,
        priceYesPpm: articleRevisions.priceYesPpm,
        triggerReason: articleRevisions.triggerReason,
        createdAt: articleRevisions.createdAt,
      })
      .from(articleRevisions)
      .where(eq(articleRevisions.pageId, page.id))
      .orderBy(desc(articleRevisions.revisionNumber));
    let current = null;
    if (page.currentRevisionId) {
      const [rev] = await app.db
        .select()
        .from(articleRevisions)
        .leftJoin(aiInferences, eq(articleRevisions.inferenceId, aiInferences.id))
        .where(eq(articleRevisions.id, page.currentRevisionId));
      if (rev) current = { ...rev.article_revisions, inference: inferenceMeta(rev.ai_inferences) };
    }
    return { page, current, revisions };
  });

  app.get("/markets/:slug/encyclopedia/revisions/:n", async (req, reply) => {
    const { slug, n } = z.object({ slug: z.string(), n: z.coerce.number().int().min(1) }).parse(req.params);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const [rev] = await app.db
      .select()
      .from(articleRevisions)
      .innerJoin(encyclopediaPages, eq(articleRevisions.pageId, encyclopediaPages.id))
      .leftJoin(aiInferences, eq(articleRevisions.inferenceId, aiInferences.id))
      .where(and(eq(encyclopediaPages.claimId, row.claims.id), eq(articleRevisions.revisionNumber, n)));
    if (!rev) return reply.code(404).send({ error: "REVISION_NOT_FOUND" });
    return { revision: { ...rev.article_revisions, inference: inferenceMeta(rev.ai_inferences) } };
  });

  app.get("/markets/:slug/evidence", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const list = await app.db
      .select({ e: evidence, agentName: agents.name, agentSlug: agents.slug })
      .from(evidence)
      .leftJoin(agents, eq(evidence.submittedByAgentId, agents.id))
      .where(eq(evidence.claimId, row.claims.id))
      .orderBy(desc(evidence.createdAt));
    return { evidence: list.map((r) => ({ ...r.e, agentName: r.agentName, agentSlug: r.agentSlug })) };
  });

  app.get("/markets/:slug/agent-activity", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const list = await app.db
      .select({ a: agentActivities, agentName: agents.name, agentSlug: agents.slug, role: agents.role })
      .from(agentActivities)
      .innerJoin(agents, eq(agentActivities.agentId, agents.id))
      .where(eq(agentActivities.marketId, row.markets.id))
      .orderBy(desc(agentActivities.createdAt))
      .limit(30);
    return { activity: list.map((r) => ({ ...r.a, agentName: r.agentName, agentSlug: r.agentSlug, role: r.role })) };
  });

  /** Traders ranked by trading profit (same measure as profiles): cash from trades plus shares held at today's price. */
  app.get("/leaderboard", async () => {
    const mode = app.cfg.QUIRE_EXECUTION_MODE;
    const rows = await app.db.select({ t: trades, priceNow: markets.priceYesPpm }).from(trades).innerJoin(markets, eq(trades.marketId, markets.id)).where(eq(trades.executionMode, mode));
    const by = new Map<string, typeof rows>();
    for (const r of rows) by.set(r.t.traderAccount, [...(by.get(r.t.traderAccount) ?? []), r]);
    const list = [...by.entries()].map(([account, rs]) => {
      const pnl = pnlByMarket(rs.map((r) => r.t), new Map(rs.map((r) => [r.t.marketId, r.priceNow]))).reduce((s, m) => s + m.pnl, 0n);
      return { account, actorKind: rs[0]!.t.actorKind, pnl: pnl.toString(), trades: rs.length, markets: new Set(rs.map((r) => r.t.marketId)).size, volume: rs.reduce((s, r) => s + r.t.collateral, 0n).toString() };
    });
    list.sort((a, b) => (BigInt(b.pnl) > BigInt(a.pnl) ? 1 : BigInt(b.pnl) < BigInt(a.pnl) ? -1 : b.trades - a.trades));
    return { leaderboard: list.slice(0, 50) };
  });

  app.get("/agents", async () => {
    const list = await app.db.select().from(agents).orderBy(agents.createdAt);
    const ids = list.map((a) => a.id);
    if (ids.length === 0) return { agents: [] };
    const perms = await app.db.select().from(agentPermissions).where(inArray(agentPermissions.agentId, ids));
    const strategies = await app.db.select().from(agentStrategies).where(and(inArray(agentStrategies.agentId, ids), eq(agentStrategies.active, true)));
    const stats = await app.db.execute<{ agent_id: string; activity: number; trades: number; volume: string; last_at: Date | null }>(sql`
      select a.id as agent_id,
        (select count(*) from agent_activities x where x.agent_id = a.id)::int as activity,
        (select count(*) from trades t where t.agent_id = a.id)::int as trades,
        coalesce((select sum(t.collateral) from trades t where t.agent_id = a.id), 0)::text as volume,
        (select max(x.created_at) from agent_activities x where x.agent_id = a.id) as last_at
      from agents a`);
    const byId = new Map(stats.rows.map((s) => [s.agent_id, s]));
    return {
      agents: list.map((a) => ({
        ...a,
        permissions: perms.filter((p) => p.agentId === a.id).map((p) => p.permission),
        strategy: strategies.find((s) => s.agentId === a.id) ?? null,
        stats: { activityCount: byId.get(a.id)?.activity ?? 0, tradeCount: byId.get(a.id)?.trades ?? 0, volume: byId.get(a.id)?.volume ?? "0", lastActiveAt: byId.get(a.id)?.last_at ?? null },
      })),
    };
  });

  app.get("/agents/:slug/activity", async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const [a] = await app.db.select().from(agents).where(eq(agents.slug, slug));
    if (!a) return reply.code(404).send({ error: "AGENT_NOT_FOUND" });
    const list = await app.db
      .select({ x: agentActivities, slug: markets.slug })
      .from(agentActivities)
      .leftJoin(markets, eq(agentActivities.marketId, markets.id))
      .where(eq(agentActivities.agentId, a.id))
      .orderBy(desc(agentActivities.createdAt))
      .limit(50);
    return { activity: list.map((r) => ({ ...r.x, marketSlug: r.slug })) };
  });
}
