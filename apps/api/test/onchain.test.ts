import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quoteBuy, quoteSell, seedPool } from "@quire/shared";
import { setupTestApp, TEST_DB_URL } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";

const CONTRACT = "quire-markets.testnet";
const OWNER = "owner.testnet";
const H = (n: number) => "1".repeat(43) + String.fromCharCode(64 + n); // valid-looking base58 hashes

/** Fake NEAR RPC: maps tx hash -> result. */
const txs = new Map<string, unknown>();
const ev = (event: string, data: object) => `EVENT_JSON:${JSON.stringify({ standard: "quire", version: "1.0.0", event, data: [data] })}`;
const tx = (hash: string, signer: string, logs: string[], opts: { receiver?: string; fail?: boolean } = {}) =>
  txs.set(hash, {
    status: opts.fail ? { Failure: {} } : { SuccessValue: "" },
    transaction: { signer_id: signer, receiver_id: opts.receiver ?? CONTRACT, hash },
    receipts_outcome: [{ outcome: { executor_id: opts.receiver ?? CONTRACT, status: { SuccessValue: "" }, logs } }],
  });
const fakeFetch = (async (_url: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body));
  const result = body.method === "tx" ? txs.get(body.params.tx_hash) : undefined;
  return new Response(JSON.stringify(result ? { result } : { error: { cause: { name: "UNKNOWN_TRANSACTION" } } }), { status: 200 });
}) as typeof fetch;

let base: Awaited<ReturnType<typeof setupTestApp>>;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  base = await setupTestApp();
  const cfg = { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: false, QUIRE_EXECUTION_MODE: "ONCHAIN_TESTNET" as const, QUIRE_MARKET_CONTRACT: CONTRACT, NEAR_NETWORK: "testnet" as const };
  app = await buildApp(base.db, cfg, { chainFetch: fakeFetch });
});
afterAll(async () => {
  await app.close();
  await base.app.close();
  await base.pool.end();
});

describe("on-chain ingestion", () => {
  const L = 400_000n; // 0.4 NEAR
  const seed = seedPool(L, 500_000n);
  let pool = seed.pool;

  it("registers a market from the owner's create_market transaction", async () => {
    tx(H(1), OWNER, [ev("market_created", { market_id: 0, slug: "near-10-usd", question: "Will NEAR trade above $10?", category: "near", liquidity: `${L}`, fee_bps: 100, pool_yes: `${pool.yes}`, pool_no: `${pool.no}`, lp_yes: "0", lp_no: "0", price_yes_ppm: "500000" })]);
    const r = await app.inject({ method: "POST", url: "/onchain/markets", payload: { txHash: H(1), signerId: OWNER, subject: "NEAR", description: "Whether NEAR trades above $10.", resolutionCriteria: "Resolves YES on a daily close above $10." } });
    expect(r.statusCode).toBe(201);
    const m = (await app.inject({ method: "GET", url: "/markets/near-10-usd" })).json().market;
    expect(m.executionMode).toBe("ONCHAIN_TESTNET");
    expect(m.onchainId).toBe(0);
    expect(m.liquidity).toBe("400000");
    // same hash again is a no-op
    const again = await app.inject({ method: "POST", url: "/onchain/markets", payload: { txHash: H(1), signerId: OWNER, subject: "x", description: "x", resolutionCriteria: "x" } });
    expect(again.statusCode).toBe(200);
  });

  it("mirrors a wallet-signed buy exactly, once", async () => {
    const q = quoteBuy(pool, "YES", 100_000n, 100n);
    pool = q.poolAfter;
    tx(H(2), "quiredemo1.testnet", [ev("trade", { market_id: 0, account_id: "quiredemo1.testnet", is_agent: false, side: "BUY", outcome: "YES", collateral: "100000", shares: `${q.sharesOut}`, fee: `${q.fee}`, pool_yes: `${pool.yes}`, pool_no: `${pool.no}`, price_yes_ppm: "0", client_order_id: "abc12345" })]);
    const r = await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: H(2), signerId: "quiredemo1.testnet" } });
    expect(r.statusCode).toBe(201);
    expect(r.json().trades[0].trade.executionMode).toBe("ONCHAIN_TESTNET");
    expect(r.json().trades[0].trade.shares).toBe(`${q.sharesOut}`);
    const dup = await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: H(2), signerId: "quiredemo1.testnet" } });
    expect(dup.statusCode).toBe(200);
    expect(dup.json().alreadyIngested).toBe(true);
    const m = (await app.inject({ method: "GET", url: "/markets/near-10-usd" })).json().market;
    expect(m.tradeCount).toBe(1);
    expect(m.poolYes).toBe(`${pool.yes}`);
    expect(m.probabilityYesPpm).toBeGreaterThan(500_000);
    // portfolio is readable by account id in on-chain mode
    const pf = (await app.inject({ method: "GET", url: "/portfolio?account=quiredemo1.testnet" })).json();
    expect(pf.positions[0].yesShares).toBe(`${q.sharesOut}`);
    expect(pf.positions[0].costBasis).toBe("100000");
  });

  it("mirrors a sell and keeps the books solvent", async () => {
    const held = BigInt((await app.inject({ method: "GET", url: "/portfolio?account=quiredemo1.testnet" })).json().positions[0].yesShares);
    const q = quoteSell(pool, "YES", held, 100n);
    pool = q.poolAfter;
    tx(H(3), "quiredemo1.testnet", [ev("trade", { market_id: 0, account_id: "quiredemo1.testnet", is_agent: false, side: "SELL", outcome: "YES", collateral: `${q.collateralOut}`, shares: `${held}`, fee: `${q.fee}`, pool_yes: `${pool.yes}`, pool_no: `${pool.no}`, price_yes_ppm: "0", client_order_id: null })]);
    const r = await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: H(3), signerId: "quiredemo1.testnet" } });
    expect(r.statusCode).toBe(201);
    const m = (await app.inject({ method: "GET", url: "/markets/near-10-usd" })).json().market;
    expect(BigInt(m.poolYes)).toBe(BigInt(m.liquidity)); // all shares back in the pool
    expect(BigInt(m.poolNo)).toBe(BigInt(m.liquidity));
  });

  it("rejects failed, foreign and unknown transactions", async () => {
    tx(H(4), "x.testnet", [], { fail: true });
    tx(H(5), "x.testnet", [ev("trade", {})], { receiver: "evil.testnet" });
    expect((await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: H(4), signerId: "x.testnet" } })).json().error).toBe("TX_FAILED");
    expect((await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: H(5), signerId: "x.testnet" } })).json().error).toBe("WRONG_CONTRACT");
    expect((await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: H(6), signerId: "x.testnet" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/onchain/trades", payload: { txHash: "not-a-hash", signerId: "x.testnet" } })).statusCode).toBe(400);
  });

  it("simulated trading endpoints refuse on-chain markets", async () => {
    const r = await app.inject({ method: "POST", url: "/markets/near-10-usd/trades", payload: {} });
    expect(r.statusCode).toBe(401);
  });
});
