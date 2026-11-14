import { config } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { buildApp } from "./app.js";

/** Retry startup steps while a sleeping database wakes up, then give up so the host restarts us. */
async function withRetry<T>(what: string, fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      console.error(`${what} failed (attempt ${i}/${tries}): ${(e as Error).message}. Retrying.`);
      await new Promise((r) => setTimeout(r, Math.min(2_000 * 2 ** (i - 1), 20_000)));
    }
  }
}

await withRetry("migrations", () => runMigrations(config.DATABASE_URL));
const { db } = createDb(config.DATABASE_URL);
// Simulated mode gets example markets; on-chain mode only lists markets that exist on the contract.
await withRetry("seed", () => seed(db, { markets: config.QUIRE_EXECUTION_MODE === "SIMULATED" }));
const app = await buildApp(db, config, { logger: true });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
app.log.info(`Quire API: execution mode ${config.QUIRE_EXECUTION_MODE}, network ${config.NEAR_NETWORK}`);
