import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { fund, login, setupTestApp } from "./helpers.js";
import { markets, positions } from "../src/db/schema.js";
import { executeSimulatedTrade, TradeError } from "../src/market/engine.js";

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
const SLUG = "btc-above-150k";
const oid = () => randomUUID().replace(/-/g, "");

beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.pool.end();
});

async function solvency(slug: string) {
  const [m] = await ctx.db.select().from(markets).where(eq(markets.slug, slug));
  const [agg] = (
    await ctx.db.execute<{ y: string; n: string }>(
      sql`select coalesce(sum(yes_shares),0)::text as y, coalesce(sum(no_shares),0)::text as n from positions where market_id = ${m!.id}`,
    )
  ).rows;
  return { sets: m!.sets, yes: m!.poolYes + BigInt(agg!.y), no: m!.poolNo + BigInt(agg!.n) };
}

describe("markets API", () => {
  it("lists seeded markets with string-encoded amounts", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/markets" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.markets.length).toBe(5);
    expect(typeof body.markets[0].liquidity).toBe("string");
    expect(body.markets[0].executionMode).toBe("SIMULATED");
  });

  it("quotes without mutating state", async () => {
    const r = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/quote`, payload: { side: "BUY", outcome: "YES", amount: "100", slippageBps: 100 } });
    expect(r.statusCode).toBe(200);
    const q = r.json().quote;
    expect(q.fee).toBe("1000000");
    expect(BigInt(q.minAmountOut) < BigInt(q.amountOut)).toBe(true);
    expect(Number(q.priceAfterPpm)).toBeGreaterThan(Number(q.priceBeforePpm));
    const m = (await ctx.app.inject({ method: "GET", url: `/markets/${SLUG}` })).json().market;
    expect(m.tradeCount).toBe(0);
  });

  it("rejects float-ish and malformed amounts", async () => {
    for (const amount of ["1e3", "-5", "0", "1.0000001", "abc"]) {
      const r = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/quote`, payload: { side: "BUY", outcome: "YES", amount } });
      expect(r.statusCode, amount).toBe(400);
    }
  });
});

describe("trading", () => {
  it("requires authentication", async () => {
    const r = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, payload: { side: "BUY", outcome: "YES", amount: "10", minOut: "0", clientOrderId: oid() } });
    expect(r.statusCode).toBe(401);
  });

  it("buy -> position, balance, probability and history update; sell realises PnL", async () => {
    const h = await login(ctx.app, "alice");
    const q = (await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/quote`, payload: { side: "BUY", outcome: "YES", amount: "100" } })).json().quote;
    const r = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: { side: "BUY", outcome: "YES", amount: "100", minOut: q.minAmountOut, clientOrderId: oid() } });
    expect(r.statusCode).toBe(201);
    const t = r.json();
    expect(t.trade.shares).toBe(q.amountOut);
    expect(t.market.probabilityYesPpm).toBe(Number(q.priceAfterPpm));

    const pf = (await ctx.app.inject({ method: "GET", url: "/portfolio", headers: h })).json();
    expect(pf.balances[0].available).toBe("900000000");
    expect(pf.positions[0].yesShares).toBe(q.amountOut);
    expect(pf.positions[0].costBasis).toBe("100000000");
    expect(BigInt(pf.positions[0].liquidationValue) < BigInt(pf.positions[0].markValue)).toBe(true);
    expect(pf.trades.length).toBe(1);

    const hist = (await ctx.app.inject({ method: "GET", url: `/markets/${SLUG}/history` })).json().points;
    expect(hist.length).toBe(2);

    const sell = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: { side: "SELL", outcome: "YES", amount: (Number(q.amountOut) / 1e6).toFixed(6), minOut: "0", clientOrderId: oid() } });
    expect(sell.statusCode).toBe(201);
    const pf2 = (await ctx.app.inject({ method: "GET", url: "/portfolio", headers: h })).json();
    expect(pf2.positions[0].yesShares).toBe("0");
    expect(BigInt(pf2.positions[0].realizedPnl) < 0n).toBe(true); // fees + spread on an immediate round trip
    const s = await solvency(SLUG);
    expect(s.yes).toBe(s.sets);
    expect(s.no).toBe(s.sets);
  });

  it("rejects a reused client order id (duplicate execution)", async () => {
    const h = await login(ctx.app, "bob");
    const id = oid();
    const p = { side: "BUY", outcome: "NO", amount: "5", minOut: "0", clientOrderId: id };
    expect((await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: p })).statusCode).toBe(201);
    const dup = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: p });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe("DUPLICATE_ORDER");
  });

  it("enforces slippage, balance and share checks", async () => {
    const h = await login(ctx.app, "carol");
    const slip = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: { side: "BUY", outcome: "YES", amount: "10", minOut: "999999999999", clientOrderId: oid() } });
    expect(slip.json().error).toBe("SLIPPAGE");
    const broke = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: { side: "BUY", outcome: "YES", amount: "1001", minOut: "0", clientOrderId: oid() } });
    expect(broke.json().error).toBe("INSUFFICIENT_BALANCE");
    const noShares = await ctx.app.inject({ method: "POST", url: `/markets/${SLUG}/trades`, headers: h, payload: { side: "SELL", outcome: "NO", amount: "1", minOut: "0", clientOrderId: oid() } });
    expect(noShares.json().error).toBe("INSUFFICIENT_SHARES");
  });

  it("faucet is once per day", async () => {
    const h = await login(ctx.app, "dave");
    const again = await ctx.app.inject({ method: "POST", url: "/faucet", headers: h });
    expect(again.statusCode).toBe(429);
  });

  it("concurrent trades serialise correctly and stay solvent", async () => {
    const [m] = await ctx.db.select().from(markets).where(eq(markets.slug, "near-intents-100b-volume"));
    const traders = ["t1", "t2", "t3", "t4"];
    for (const t of traders) await fund(ctx.db, `${t}.sim`, 1_000_000_000n);
    const jobs = Array.from({ length: 40 }, (_, i) =>
      executeSimulatedTrade(ctx.db, {
        marketId: m!.id,
        traderAccount: `${traders[i % 4]}.sim`,
        actorKind: "HUMAN",
        side: "BUY",
        outcome: i % 3 === 0 ? "NO" : "YES",
        amount: 7_000_000n + BigInt(i) * 100_000n,
        minOut: 0n,
        clientOrderId: `c${i}-${oid()}`,
      }),
    );
    const res = await Promise.allSettled(jobs);
    const failed = res.filter((r) => r.status === "rejected");
    expect(failed).toEqual([]);
    const [after] = await ctx.db.select().from(markets).where(eq(markets.id, m!.id));
    expect(after!.tradeCount).toBe(40);
    const s = await solvency("near-intents-100b-volume");
    expect(s.yes).toBe(s.sets);
    expect(s.no).toBe(s.sets);
    const totalIn = jobs.length === 40 ? Array.from({ length: 40 }, (_, i) => 7_000_000n + BigInt(i) * 100_000n).reduce((a, b) => a + b) : 0n;
    expect(after!.sets + after!.fees).toBe(5_000_000_000n + totalIn);
  });

  it("the same concurrent duplicate order id executes exactly once", async () => {
    const [m] = await ctx.db.select().from(markets).where(eq(markets.slug, "open-model-arc-agi-2-85"));
    await fund(ctx.db, "eve.sim", 1_000_000_000n);
    const id = oid();
    const res = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        executeSimulatedTrade(ctx.db, { marketId: m!.id, traderAccount: "eve.sim", actorKind: "HUMAN", side: "BUY", outcome: "YES", amount: 1_000_000n, minOut: 0n, clientOrderId: id }),
      ),
    );
    expect(res.filter((r) => r.status === "fulfilled").length).toBe(1);
    for (const r of res) if (r.status === "rejected") expect((r.reason as TradeError).code).toBe("DUPLICATE_ORDER");
    const [p] = await ctx.db.select().from(positions).where(and(eq(positions.marketId, m!.id), eq(positions.traderAccount, "eve.sim")));
    expect(p!.yesShares > 0n).toBe(true);
  });
});
