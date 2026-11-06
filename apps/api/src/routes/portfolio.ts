import type { FastifyInstance } from "fastify";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { liquidationValue, markValue, PRICE_SCALE } from "@quire/shared";
import { accountBalances, claims, fundingRequests, markets, positions, trades } from "../db/schema.js";

export async function portfolioRoutes(app: FastifyInstance) {
  app.get("/portfolio", async (req, reply) => {
    const s = await app.requireSession(req, reply);
    const balances = await app.db.select().from(accountBalances).where(eq(accountBalances.traderAccount, s.accountId));
    const rows = await app.db
      .select()
      .from(positions)
      .innerJoin(markets, eq(positions.marketId, markets.id))
      .innerJoin(claims, eq(markets.claimId, claims.id))
      .where(and(eq(positions.traderAccount, s.accountId), or(sql`${positions.yesShares} > 0`, sql`${positions.noShares} > 0`, sql`${positions.realizedPnl} <> '0'`)));

    const out = rows.map(({ positions: p, markets: m, claims: c }) => {
      const pool = { yes: m.poolYes, no: m.poolNo };
      const pYes = BigInt(m.priceYesPpm);
      const pNo = PRICE_SCALE - pYes;
      const mark = markValue(p.yesShares, pYes) + markValue(p.noShares, pNo);
      const liq = liquidationValue(pool, "YES", p.yesShares, BigInt(m.feeBps)) + liquidationValue(pool, "NO", p.noShares, BigInt(m.feeBps));
      const cost = p.yesCost + p.noCost;
      return {
        market: { slug: m.slug, question: c.title, probabilityYesPpm: m.priceYesPpm, status: m.status, executionMode: m.executionMode },
        yesShares: p.yesShares,
        noShares: p.noShares,
        costBasis: cost,
        markValue: mark, // shares x implied probability
        liquidationValue: liq, // what selling everything now would actually pay (impact + fees)
        unrealizedPnl: (mark - cost).toString(),
        realizedPnl: p.realizedPnl,
      };
    });
    const totals = out.reduce(
      (a, p) => ({ cost: a.cost + p.costBasis, mark: a.mark + p.markValue, liq: a.liq + p.liquidationValue }),
      { cost: 0n, mark: 0n, liq: 0n },
    );
    const history = await app.db
      .select({ trade: trades, slug: markets.slug, question: claims.title })
      .from(trades)
      .innerJoin(markets, eq(trades.marketId, markets.id))
      .innerJoin(claims, eq(markets.claimId, claims.id))
      .where(eq(trades.traderAccount, s.accountId))
      .orderBy(desc(trades.createdAt))
      .limit(100);
    const funding = await app.db.select().from(fundingRequests).where(eq(fundingRequests.userId, s.userId)).orderBy(desc(fundingRequests.createdAt)).limit(50);
    return {
      accountId: s.accountId,
      balances,
      positions: out,
      totals: { costBasis: totals.cost, markValue: totals.mark, liquidationValue: totals.liq, unrealizedPnl: (totals.mark - totals.cost).toString() },
      trades: history.map((h) => ({ ...h.trade, slug: h.slug, question: h.question })),
      funding,
    };
  });
}
