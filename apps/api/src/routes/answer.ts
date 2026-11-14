/**
 * The answer desk. Before anyone opens a market, Quire checks whether the
 * question is already settled. Scout pulls passages from Wikipedia; a model on
 * NEAR AI Cloud reads them and either answers (citing the passages), says the
 * question is still open, or says the sources don't settle it. Markets are only
 * for questions that are still open.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiInferences } from "../db/schema.js";
import { confidentialChat, NearAiError } from "../ai/nearai.js";
import { findCandidates, questionQuery } from "../ai/research.js";

const ANSWER_PROMPT = `You are Quire's encyclopedia desk. A reader asked a question. You get today's date and numbered passages from Wikipedia (E1, E2, ...).

Decide one status:
- "ANSWERED": the passages clearly answer the question as of today.
- "OPEN": the answer depends on something that has not happened or not been decided yet as of today: a future event, a contest still running, a decision still pending.
- "UNKNOWN": the question is about the past or present, but the passages do not settle it.

Rules:
- Facts come only from the passages. Do not use what you remember; it may be out of date. You may use today's date to tell whether something is still in the future.
- An ANSWERED reply must cite the passages it relies on.
- For yes-or-no questions that are ANSWERED, set "verdict" to "YES" or "NO"; otherwise null.
- "answer": two to four plain sentences in an encyclopedia's voice. For OPEN, say what is still undecided and when it should be known, if the passages say. For UNKNOWN, say what the passages do and don't establish.

Reply with JSON only: {"status": "...", "verdict": "YES" | "NO" | null, "answer": "...", "citations": ["E1"]}`;

const Out = z.object({
  status: z.enum(["ANSWERED", "OPEN", "UNKNOWN"]),
  verdict: z.enum(["YES", "NO"]).nullable().default(null),
  answer: z.string().min(1).max(1500),
  citations: z.array(z.string()).max(8).default([]),
});

export type AnswerResult = {
  status: "ANSWERED" | "OPEN" | "UNKNOWN";
  verdict: "YES" | "NO" | null;
  answer: string;
  sources: { key: string; title: string; url: string; quote: string }[];
  model: string;
  signatureVerified: boolean | null;
  inferenceId: string | null;
};

const TTL_MS = 60 * 60 * 1000;

export function parseAnswer(text: string, keys: Set<string>) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in the reply");
  const o = Out.parse(JSON.parse(cleaned.slice(a, b + 1)));
  const citations = [...new Set(o.citations)].filter((c) => keys.has(c));
  // An answer with nothing to point at is not an answer.
  if (o.status === "ANSWERED" && citations.length === 0) return { ...o, status: "UNKNOWN" as const, verdict: null, citations };
  return { ...o, verdict: o.status === "ANSWERED" ? o.verdict : null, citations };
}

export async function answerRoutes(app: FastifyInstance) {
  const cache = new Map<string, { at: number; result: AnswerResult }>();

  app.post("/ai/answer", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { question } = z.object({ question: z.string().trim().min(8).max(300) }).parse(req.body);
    const key = question.toLowerCase().replace(/\s+/g, " ");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.result, cached: true };
    if (!app.cfg.NEAR_AI_API_KEY) return reply.code(503).send({ error: "NOT_CONFIGURED", message: "NEAR AI Cloud is not configured on this server." });

    const found = await findCandidates(questionQuery(question), question, app.webFetch ?? fetch, { pages: 3, perPage: 3, lead: 6 }).catch(() => []);
    const seen = new Set<string>();
    const passages = found
      .filter((c) => !seen.has(c.excerpt) && seen.add(c.excerpt))
      .slice(0, 12).map((c, i) => ({ key: `E${i + 1}`, title: c.title, url: c.url, quote: c.excerpt }));

    const cfg = { baseUrl: app.cfg.NEAR_AI_BASE_URL, apiKey: app.cfg.NEAR_AI_API_KEY, model: app.cfg.NEAR_AI_MODEL, fetchFn: app.aiFetch };
    let inf;
    try {
      inf = await confidentialChat(cfg, [
        { role: "system", content: ANSWER_PROMPT },
        { role: "user", content: JSON.stringify({ question, today: new Date().toISOString().slice(0, 10), passages: passages.map(({ key, title, quote }) => ({ key, source: title, quote })) }) },
      ]);
    } catch (e) {
      if (e instanceof NearAiError) return reply.code(e.code === "NOT_CONFIGURED" ? 503 : 502).send({ error: e.code, message: e.message });
      throw e;
    }
    let parsed;
    try {
      parsed = parseAnswer(inf.content, new Set(passages.map((p) => p.key)));
    } catch {
      return reply.code(502).send({ error: "INVALID_OUTPUT", message: "The model's reply couldn't be read. Try again." });
    }
    const [row] = await app.db
      .insert(aiInferences)
      .values({
        purpose: "ANSWER",
        mode: "CONFIDENTIAL_TEE",
        provider: "near-ai-cloud",
        model: inf.model,
        chatId: inf.chatId,
        requestHash: inf.requestHash,
        responseHash: inf.responseHash,
        responseText: inf.content.replace(/\u0000/g, "").slice(0, 8000),
        status: "OK",
        error: inf.verificationNote,
        latencyMs: inf.latencyMs,
        promptTokens: inf.promptTokens,
        completionTokens: inf.completionTokens,
        signatureText: inf.signatureText,
        signature: inf.signature,
        signingAddress: inf.signingAddress,
        signingAlgo: inf.signingAlgo,
        signatureVerified: inf.signatureVerified,
        attestationReport: inf.attestationReport,
        attestationNonce: inf.attestationNonce,
        attestationBindsSigner: inf.attestationBindsSigner,
      })
      .returning({ id: aiInferences.id });

    const result: AnswerResult = {
      status: parsed.status,
      verdict: parsed.verdict,
      answer: parsed.answer,
      sources: passages.filter((p) => parsed.citations.includes(p.key)),
      model: inf.model,
      signatureVerified: inf.signatureVerified,
      inferenceId: row?.id ?? null,
    };
    cache.set(key, { at: Date.now(), result });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return result;
  });
}
