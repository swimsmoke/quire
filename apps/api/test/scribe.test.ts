import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { fund, setupTestApp, TEST_DB_URL } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { executeSimulatedTrade } from "../src/market/engine.js";
import { markets } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tee = privateKeyToAccount(generatePrivateKey());
const SLUG = "btc-above-150k";
const PAGE = `<html><head><title>Bitcoin - Example</title></head><body><p>Bitcoin reached a new all&nbsp;time high above $120,000 in 2025, according to exchange data.</p><script>ignored()</script></body></html>`;

let mode: "good" | "invented-citation" | "garbage" | "tampered" = "good";
let calls = 0;
const article = (cite: string[]) =>
  JSON.stringify(Object.fromEntries(["overview", "background", "consensus", "supporting", "contradicting", "uncertainties", "history", "changes"].map((k) => [k, { body: `Text for ${k}.`, citations: k === "supporting" ? cite : [] }])));

const store = new Map<string, { req: string; resp: string }>();
const aiFetch = (async (url: unknown, init?: { body?: unknown }) => {
  const u = String(url);
  if (u.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "deepseek-ai/Test-Model" }] }));
  if (u.endsWith("/chat/completions")) {
    calls++;
    const req = String(init?.body);
    const content = mode === "garbage" ? "Sure! Here is your article:" : "```json\n" + article(mode === "invented-citation" ? ["E1", "E9"] : ["E1"]) + "\n```";
    const id = `chat-${calls}`;
    const resp = JSON.stringify({ id, choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
    store.set(id, { req, resp });
    return new Response(resp);
  }
  if (u.includes("/signature/")) {
    const id = decodeURIComponent(u.split("/signature/")[1]!.split("?")[0]!);
    const s = store.get(id)!;
    const text = `deepseek-ai/Test-Model:${sha(mode === "tampered" ? s.req + "x" : s.req)}:${sha(s.resp)}`;
    return new Response(JSON.stringify({ text, signature: await tee.signMessage({ message: text }), signing_address: tee.address, signing_algo: "ecdsa" }));
  }
  if (u.includes("/attestation/report")) return new Response(JSON.stringify({ model_attestations: [{ signing_address: tee.address }] }));
  return new Response("not found", { status: 404 });
}) as typeof fetch;
const webFetch = (async (url: unknown) => (String(url).includes("missing") ? new Response("gone", { status: 404 }) : new Response(PAGE, { headers: { "content-type": "text/html" } }))) as typeof fetch;

let base: Awaited<ReturnType<typeof setupTestApp>>;
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  base = await setupTestApp();
  app = await buildApp(base.db, { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: true, QUIRE_EXECUTION_MODE: "SIMULATED" as const, NEAR_AI_API_KEY: "sk-test", ARTICLE_MIN_INTERVAL_S: 0, ARTICLE_MIN_MOVE_PPM: 30_000 }, { aiFetch, webFetch });
});
afterAll(async () => {
  await app.close();
  await base.app.close();
  await base.pool.end();
});

const post = (url: string, payload?: object) => app.inject({ method: "POST", url, payload });

describe("evidence checking (Scout)", () => {
  it("verifies a quote that is on the page, ignoring markup and entities", async () => {
    const r = await post(`/markets/${SLUG}/evidence`, { url: "https://example.org/btc", excerpt: "Bitcoin reached a new all time high above $120,000 in 2025", stance: "SUPPORTS" });
    expect(r.statusCode).toBe(201);
    expect(r.json().check.status).toBe("EXCERPT_VERIFIED");
    expect(r.json().evidence.title).toBe("Bitcoin - Example");
    expect(r.json().evidence.contentHash).toBe(sha(PAGE));
  });
  it("marks a quote that is not on the page, and unreachable pages", async () => {
    const a = await post(`/markets/${SLUG}/evidence`, { url: "https://example.org/btc", excerpt: "Bitcoin will certainly reach one million dollars", stance: "SUPPORTS" });
    expect(a.json().check.status).toBe("EXCERPT_NOT_FOUND");
    const b = await post(`/markets/${SLUG}/evidence`, { url: "https://example.org/missing", excerpt: "Bitcoin reached a new all time high", stance: "CONTEXT" });
    expect(b.json().check.status).toBe("FETCH_FAILED");
  });
  it("rejects duplicates and non-public addresses", async () => {
    const dup = await post(`/markets/${SLUG}/evidence`, { url: "https://example.org/btc", excerpt: "Bitcoin reached a new all time high above $120,000 in 2025", stance: "SUPPORTS" });
    expect(dup.statusCode).toBe(409);
    const { checkEvidence } = await import("../src/ai/evidence-check.js");
    expect((await checkEvidence("http://example.org/x", "some long enough quote here")).status).toBe("FETCH_FAILED");
    expect((await checkEvidence("https://127.0.0.1/x", "some long enough quote here")).status).toBe("FETCH_FAILED");
    expect((await checkEvidence("https://localhost/x", "some long enough quote here")).status).toBe("FETCH_FAILED");
  });
});

describe("encyclopedia generation (Scribe)", () => {
  it("writes revision 1 from live state, citing only verified evidence, with a verified signature", async () => {
    const r = await post(`/markets/${SLUG}/encyclopedia/generate`);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ revisionNumber: 1, trigger: "First revision", signatureVerified: true, attestationBindsSigner: true, model: "deepseek-ai/Test-Model" });
    const e = (await app.inject({ method: "GET", url: `/markets/${SLUG}/encyclopedia` })).json();
    expect(e.current.revisionNumber).toBe(1);
    expect(e.current.inference.signatureVerified).toBe(true);
    expect(e.current.inference.signingAddress).toBe(tee.address);
    const ev = (await app.inject({ method: "GET", url: `/markets/${SLUG}/evidence` })).json().evidence;
    const verifiedId = ev.find((x: { verificationStatus: string }) => x.verificationStatus === "EXCERPT_VERIFIED").id;
    expect(e.current.content.supporting.citations).toEqual([verifiedId]);
    expect(e.current.evidenceIds).toEqual([verifiedId]); // unverified quotes never reach the writer
    const sent = JSON.parse(JSON.parse([...store.values()][0]!.req).messages[1].content);
    expect(sent.evidence).toHaveLength(1);
    expect(sent.market.yesProbability).toBe("50.0%");
  });

  it("does not regenerate when nothing material changed", async () => {
    const r = await post(`/markets/${SLUG}/encyclopedia/generate`);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("NOT_DUE");
  });

  it("regenerates after a material price move, keeps revision 1, and drops invented citations", async () => {
    const [m] = await base.db.select().from(markets).where(eq(markets.slug, SLUG));
    await fund(base.db, "mover.sim", 1_000_000_000n);
    await executeSimulatedTrade(base.db, { marketId: m!.id, traderAccount: "mover.sim", actorKind: "HUMAN", side: "BUY", outcome: "YES", amount: 600_000_000n, minOut: 0n, clientOrderId: "move-0001" });
    mode = "invented-citation";
    const r = await post(`/markets/${SLUG}/encyclopedia/generate`);
    expect(r.statusCode).toBe(201);
    expect(r.json().revisionNumber).toBe(2);
    expect(r.json().trigger).toMatch(/^Yes moved/);
    expect(r.json().droppedCitations).toEqual(["E9"]);
    const e = (await app.inject({ method: "GET", url: `/markets/${SLUG}/encyclopedia` })).json();
    expect(e.revisions.map((x: { revisionNumber: number }) => x.revisionNumber)).toEqual([2, 1]);
    const old = (await app.inject({ method: "GET", url: `/markets/${SLUG}/encyclopedia/revisions/1` })).json();
    expect(old.revision.priceYesPpm).toBe(500_000);
    mode = "good";
  });

  it("flags a signature that does not cover the bytes we sent", async () => {
    mode = "tampered";
    const r = await post(`/markets/eth-glamsterdam-mainnet/encyclopedia/generate`);
    expect(r.statusCode).toBe(201);
    expect(r.json().signatureVerified).toBe(false);
    mode = "good";
  });

  it("refuses malformed model output after one retry and publishes nothing", async () => {
    mode = "garbage";
    const before = calls;
    const r = await post(`/markets/near-intents-100b-volume/encyclopedia/generate`);
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toBe("INVALID_OUTPUT");
    expect(calls - before).toBe(2);
    const e = (await app.inject({ method: "GET", url: `/markets/near-intents-100b-volume/encyclopedia` })).json();
    expect(e.current).toBeNull();
    mode = "good";
  });

  it("logs real agent activity", async () => {
    const agents = (await app.inject({ method: "GET", url: "/agents" })).json().agents;
    expect(agents.find((a: { slug: string }) => a.slug === "scribe").stats.activityCount).toBe(3);
    expect(agents.find((a: { slug: string }) => a.slug === "scout").stats.activityCount).toBe(3);
  });
});
