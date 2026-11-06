import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { login, setupTestApp } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { ctx = await setupTestApp(); });
afterAll(async () => { await ctx.app.close(); await ctx.pool.end(); });

describe("read APIs", () => {
  it("lists agents with roles, permissions and the trading strategy", async () => {
    const r = (await ctx.app.inject({ method: "GET", url: "/agents" })).json();
    expect(r.agents.map((a: { role: string }) => a.role).sort()).toEqual(["ANALYSIS", "KNOWLEDGE", "RESEARCH", "TRADING"]);
    const arbiter = r.agents.find((a: { slug: string }) => a.slug === "arbiter");
    expect(arbiter.permissions).toEqual(["TRADE"]);
    expect(arbiter.strategy.params.maxTrade).toBe("25000000");
  });
  it("encyclopedia is honestly empty before any generation", async () => {
    const r = (await ctx.app.inject({ method: "GET", url: "/markets/btc-above-150k/encyclopedia" })).json();
    expect(r.page).not.toBeNull();
    expect(r.current).toBeNull();
    expect(r.revisions).toEqual([]);
  });
  it("activity feed reflects trades", async () => {
    const h = await login(ctx.app, "feed");
    await ctx.app.inject({ method: "POST", url: "/markets/btc-above-150k/trades", headers: h, payload: { side: "BUY", outcome: "NO", amount: "12", minOut: "0", clientOrderId: "feed-order-0001" } });
    const r = (await ctx.app.inject({ method: "GET", url: "/activity" })).json();
    expect(r.activity[0].slug).toBe("btc-above-150k");
    expect(r.activity[0].traderAccount).toBe("feed.sim");
  });
  it("evidence and agent activity are empty lists, 404 for unknown market", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/markets/btc-above-150k/evidence" })).json().evidence).toEqual([]);
    expect((await ctx.app.inject({ method: "GET", url: "/markets/nope/evidence" })).statusCode).toBe(404);
  });
});
