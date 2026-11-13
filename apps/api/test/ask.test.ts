import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fund, setupTestApp, TEST_DB_URL } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { executeSimulatedTrade } from "../src/market/engine.js";
import { markets } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const SLUG = "btc-above-150k";
const WIKI = "https://en.wikipedia.org/wiki/Bitcoin";
const ON_PAGE = "In 2025 bitcoin traded above $120,000 for the first time on major exchanges.";
const ON_PAGE_2 = "Bitcoin's price has been volatile, with several drawdowns of more than 50% since 2011.";
const NOT_ON_PAGE = "Analysts said bitcoin would reach $150,000 within the year, according to a forecast.";
const OFF_TOPIC = "The protocol was described in a white paper published under a pseudonym.";
const EXTRACT = [OFF_TOPIC, ON_PAGE, NOT_ON_PAGE, ON_PAGE_2].join(" ");
let draftReply = JSON.stringify({ question: "Will Bitcoin trade above $150,000?", subject: "Bitcoin", category: "crypto", description: "Whether BTC trades above $150,000 on major exchanges.", resolutionCriteria: "Resolves YES when BTC/USD closes above $150,000 on a major exchange. Open until then." });

const aiFetch = (async (url: unknown) => {
  const u = String(url);
  if (u.endsWith("/chat/completions")) return new Response(JSON.stringify({ id: "c1", choices: [{ message: { content: draftReply } }] }));
  if (u.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "deepseek-ai/Test-Model" }] }));
  return new Response("{}", { status: 404 });
}) as typeof fetch;
const webFetch = (async (url: unknown) => {
  const u = String(url);
  if (u.includes("list=search")) return new Response(JSON.stringify({ query: { search: [{ title: "Bitcoin" }] } }));
  if (u.includes("prop=extracts")) return new Response(JSON.stringify({ query: { pages: { "1": { title: "Bitcoin", extract: EXTRACT, fullurl: WIKI } } } }));
  // the article as served: footnote markers in the HTML, and without the forecast sentence
  return new Response(`<html><title>Bitcoin - Wikipedia</title><body><p>${OFF_TOPIC}</p><p>${ON_PAGE.replace("time", "time<sup class=\"reference\">[12]</sup>")}</p><p>${ON_PAGE_2}</p></body></html>`, { headers: { "content-type": "text/html" } });
}) as typeof fetch;

let base: Awaited<ReturnType<typeof setupTestApp>>;
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  base = await setupTestApp();
  app = await buildApp(base.db, { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: true, QUIRE_EXECUTION_MODE: "SIMULATED" as const, NEAR_AI_API_KEY: "sk-test" }, { aiFetch, webFetch });
});
afterAll(async () => {
  await app.close();
  await base.app.close();
  await base.pool.end();
});

describe("asking a question", () => {
  it("drafts a claim from a rough question", async () => {
    const r = await app.inject({ method: "POST", url: "/ai/draft-claim", payload: { question: "is btc going to 150k?" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().draft.subject).toBe("Bitcoin");
    expect(r.json().draft.category).toBe("crypto");
  });
  it("does not pass on a draft that is not the expected shape", async () => {
    const keep = draftReply;
    draftReply = "I think yes!";
    const r = await app.inject({ method: "POST", url: "/ai/draft-claim", payload: { question: "is btc going to 150k?" } });
    expect(r.statusCode).toBe(502);
    draftReply = keep;
  });
  it("Scout picks sentences about the claim, keeps only quotes that are on the page, and leaves no failed quotes behind", async () => {
    const r = await app.inject({ method: "POST", url: `/markets/${SLUG}/research` });
    expect(r.statusCode).toBe(200);
    expect(r.json().verified).toBe(2);
    const ev = (await app.inject({ method: "GET", url: `/markets/${SLUG}/evidence` })).json().evidence as { excerpt: string; checkStatus: string }[];
    const excerpts = ev.map((e) => e.excerpt);
    expect(excerpts).toContain(ON_PAGE); // the most relevant sentence, despite the footnote marker
    expect(excerpts).not.toContain(NOT_ON_PAGE); // never submitted, so no "not found" clutter
    expect(excerpts).not.toContain(OFF_TOPIC); // shares no word with the claim
    const again = await app.inject({ method: "POST", url: `/markets/${SLUG}/research` });
    expect(again.json().verified).toBe(0); // the same quotes are not added twice
  });
});

describe("creating a market (simulated)", () => {
  it("finds the claim that already covers a question, however it is worded", async () => {
    const r = (await app.inject({ method: "GET", url: `/markets?q=${encodeURIComponent("is bitcoin going over 150k soon")}` })).json().markets;
    expect(r[0].slug).toBe(SLUG);
    const none = (await app.inject({ method: "GET", url: `/markets?q=${encodeURIComponent("volcano eruption iceland")}` })).json().markets;
    expect(none).toHaveLength(0);
  });
  it("anyone signed in can open a market, paid from their own balance", async () => {
    const login = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { handle: "asker" } });
    const token = login.json().token as string;
    const headers = { authorization: `Bearer ${token}` };
    const body = { slug: "iceland-eruption", question: "Will a volcano erupt in Iceland?", subject: "Volcanism of Iceland", category: "science", description: "d", resolutionCriteria: "r", initialProbPpm: 500_000, liquidity: "1" };
    const broke = await app.inject({ method: "POST", url: "/markets", headers, payload: body });
    expect(broke.statusCode).toBe(422);
    await fund(base.db, "asker.sim", 5_000_000n);
    const small = await app.inject({ method: "POST", url: "/markets", headers, payload: { ...body, liquidity: "0.05" } });
    expect(small.json().error).toBe("LIQUIDITY_TOO_LOW");
    const ok = await app.inject({ method: "POST", url: "/markets", headers, payload: body });
    expect(ok.statusCode).toBe(201);
    const m = (await app.inject({ method: "GET", url: "/markets/iceland-eruption" })).json();
    expect(m.market.probabilityYesPpm).toBe(500_000);
    const again = await app.inject({ method: "POST", url: "/markets", headers, payload: body });
    expect(again.json().slug).not.toBe("iceland-eruption"); // same name does not overwrite
    const noAuth = await app.inject({ method: "POST", url: "/markets", payload: body });
    expect(noAuth.statusCode).toBe(401);
  });
});

describe("leaderboard", () => {
  it("ranks traders by profit and leaves out accounts that never traded", async () => {
    const [m] = await base.db.select().from(markets).where(eq(markets.slug, SLUG));
    await fund(base.db, "winner.test", 50_000_000n);
    await fund(base.db, "loser.test", 50_000_000n);
    await fund(base.db, "idle.test", 50_000_000n);
    // winner buys YES first, loser pushes the price further up and pays more for it
    await executeSimulatedTrade(base.db, { marketId: m!.id, traderAccount: "winner.test", actorKind: "HUMAN", side: "BUY", outcome: "YES", amount: 5_000_000n, minOut: 0n, clientOrderId: "lb-1" });
    await executeSimulatedTrade(base.db, { marketId: m!.id, traderAccount: "loser.test", actorKind: "HUMAN", side: "BUY", outcome: "NO", amount: 1_000_000n, minOut: 0n, clientOrderId: "lb-2" });
    await executeSimulatedTrade(base.db, { marketId: m!.id, traderAccount: "winner.test", actorKind: "HUMAN", side: "BUY", outcome: "YES", amount: 5_000_000n, minOut: 0n, clientOrderId: "lb-3" });
    const lb = (await app.inject({ method: "GET", url: "/leaderboard" })).json().leaderboard as { account: string; pnl: string; trades: number }[];
    const names = lb.map((x) => x.account);
    expect(names).not.toContain("idle.test");
    expect(names.indexOf("loser.test")).toBeGreaterThan(-1);
    expect(lb.find((x) => x.account === "winner.test")!.trades).toBe(2);
    for (let i = 1; i < lb.length; i++) expect(BigInt(lb[i - 1]!.pnl) >= BigInt(lb[i]!.pnl)).toBe(true);
  });
});
