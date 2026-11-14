import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { and, eq } from "drizzle-orm";
import { login, setupTestApp, TEST_DB_URL } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { accountBalances, markets, rulings } from "../src/db/schema.js";
import { parseVote, tally } from "../src/jury/jury.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tee = privateKeyToAccount(generatePrivateKey());
const SLUG = "btc-above-150k";
const PAGE = `<html><head><title>Bitcoin price</title></head><body><p>Bitcoin traded above $150,000 on major exchanges on 12 November 2026.</p></body></html>`;
const MODELS = ["deepseek-ai/Judge-A", "Qwen/Judge-B", "zai-org/GLM-Judge-C"];

/** Verdict each juror returns, by model. */
let ballot: Record<string, string> = {};
const store = new Map<string, { req: string; resp: string; model: string }>();
let calls = 0;
const aiFetch = (async (url: unknown, init?: { body?: unknown }) => {
  const u = String(url);
  if (u.endsWith("/models")) return new Response(JSON.stringify({ data: MODELS.map((id) => ({ id })) }));
  if (u.endsWith("/chat/completions")) {
    const req = String(init?.body);
    const model = JSON.parse(req).model as string;
    const verdict = ballot[model] ?? "NOT_YET";
    const content = JSON.stringify({ verdict, confidence: 0.8, reasoning: `Ruled ${verdict} from the quote.`, citations: verdict === "NOT_YET" ? [] : ["E1"] });
    const id = `jury-${++calls}`;
    const resp = JSON.stringify({ id, model, choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
    store.set(id, { req, resp, model });
    return new Response(resp);
  }
  if (u.includes("/signature/")) {
    const id = decodeURIComponent(u.split("/signature/")[1]!.split("?")[0]!);
    const s = store.get(id)!;
    const text = `${s.model}:${sha(s.req)}:${sha(s.resp)}`;
    return new Response(JSON.stringify({ text, signature: await tee.signMessage({ message: text }), signing_address: tee.address, signing_algo: "ecdsa" }));
  }
  if (u.includes("/attestation/report")) return new Response(JSON.stringify({ model_attestations: [{ signing_address: tee.address }] }));
  return new Response("not found", { status: 404 });
}) as typeof fetch;
const webFetch = (async () => new Response(PAGE, { headers: { "content-type": "text/html" } })) as typeof fetch;

let base: Awaited<ReturnType<typeof setupTestApp>>;
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  base = await setupTestApp();
  app = await buildApp(base.db, { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: true, QUIRE_EXECUTION_MODE: "SIMULATED" as const, NEAR_AI_API_KEY: "sk-test", JURY_COOLDOWN_S: 0, JURY_CHALLENGE_S: 600 }, { aiFetch, webFetch });
});
afterAll(async () => {
  await app.close();
  await base.app.close();
  await base.pool.end();
});

const post = (url: string, headers?: Record<string, string>, payload?: object) => app.inject({ method: "POST", url, headers, payload });
const balance = async (acct: string) => (await base.db.select().from(accountBalances).where(and(eq(accountBalances.traderAccount, acct), eq(accountBalances.executionMode, "SIMULATED"))))[0]!.available;
const closeWindow = async () => base.db.update(rulings).set({ challengeEndsAt: new Date(Date.now() - 1000) });

describe("jury rules", () => {
  it("counts two matching decisive verdicts as a ruling", () => {
    expect(tally(["YES", "YES", "NO"]).verdict).toBe("YES");
    expect(tally(["YES", "NO", "NOT_YET"]).verdict).toBe("NOT_YET");
    expect(tally(["INVALID", null, "INVALID"]).verdict).toBe("INVALID");
    expect(tally([null, null, "YES"]).verdict).toBe("NOT_YET");
  });
  it("turns an uncited YES into NOT_YET and drops invented citations", () => {
    const keys = new Set(["E1"]);
    expect(parseVote('```json\n{"verdict":"YES","confidence":0.9,"reasoning":"x","citations":["E7"]}\n```', keys).verdict).toBe("NOT_YET");
    expect(parseVote('<think>hmm</think>{"verdict":"NO","confidence":0.6,"reasoning":"x","citations":["E1"]}', keys)).toMatchObject({ verdict: "NO", citations: ["E1"] });
  });
});

describe("AI jury settlement (simulated ledger)", () => {
  let alice: Record<string, string>;
  let bob: Record<string, string>;

  it("refuses to rule without checked sources", async () => {
    const r = await post(`/markets/${SLUG}/jury`);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("NO_EVIDENCE");
  });

  it("proposes a majority ruling and stops trading", async () => {
    const e = await post(`/markets/${SLUG}/evidence`, undefined, { url: "https://example.org/btc", excerpt: "Bitcoin traded above $150,000 on major exchanges on 12 November 2026", stance: "SUPPORTS" });
    expect(e.json().check.status).toBe("EXCERPT_VERIFIED");
    alice = await login(app, "alice-jury");
    bob = await login(app, "bob-jury");
    const t = await post(`/markets/${SLUG}/trades`, alice, { side: "BUY", outcome: "NO", amount: "50", minOut: "1", clientOrderId: "jury-alice-1" });
    expect(t.statusCode, t.body).toBe(201);

    ballot = { [MODELS[0]!]: "YES", [MODELS[1]!]: "YES", [MODELS[2]!]: "NO" };
    const r = await post(`/markets/${SLUG}/jury`);
    expect(r.statusCode).toBe(201);
    const j = r.json();
    expect(j).toMatchObject({ verdict: "YES", outcome: "PROPOSED", stage: "CHALLENGE_WINDOW" });
    expect(j.votes).toHaveLength(3);
    expect(new Set(j.votes.map((v: { model: string }) => v.model)).size).toBe(3);
    expect(j.votes.every((v: { signatureVerified: boolean }) => v.signatureVerified)).toBe(true);
    expect(j.votes[0].citations[0]).toMatchObject({ key: "E1", url: "https://example.org/btc" });

    const blocked = await post(`/markets/${SLUG}/trades`, alice, { side: "BUY", outcome: "YES", amount: "1", minOut: "1", clientOrderId: "jury-alice-2" });
    expect(blocked.statusCode).toBe(409);
    const again = await post(`/markets/${SLUG}/jury`);
    expect(again.statusCode).toBe(409);
  });

  it("lets anyone dispute with a bond, reopening the market", async () => {
    const before = await balance("bob-jury.sim");
    const d = await post(`/markets/${SLUG}/dispute`, bob);
    expect(d.statusCode).toBe(200);
    expect(await balance("bob-jury.sim")).toBe(before - 500_000n);
    const [m] = await base.db.select().from(markets).where(eq(markets.slug, SLUG));
    expect(m!.status).toBe("ACTIVE");
    const ruling = (await app.inject({ url: `/markets/${SLUG}/ruling` })).json().ruling;
    expect(ruling).toMatchObject({ stage: "DISPUTED", disputedBy: "bob-jury.sim" });
  });

  it("refunds an upheld dispute when the jury changes its ruling, then settles and pays winners", async () => {
    const before = await balance("bob-jury.sim");
    ballot = { [MODELS[0]!]: "NO", [MODELS[1]!]: "NO", [MODELS[2]!]: "NO" };
    const r = await post(`/markets/${SLUG}/jury`);
    expect(r.json()).toMatchObject({ verdict: "NO", outcome: "PROPOSED" });
    expect(await balance("bob-jury.sim")).toBe(before + 500_000n);

    const early = await post(`/markets/${SLUG}/finalize`);
    expect(early.statusCode).toBe(409);
    await closeWindow();
    const f = await post(`/markets/${SLUG}/finalize`);
    expect(f.json()).toMatchObject({ ok: true, status: "RESOLVED_NO" });

    const aliceBefore = await balance("alice-jury.sim");
    const red = await post(`/markets/${SLUG}/redeem`, alice);
    const payout = BigInt(red.json().payout);
    expect(payout).toBeGreaterThan(50_000_000n);
    expect(await balance("alice-jury.sim")).toBe(aliceBefore + payout);
    expect(BigInt((await post(`/markets/${SLUG}/redeem`, alice)).json().payout)).toBe(0n);

    const results = (await app.inject({ url: "/results" })).json();
    expect(results.results[0]).toMatchObject({ verdict: "NO", stage: "SETTLED", market: { slug: SLUG } });
  });

  it("records a split jury as no ruling and leaves the market open", async () => {
    ballot = { [MODELS[0]!]: "YES", [MODELS[1]!]: "NO", [MODELS[2]!]: "NOT_YET" };
    const slug = "eth-glamsterdam-mainnet";
    await post(`/markets/${slug}/evidence`, undefined, { url: "https://example.org/eth", excerpt: "Bitcoin traded above $150,000 on major exchanges on 12 November 2026", stance: "CONTEXT" });
    const r = await post(`/markets/${slug}/jury`, { "x-quire-internal": app.internalKey });
    expect(r.json()).toMatchObject({ verdict: "NOT_YET", outcome: "NO_RULING", stage: "NO_RULING" });
    const [m] = await base.db.select().from(markets).where(eq(markets.slug, slug));
    expect(m!.status).toBe("ACTIVE");
  });
});
