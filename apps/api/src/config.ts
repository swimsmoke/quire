import "dotenv/config";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url().default("postgresql://quire:quire@localhost:5432/quire"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32).default("dev-only-insecure-session-secret-change-me-please"),

  /** SIMULATED: trades execute against the Postgres ledger (clearly labelled).
   *  ONCHAIN_TESTNET: trades are signed by the user's wallet against the NEAR contract and ingested from tx results. */
  QUIRE_EXECUTION_MODE: z.enum(["SIMULATED", "ONCHAIN_TESTNET"]).default("SIMULATED"),
  /** Allows passwordless *.sim accounts. Never enable with ONCHAIN modes. */
  QUIRE_DEV_AUTH: bool,

  NEAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  NEAR_RPC_URL: z.string().url().default("https://test.rpc.fastnear.com"),
  QUIRE_MARKET_CONTRACT: z.string().optional(),
  QUIRE_QUSD_CONTRACT: z.string().optional(),

  NEAR_AI_API_KEY: z.string().optional(),
  NEAR_AI_BASE_URL: z.string().url().default("https://cloud-api.near.ai/v1"),
  NEAR_AI_MODEL: z.string().default("deepseek-ai/DeepSeek-V3.1"),

  ONECLICK_BASE_URL: z.string().url().default("https://1click.chaindefuser.com"),
  ONECLICK_JWT: z.string().optional(),
});

// Treat blank values in .env as unset.
const rawEnv = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
const parsed = Env.safeParse(rawEnv);
if (!parsed.success) {
  console.error("Invalid environment:", z.treeifyError(parsed.error));
  process.exit(1);
}
export const config = parsed.data;

if (config.QUIRE_DEV_AUTH && config.QUIRE_EXECUTION_MODE !== "SIMULATED") {
  throw new Error("QUIRE_DEV_AUTH may only be used with QUIRE_EXECUTION_MODE=SIMULATED");
}
if (config.NODE_ENV === "production" && config.SESSION_SECRET.startsWith("dev-only")) {
  throw new Error("SESSION_SECRET must be set in production");
}
