import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fund, setupTestApp, TEST_DB_URL } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { executeSimulatedTrade } from "../src/market/engine.js";
import { markets } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { clearTokenCache, toBaseUnits } from "../src/near/intents.js";
import { pnlByMarket } from "../src/market/pnl.js";

const TOKENS = [
  { assetId: "nep141:wrap.near", symbol: "wNEAR", blockchain: "near", decimals: 24, price: 2.5, priceUpdatedAt: "", contractAddress: "wrap.near" },
  { assetId: "nep141:base-usdc.omft.near", symbol: "USDC", blockchain: "base", decimals: 6, price: 1, priceUpdatedAt: "", contractAddress: "0x" },
  { assetId: "nep141:sui-thing.omft.near", symbol: "SUI", blockchain: "sui", decimals: 9, price: 3, priceUpdatedAt: "", contractAddress: "0x" },
];
let quoteBodies: Record<string, unknown>[] = [];
let quoteStatus = 200;
const intentsFetch = (async (url: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
  const u = String(url);
  if (u.endsWith("/v0/tokens")) return new Response(JSON.stringify(TOKENS));
  if (u.endsWith("/v0/quote")) {
    const b = JSON.parse(String(init?.body));
    quoteBodies.push({ ...b, _key: init?.headers?.["x-api-key"] });
    if (quoteStatus !== 200) return new Response(JSON.stringify({ message: "amount is too low" }), { status: quoteStatus });
    return new Response(JSON.stringify({ quote: { amountIn: b.amount, amountInFormatted: "10", amountInUsd: "10.00", minAmountIn: b.amount, amountOut: "3990000000000000000000000", amountOutFormatted: "3.99", amountOutUsd: "9.97", minAmountOut: "3950000000000000000000000", timeEstimate: 25 } }));
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

let base: Awaited<ReturnType<typeof setupTestApp>>;
let app: Awaited<ReturnType<typeof buildApp>>;
let keyless: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  base = await setupTestApp();
  const cfg = { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: true, QUIRE_EXECUTION_MODE: "SIMULATED" as const };
  app = await buildApp(base.db, { ...cfg, ONECLICK_API_KEY: "key-123" }, { intentsFetch });
  keyless = await buildApp(base.db, { ...cfg, ONECLICK_API_KEY: undefined, ONECLICK_JWT: undefined }, { intentsFetch });
});
afterAll(async () => {
  await app.close();
  await keyless.close();
  await base.app.close();
  await base.pool.end();
});
beforeEach(() => {
  clearTokenCache();
  quoteBodies = [];
  quoteStatus = 200;
});

describe("profit", () => {
  it("is cash from trades plus shares at today's price", () => {
    const at = new Date();
    const r = pnlByMarket(
      [
        { marketId: "m", side: "BUY", outcome: "YES", collateral: 100n, shares: 200n, priceAfterPpm: 520_000, createdAt: at },
        { marketId: "m", side: "SELL", outcome: "YES", collateral: 70n, shares: 100n, priceAfterPpm: 500_000, createdAt: at },
      ],
      new Map([["m", 600_000]]),
    );
    expect(r[0]!.value).toBe(60n); // 100 YES at 0.60
    expect(r[0]!.pnl).toBe(30n); // -100 + 70 + 60
  });
});

describe("profiles", () => {
  it("shows stats, rank, positions, activity and a profit series", async () => {
    const [m] = await base.db.select().from(markets).where(eq(markets.slug, "btc-above-150k"));
    await fund(base.db, "early.test", 50_000_000n);
    await fund(base.db, "late.test", 900_000_000n);
    await executeSimulatedTrade(base.db, { marketId: m!.id, traderAccount: "early.test", actorKind: "HUMAN", side: "BUY", outcome: "YES", amount: 5_000_000n, minOut: 0n, clientOrderId: "pf-1" });
    await executeSimulatedTrade(base.db, { marketId: m!.id, traderAccount: "late.test", actorKind: "HUMAN", side: "BUY", outcome: "YES", amount: 600_000_000n, minOut: 0n, clientOrderId: "pf-2" });
    const p = (await app.inject({ method: "GET", url: "/profile/early.test" })).json();
    expect(p.stats.marketsTraded).toBe(1);
    expect(p.stats.trades).toBe(1);
    expect(BigInt(p.stats.totalPnl)).toBeGreaterThan(0n); // bought before the price rose
    expect(p.stats.biggestWin).toBe(p.stats.totalPnl);
    expect(p.positions).toHaveLength(1);
    expect(p.activity[0].side).toBe("BUY");
    expect(p.pnl.length).toBeGreaterThanOrEqual(2);
    expect(p.pnl[0].pnl).toBe("0");
    expect(p.pnl[p.pnl.length - 1].pnl).toBe(p.stats.totalPnl);
    const late = (await app.inject({ method: "GET", url: "/profile/late.test" })).json();
    // higher profit, better rank
    expect(BigInt(p.stats.totalPnl) > BigInt(late.stats.totalPnl)).toBe(p.rank < late.rank);
    // the leaderboard uses the same number
    const lb = (await app.inject({ method: "GET", url: "/leaderboard" })).json().leaderboard;
    expect(lb.find((x: { account: string }) => x.account === "early.test").pnl).toBe(p.stats.totalPnl);
  });
  it("404s for an account with no activity", async () => {
    expect((await app.inject({ method: "GET", url: "/profile/nobody.test" })).statusCode).toBe(404);
  });
});

describe("funding from other chains (NEAR Intents)", () => {
  it("converts amounts to base units without rounding errors", () => {
    expect(toBaseUnits("10", 6)).toBe("10000000");
    expect(toBaseUnits("0.1", 18)).toBe("100000000000000000");
    expect(toBaseUnits("1.23456789", 6)).toBe("1234567");
  });
  it("lists only funding assets on supported chains", async () => {
    const r = (await app.inject({ method: "GET", url: "/intents/tokens" })).json();
    expect(r.tokens.map((t: { symbol: string }) => t.symbol)).toEqual(["USDC"]);
    expect(r.nearPrice).toBe(2.5);
    expect(r.available).toBe(false); // testnet deployment
  });
  it("asks 1Click for a dry quote only", async () => {
    const r = (await app.inject({ method: "GET", url: "/intents/quote?asset=nep141:base-usdc.omft.near&amount=10" })).json();
    expect(r.quote.source).toBe("ONECLICK_QUOTE");
    expect(r.quote.amountOutNear).toBe("3.9900");
    expect(r.quote.minAmountOutNear).toBe("3.9500");
    expect(quoteBodies[0]).toMatchObject({ dry: true, destinationAsset: "nep141:wrap.near", amount: "10000000", _key: "key-123" });
  });
  it("falls back to a labelled price estimate when there is no key or 1Click refuses", async () => {
    const a = (await keyless.inject({ method: "GET", url: "/intents/quote?asset=nep141:base-usdc.omft.near&amount=10" })).json();
    expect(a.quote.source).toBe("PRICE_ESTIMATE");
    expect(a.quote.amountOutNear).toBe("4.0000");
    expect(quoteBodies).toHaveLength(0);
    quoteStatus = 400;
    const b = (await app.inject({ method: "GET", url: "/intents/quote?asset=nep141:base-usdc.omft.near&amount=10" })).json();
    expect(b.quote.source).toBe("PRICE_ESTIMATE");
    expect(b.quote.note).toContain("amount is too low");
  });
  it("rejects unknown assets and bad amounts", async () => {
    expect((await app.inject({ method: "GET", url: "/intents/quote?asset=nep141:nope&amount=1" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/intents/quote?asset=nep141:base-usdc.omft.near&amount=-1" })).statusCode).toBe(400);
  });
});
