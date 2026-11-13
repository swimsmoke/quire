import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { agents, claims, markets, marketSnapshots, trades, users } from "../db/schema.js";
import { pnlByMarket, pnlSeries } from "../market/pnl.js";

/** Public trader profile: trades are public on the tape, so anyone can view any account. */
export async function profileRoutes(app: FastifyInstance) {
  app.get("/profile/:account", async (req, reply) => {
    const { account } = z.object({ account: z.string().regex(/^[a-z0-9._-]{2,64}$/) }).parse(req.params);
    const mode = app.cfg.QUIRE_EXECUTION_MODE;
    const rows = await app.db
      .select({ t: trades, slug: markets.slug, question: claims.title, priceNow: markets.priceYesPpm, agentName: agents.name })
      .from(trades)
      .innerJoin(markets, eq(trades.marketId, markets.id))
      .innerJoin(claims, eq(markets.claimId, claims.id))
      .leftJoin(agents, eq(trades.agentId, agents.id))
      .where(and(eq(trades.traderAccount, account), eq(trades.executionMode, mode)))
      .orderBy(trades.createdAt);
    const created = await app.db
      .select({ slug: markets.slug, question: claims.title, probabilityYesPpm: markets.priceYesPpm, createdAt: markets.createdAt, volume: markets.volume })
      .from(markets)
      .innerJoin(claims, eq(markets.claimId, claims.id))
      .where(and(eq(markets.lpAccount, account), eq(markets.executionMode, mode)))
      .orderBy(desc(markets.createdAt));
    const [user] = await app.db.select().from(users).where(eq(users.nearAccountId, account));
    if (!rows.length && !created.length && !user) return reply.code(404).send({ error: "NOT_FOUND", message: "No activity for this account yet" });

    const ts = rows.map((r) => r.t);
    const priceNow = new Map(rows.map((r) => [r.t.marketId, r.priceNow]));
    const perMarket = pnlByMarket(ts, priceNow);
    const info = new Map(rows.map((r) => [r.t.marketId, { slug: r.slug, question: r.question, probabilityYesPpm: r.priceNow }]));
    const marketIds = [...priceNow.keys()];
    const firstAt = ts[0]?.createdAt;
    const snaps =
      marketIds.length && firstAt
        ? await app.db
            .select({ marketId: marketSnapshots.marketId, priceYesPpm: marketSnapshots.priceYesPpm, at: marketSnapshots.takenAt })
            .from(marketSnapshots)
            .where(and(inArray(marketSnapshots.marketId, marketIds), gte(marketSnapshots.takenAt, firstAt)))
        : [];

    // rank among everyone who has traded in this mode, by the same profit measure
    const all = await app.db.select({ trader: trades.traderAccount, t: trades, priceNow: markets.priceYesPpm }).from(trades).innerJoin(markets, eq(trades.marketId, markets.id)).where(eq(trades.executionMode, mode));
    const byTrader = new Map<string, typeof all>();
    for (const r of all) byTrader.set(r.trader, [...(byTrader.get(r.trader) ?? []), r]);
    const totals = [...byTrader.entries()].map(([a, rs]) => ({ a, pnl: pnlByMarket(rs.map((r) => r.t), new Map(rs.map((r) => [r.t.marketId, r.priceNow]))).reduce((s, m) => s + m.pnl, 0n) }));
    totals.sort((x, y) => (y.pnl > x.pnl ? 1 : y.pnl < x.pnl ? -1 : 0));
    const rank = totals.findIndex((x) => x.a === account);

    const totalPnl = perMarket.reduce((s, m) => s + m.pnl, 0n);
    const best = perMarket.reduce((b, m) => (m.pnl > b ? m.pnl : b), 0n);
    return {
      account,
      actorKind: ts[0]?.actorKind ?? "HUMAN",
      agentName: rows.find((r) => r.agentName)?.agentName ?? null,
      joinedAt: [user?.createdAt, firstAt, created[created.length - 1]?.createdAt].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null,
      rank: rank >= 0 ? rank + 1 : null,
      traders: totals.length,
      stats: {
        positionsValue: perMarket.reduce((s, m) => s + m.value, 0n).toString(),
        biggestWin: best.toString(),
        marketsTraded: perMarket.length,
        totalPnl: totalPnl.toString(),
        totalVolume: ts.reduce((s, t) => s + t.collateral, 0n).toString(),
        trades: ts.length,
        marketsCreated: created.length,
      },
      pnl: pnlSeries(ts, snaps, new Date()),
      positions: perMarket
        .filter((m) => m.yes > 0n || m.no > 0n)
        .map((m) => ({ ...info.get(m.marketId)!, yesShares: m.yes.toString(), noShares: m.no.toString(), value: m.value.toString(), pnl: m.pnl.toString() }))
        .sort((a, b) => Number(BigInt(b.value) - BigInt(a.value))),
      activity: rows
        .slice(-50)
        .reverse()
        .map((r) => ({ id: r.t.id, slug: r.slug, question: r.question, side: r.t.side, outcome: r.t.outcome, collateral: r.t.collateral.toString(), shares: r.t.shares.toString(), avgPricePpm: r.t.avgPricePpm, createdAt: r.t.createdAt, executionMode: r.t.executionMode })),
      created: created.map((c) => ({ ...c, volume: c.volume.toString() })),
    };
  });
}
