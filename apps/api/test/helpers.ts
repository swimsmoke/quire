import { sql } from "drizzle-orm";
import pg from "pg";
import { createDb, type DB } from "../src/db/client.js";
import { accountBalances } from "../src/db/schema.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://quire:quire@localhost:5432/quire_test";

/** Create the test database if it does not exist, so `pnpm test` works on a fresh Postgres. */
async function ensureTestDb() {
  const u = new URL(TEST_DB_URL);
  const name = u.pathname.slice(1);
  u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  try {
    await admin.connect();
    await admin.query(`create database "${name.replace(/"/g, "")}"`);
  } catch (e) {
    if ((e as { code?: string }).code !== "42P04") {
      /* already exists (42P04) is fine; anything else surfaces when the tests connect */
    }
  } finally {
    await admin.end().catch(() => undefined);
  }
}

export async function setupTestApp() {
  await ensureTestDb();
  await runMigrations(TEST_DB_URL);
  const { db, pool } = createDb(TEST_DB_URL);
  await db.execute(sql`truncate table
    article_revisions, encyclopedia_pages, agent_activities, agent_strategies, agent_permissions, evidence_submissions, evidence,
    ai_inferences, funding_events, funding_requests, trades, positions, market_snapshots, markets, claims, transactions,
    account_balances, wallets, auth_challenges, agents, users, indexer_cursors cascade`);
  await seed(db);
  const cfg = { ...config, DATABASE_URL: TEST_DB_URL, QUIRE_DEV_AUTH: true, QUIRE_EXECUTION_MODE: "SIMULATED" as const };
  const app = await buildApp(db, cfg);
  return { app, db, pool };
}

export async function login(app: Awaited<ReturnType<typeof setupTestApp>>["app"], handle: string, opts: { faucet?: boolean } = {}) {
  const r = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { handle } });
  const token = r.json().token as string;
  if (opts.faucet !== false) {
    const f = await app.inject({ method: "POST", url: "/faucet", headers: { authorization: `Bearer ${token}` } });
    if (f.statusCode !== 200) throw new Error(`faucet failed: ${f.statusCode} ${f.body}`);
  }
  return { authorization: `Bearer ${token}` };
}

/** Direct ledger credit for tests that need many funded accounts (bypasses per-IP faucet rate limit). */
export async function fund(db: DB, account: string, amount: bigint) {
  await db
    .insert(accountBalances)
    .values({ traderAccount: account, executionMode: "SIMULATED", available: amount })
    .onConflictDoUpdate({ target: [accountBalances.traderAccount, accountBalances.executionMode], set: { available: sql`${accountBalances.available} + ${amount.toString()}::numeric` } });
}
