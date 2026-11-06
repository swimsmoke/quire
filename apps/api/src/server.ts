import { config } from "./config.js";
import { createDb } from "./db/client.js";
import { buildApp } from "./app.js";

const { db } = createDb(config.DATABASE_URL);
const app = await buildApp(db, config, { logger: true });
await app.listen({ port: config.PORT, host: "0.0.0.0" });
app.log.info(`Quire API — execution mode ${config.QUIRE_EXECUTION_MODE}`);
