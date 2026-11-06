import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDb } from "./client.js";

export async function runMigrations(url: string) {
  const { db, pool } = createDb(url);
  await migrate(db, { migrationsFolder: resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle") });
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { config } = await import("../config.js");
  await runMigrations(config.DATABASE_URL);
  console.log("migrations applied");
}
