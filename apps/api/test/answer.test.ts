import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { setupTestApp, TEST_DB_URL } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { parseAnswer } from "../src/routes/answer.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tee = privateKeyToAccount(generatePrivateKey());
let reply = "";
let calls = 0;
const store = new Map<string, { req: string; resp: string }>();
const aiFetch = (async (url: unknown, init?: { body?: unknown }) => {
  const u = String(url);
  if (u.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "deepseek-ai/Test" }] }));
  if (u.endsWith("/chat/completions")) {
    calls++;
    const req = String(init?.body);
    const id = `a-${calls}`;
    const resp = JSON.stringify({ id, choices: [{ message: { content: reply } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    store.set(id, { req, resp });
    return new Response(resp);
  }
  if (u.includes("/signature/")) {
    const s = store.get(decodeURIComponent(u.split("/signature/")[1]!.split("?")[0]!))!;
    const text = `deepseek-ai/Test:${sha(s.req)}:${sha(s.resp)}`;
    return new Response(JSON.stringify({ text, signature: await tee.signMessage({ message: text }), signing_address: tee.address, signing_algo: "ecdsa" }));
  }
  if (u.includes("/attestation/report")) return new Response(JSON.stringify({ model_attestations: [{ signing_address: tee.address }] }));
  return new Response("{}", { status: 404 });
}) as typeof fetch;
const wiki = (async (url: unknown) => {
  const u = String(url);
  if (u.includes("list=search")) return new Response(JSON.stringify({ query: { search: [{ title: "2026 FIFA World Cup" }] } }));
  return new Response(JSON.stringify({ query: { pages: { "1": { title: "2026 FIFA World Cup", fullurl: "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup", extract: "The 2026 FIFA World Cup was held in North America. Spain won the 2026 FIFA World Cup final against Argentina. The tournament had 48 teams." } } } }));
}) as typeof fetch;

let base: Awaited<ReturnType<typeof setupTestApp>>;
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  base = await setupTestApp();
  app = await buildApp(base.db, { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: true, QUIRE_EXECUTION_MODE: "SIMULATED" as const, NEAR_AI_API_KEY: "sk-test" }, { aiFetch, webFetch: wiki });
});
afterAll(async () => {
  await app.close();
  await base.app.close();
  await base.pool.end();
});

describe("answer desk", () => {
  it("answers a settled question from cited passages, with a verified signature", async () => {
    reply = JSON.stringify({ status: "ANSWERED", verdict: "YES", answer: "Yes. Spain won the final against Argentina.", citations: ["E1"] });
    const r = await app.inject({ method: "POST", url: "/ai/answer", payload: { question: "Did Spain win the 2026 FIFA World Cup?" } });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j).toMatchObject({ status: "ANSWERED", verdict: "YES", signatureVerified: true });
    expect(j.sources[0]).toMatchObject({ url: "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup" });
    expect(j.sources[0].quote).toContain("Spain");
  });
  it("serves a repeated question from cache", async () => {
    const before = calls;
    const r = await app.inject({ method: "POST", url: "/ai/answer", payload: { question: "did spain win the 2026 FIFA World Cup?" } });
    expect(r.json().cached).toBe(true);
    expect(calls).toBe(before);
  });
  it("marks future questions as open", async () => {
    reply = JSON.stringify({ status: "OPEN", verdict: null, answer: "The 2030 final has not been played yet.", citations: [] });
    const r = await app.inject({ method: "POST", url: "/ai/answer", payload: { question: "Will Spain win the 2030 FIFA World Cup?" } });
    expect(r.json()).toMatchObject({ status: "OPEN", verdict: null });
  });
  it("refuses an uncited answer", () => {
    expect(parseAnswer('{"status":"ANSWERED","verdict":"NO","answer":"No.","citations":["E9"]}', new Set(["E1"])).status).toBe("UNKNOWN");
  });
});
