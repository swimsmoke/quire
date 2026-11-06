/**
 * Seeds example claims/markets and the agent roster.
 * Initial probabilities are the liquidity provider's STARTING PRICE, not a
 * forecast; the market moves them from there.
 */
import { eq } from "drizzle-orm";
import { parseUnits } from "@quire/shared";
import type { DB } from "./client.js";
import { agentPermissions, agents, agentStrategies, markets } from "./schema.js";
import { createMarket, type NewMarketInput } from "../market/create.js";

export const LP_ACCOUNT = "quire-lp.sim";

type Seed = Omit<NewMarketInput, "lpAccount" | "executionMode" | "liquidity" | "feeBps"> & { liquidity?: string };

export const SEED_MARKETS: Seed[] = [
  {
    slug: "btc-above-150k",
    title: "Will Bitcoin trade above $150,000?",
    subject: "Bitcoin",
    category: "crypto",
    description: "Whether the BTC/USD spot price prints above $150,000 on a major spot exchange.",
    resolutionCriteria:
      "Resolves YES once the BTC/USD daily close on Coinbase exceeds $150,000. As a perpetual market it stays open until that happens or the claim is invalidated.",
    initialProbPpm: 500_000n,
  },
  {
    slug: "eth-glamsterdam-mainnet",
    title: "Will Ethereum activate the Glamsterdam upgrade on mainnet?",
    subject: "Ethereum",
    category: "crypto",
    description: "Whether the Ethereum network upgrade known as Glamsterdam is activated on Ethereum mainnet.",
    resolutionCriteria: "Resolves YES when the upgrade is live on mainnet per the Ethereum Foundation blog or client release notes.",
    initialProbPpm: 500_000n,
  },
  {
    slug: "near-intents-100b-volume",
    title: "Will NEAR Intents reach $100B cumulative swap volume?",
    subject: "NEAR Intents",
    category: "near",
    description: "Whether cumulative volume settled through NEAR Intents reaches $100 billion.",
    resolutionCriteria: "Resolves YES when the NEAR Intents explorer or an official NEAR Foundation source reports cumulative volume of at least $100B.",
    initialProbPpm: 500_000n,
  },
  {
    slug: "open-model-arc-agi-2-85",
    title: "Will an open-weights AI model score 85% or higher on ARC-AGI-2?",
    subject: "ARC-AGI-2",
    category: "ai",
    description: "Whether a model with publicly released weights reaches at least 85% on the ARC-AGI-2 private evaluation set.",
    resolutionCriteria: "Resolves YES on a verified ARC Prize leaderboard entry of at least 85% by a model with downloadable weights.",
    initialProbPpm: 500_000n,
  },
  {
    slug: "near-ai-cloud-confidential-default",
    title: "Will NEAR AI Cloud offer more than 25 confidential (TEE) models?",
    subject: "NEAR AI Cloud",
    category: "ai",
    description: "Whether the number of models NEAR AI Cloud serves inside TEEs exceeds 25.",
    resolutionCriteria: "Resolves YES when cloud.near.ai or official docs list more than 25 models running in confidential mode.",
    initialProbPpm: 500_000n,
  },
];

export const SEED_AGENTS = [
  {
    slug: "scout",
    name: "Scout",
    role: "RESEARCH" as const,
    description: "Finds sources for a claim, extracts verbatim excerpts, and submits them as evidence. Every excerpt is checked against the fetched page by Quire, not by the model.",
    permissions: ["SUBMIT_EVIDENCE"],
  },
  {
    slug: "assessor",
    name: "Assessor",
    role: "ANALYSIS" as const,
    description: "Weighs submitted evidence against the current market price and produces a structured, cited analysis with an independent probability estimate.",
    permissions: ["ANALYSE"],
  },
  {
    slug: "arbiter",
    name: "Arbiter",
    role: "TRADING" as const,
    description: "Trades only when the Assessor's estimate differs from the market by more than its edge threshold, sized by fractional Kelly and capped by on-chain limits.",
    permissions: ["TRADE"],
    strategy: {
      name: "edge-threshold-fractional-kelly",
      description: "Trade the side the analysis favours when |estimate - market| >= 8 points and confidence >= 0.6; size = 25% Kelly, capped at maxTrade and the remaining spend limit; never hold more than maxPositionPerMarket.",
      params: {
        edgeThresholdPpm: 80_000,
        minConfidence: 0.6,
        kellyFractionBps: 2_500,
        maxTrade: parseUnits("25").toString(),
        spendLimit: parseUnits("250").toString(),
        maxPositionPerMarket: parseUnits("100").toString(),
      },
    },
  },
  {
    slug: "scribe",
    name: "Scribe",
    role: "KNOWLEDGE" as const,
    description: "Writes and revises each claim's encyclopedia page from live market state and verified evidence using confidential inference on NEAR AI Cloud.",
    permissions: ["GENERATE_ARTICLE"],
  },
];

export async function seed(db: DB, opts: { executionMode?: "SIMULATED" } = {}) {
  for (const s of SEED_MARKETS) {
    const exists = await db.select({ id: markets.id }).from(markets).where(eq(markets.slug, s.slug));
    if (exists[0]) continue;
    await createMarket(db, {
      ...s,
      liquidity: parseUnits(s.liquidity ?? "5000"),
      feeBps: 100,
      lpAccount: LP_ACCOUNT,
      executionMode: opts.executionMode ?? "SIMULATED",
    });
  }
  for (const a of SEED_AGENTS) {
    const [row] = await db
      .insert(agents)
      .values({ slug: a.slug, name: a.name, role: a.role, description: a.description, nearAccountId: null, enabled: true })
      .onConflictDoNothing()
      .returning();
    if (!row) continue;
    for (const p of a.permissions) await db.insert(agentPermissions).values({ agentId: row.id, permission: p }).onConflictDoNothing();
    if ("strategy" in a && a.strategy) {
      await db.insert(agentStrategies).values({ agentId: row.id, name: a.strategy.name, description: a.strategy.description, params: a.strategy.params });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { config } = await import("../config.js");
  const { createDb } = await import("./client.js");
  const { db, pool } = createDb(config.DATABASE_URL);
  await seed(db);
  await pool.end();
  console.log("seeded");
}
