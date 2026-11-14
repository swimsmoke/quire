import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export function createDb(url: string): { db: DB; pool: pg.Pool } {
  // Fail fast instead of hanging when the database is waking up or unreachable; callers retry.
  const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 20_000, idleTimeoutMillis: 30_000, keepAlive: true });
  return { db: drizzle(pool, { schema }), pool };
}

export { schema };
