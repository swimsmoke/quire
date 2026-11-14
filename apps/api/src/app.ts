import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { DB } from "./db/client.js";
import { bearer, sessionCodec, type Session } from "./auth/session.js";
import { toJson } from "./http/serialize.js";
import { TradeError } from "./market/engine.js";
import { marketRoutes } from "./routes/markets.js";
import { intentsRoutes } from "./routes/intents.js";
import { profileRoutes } from "./routes/profile.js";
import { authRoutes } from "./routes/auth.js";
import { portfolioRoutes } from "./routes/portfolio.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { onchainRoutes } from "./routes/onchain.js";
import { scribeRoutes } from "./routes/scribe.js";
import { juryRoutes } from "./routes/jury.js";
import { answerRoutes } from "./routes/answer.js";
import type { config as Config } from "./config.js";

export type AppConfig = typeof Config;

declare module "fastify" {
  interface FastifyInstance {
    db: DB;
    cfg: AppConfig;
    sessions: ReturnType<typeof sessionCodec>;
    chainFetch?: typeof fetch;
    aiFetch?: typeof fetch;
    webFetch?: typeof fetch;
    intentsFetch?: typeof fetch;
    internalKey: string;
    requireSession: (req: FastifyRequest, reply: FastifyReply) => Promise<Session>;
  }
}

const TRADE_ERROR_STATUS: Record<string, number> = {
  MARKET_NOT_FOUND: 404,
  DUPLICATE_ORDER: 409,
  SLIPPAGE: 409,
  WRONG_EXECUTION_MODE: 409,
  MARKET_NOT_ACTIVE: 409,
  INSUFFICIENT_BALANCE: 422,
  INSUFFICIENT_SHARES: 422,
};

export async function buildApp(db: DB, cfg: AppConfig, opts: { logger?: boolean; chainFetch?: typeof fetch; aiFetch?: typeof fetch; webFetch?: typeof fetch; intentsFetch?: typeof fetch } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 64 * 1024 });
  app.decorate("db", db);
  app.decorate("cfg", cfg);
  app.decorate("chainFetch", opts.chainFetch);
  app.decorate("aiFetch", opts.aiFetch);
  app.decorate("webFetch", opts.webFetch);
  app.decorate("intentsFetch", opts.intentsFetch);
  app.decorate("sessions", sessionCodec(cfg.SESSION_SECRET));
  app.decorate("requireSession", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = bearer(req);
    const s = token ? await app.sessions.verify(token) : null;
    if (!s) {
      reply.code(401).send({ error: "UNAUTHENTICATED", message: "sign in with your NEAR wallet" });
      throw new Error("unauthenticated");
    }
    return s;
  });

  app.setReplySerializer((p) => toJson(p));
  await app.register(cors, { origin: cfg.WEB_ORIGIN.split(","), credentials: false });
  // Background work (research, first articles) calls the API in-process; it carries a per-boot key and skips rate limits.
  const internalKey = randomUUID();
  app.decorate("internalKey", internalKey);
  // Reads are cheap and the web server fetches on behalf of many visitors; writes carry their own, stricter limits.
  await app.register(rateLimit, { max: 1200, timeWindow: "1 minute", allowList: (req) => req.headers["x-quire-internal"] === internalKey });

  app.setErrorHandler((err, _req, reply) => {
    if (reply.sent) return;
    if (err instanceof TradeError) {
      const status = TRADE_ERROR_STATUS[err.code] ?? 400;
      return reply.code(status).send({ error: err.code, message: err.message, existingTradeId: err.existingTradeId });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "VALIDATION", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    if (err instanceof RangeError) return reply.code(400).send({ error: "VALIDATION", message: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "INTERNAL" : "REQUEST_ERROR", message: status >= 500 ? "internal error" : (err as Error).message });
  });

  app.get("/health", async () => ({
    ok: true,
    executionMode: cfg.QUIRE_EXECUTION_MODE,
    network: cfg.NEAR_NETWORK,
    integrations: {
      marketContract: cfg.QUIRE_MARKET_CONTRACT ?? null,
      collateralSymbol: cfg.QUIRE_COLLATERAL_SYMBOL,
      nearAiCloud: cfg.NEAR_AI_API_KEY ? "configured" : "missing NEAR_AI_API_KEY",
      devAuth: cfg.QUIRE_DEV_AUTH,
    },
  }));

  await app.register(authRoutes);
  await app.register(marketRoutes);
  await app.register(portfolioRoutes);
  await app.register(knowledgeRoutes);
  await app.register(onchainRoutes);
  await app.register(scribeRoutes);
  await app.register(juryRoutes);
  await app.register(answerRoutes);
  await app.register(intentsRoutes);
  await app.register(profileRoutes);
  return app;
}
