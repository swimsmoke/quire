import { config } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { buildApp } from "./app.js";

await runMigrations(config.DATABASE_URL);
const { db } = createDb(config.DATABASE_URL);
// Simulated mode gets example markets; on-chain mode only lists markets that exist on the contract.
await seed(db, { markets: config.QUIRE_EXECUTION_MODE === "SIMULATED" });
const app = await buildApp(db, config, { logger: true });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
app.log.info(`Quire API: execution mode ${config.QUIRE_EXECUTION_MODE}, network ${config.NEAR_NETWORK}`);
