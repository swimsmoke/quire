import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listTokens, quoteToNear } from "../near/intents.js";

export async function intentsRoutes(app: FastifyInstance) {
  const cfg = () => ({ baseUrl: app.cfg.ONECLICK_BASE_URL, apiKey: app.cfg.ONECLICK_API_KEY, jwt: app.cfg.ONECLICK_JWT, fetchFn: app.intentsFetch ?? fetch });

  app.get("/intents/tokens", async (_req, reply) => {
    try {
      const { tokens, nearPrice } = await listTokens(cfg());
      return { tokens, nearPrice, liveQuotes: !!(app.cfg.ONECLICK_API_KEY || app.cfg.ONECLICK_JWT), network: "mainnet", available: app.cfg.QUIRE_EXECUTION_MODE === "ONCHAIN_MAINNET" };
    } catch (e) {
      return reply.code(502).send({ error: "INTENTS_UNAVAILABLE", message: (e as Error).message });
    }
  });

  app.get("/intents/quote", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const q = z.object({ asset: z.string().max(200), amount: z.string().regex(/^\d{1,12}(\.\d{1,8})?$/) }).parse(req.query);
    if (Number(q.amount) <= 0) return reply.code(400).send({ error: "VALIDATION", message: "Enter an amount above zero" });
    try {
      const { tokens, nearPrice } = await listTokens(cfg());
      const token = tokens.find((t) => t.assetId === q.asset);
      if (!token) return reply.code(404).send({ error: "UNKNOWN_ASSET", message: "That asset isn't in the funding list" });
      return { token, quote: await quoteToNear(cfg(), token, nearPrice, q.amount) };
    } catch (e) {
      return reply.code(502).send({ error: "INTENTS_UNAVAILABLE", message: (e as Error).message });
    }
  });
}
