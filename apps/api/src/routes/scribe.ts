import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { formatUnits } from "@quire/shared";
import { agentActivities, agents, aiInferences, articleRevisions, claims, encyclopediaPages, evidence, marketSnapshots, markets } from "../db/schema.js";
import { checkEvidence } from "../ai/evidence-check.js";
import { confidentialChat, NearAiError } from "../ai/nearai.js";
import { parseArticle, SYSTEM_PROMPT } from "../ai/article.js";
import { pgErrorCode } from "../market/engine.js";
import { findCandidates } from "../ai/research.js";
import { htmlToText, normalize } from "../ai/evidence-check.js";

const CATEGORIES = ["crypto", "ai", "near", "tech", "science", "sports", "politics", "economy", "culture", "other"] as const;
const DraftSchema = z.object({
  question: z.string().min(8).max(300),
  subject: z.string().min(1).max(80),
  category: z.enum(CATEGORIES).catch("other"),
  description: z.string().min(1).max(600),
  resolutionCriteria: z.string().min(1).max(600),
});
const DRAFT_PROMPT = `You help people phrase a claim for Quire, a market where people trade Yes or No on a claim that has no closing date.
Given a rough question, reply with ONE JSON object and nothing else, with keys:
- "question": the claim as a clear yes/no question, neutral, specific, under 140 characters. Do not add a deadline unless the user gave one.
- "subject": the main thing the claim is about, as it would be titled in an encyclopedia (2 to 5 words).
- "category": one of ${CATEGORIES.join(", ")}.
- "description": one or two plain sentences saying what the claim means. No predictions.
- "resolutionCriteria": one or two sentences saying what public, checkable event would make this resolve YES, and that it stays open until then.
Do not state facts you are unsure of. Do not give an opinion on the answer.`;

/** After a market is created or traded: let Scout research (first time only) and Scribe write if a revision is due. Never throws. */
export async function runKnowledgePipeline(app: FastifyInstance, slug: string, opts: { research: boolean }) {
  if (app.cfg.NODE_ENV === "test" || !app.cfg.NEAR_AI_API_KEY || app.cfg.NEAR_AI_API_KEY === "none") return;
  try {
    const headers = { "x-quire-internal": app.internalKey };
    if (opts.research) await app.inject({ method: "POST", url: `/markets/${slug}/research`, headers });
    await app.inject({ method: "POST", url: `/markets/${slug}/encyclopedia/generate`, headers });
  } catch (e) {
    app.log.warn({ err: e, slug }, "knowledge pipeline failed");
  }
}

async function marketBySlug(app: FastifyInstance, slug: string) {
  const [row] = await app.db.select().from(markets).innerJoin(claims, eq(markets.claimId, claims.id)).where(eq(markets.slug, slug));
  return row;
}
const agentId = async (app: FastifyInstance, slug: string) => (await app.db.select({ id: agents.id }).from(agents).where(eq(agents.slug, slug)))[0]?.id ?? null;
const pctText = (ppm: number) => `${(ppm / 10_000).toFixed(1)}%`;

/** Claims with a revision being written right now (one writer per claim at a time). */
const writing = new Set<string>();

export async function scribeRoutes(app: FastifyInstance) {
  /**
   * Submit a source for a claim. Quire (as Scout) fetches the page and checks the quote is on it.
   * Only quotes found on the page are ever shown to the encyclopedia writer.
   */
  app.post("/markets/:slug/evidence", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const body = z
      .object({
        url: z.string().url().max(500),
        excerpt: z.string().trim().min(20, "quote at least 20 characters").max(600),
        stance: z.enum(["SUPPORTS", "CONTRADICTS", "CONTEXT"]),
        submittedBy: z.string().max(64).optional(),
      })
      .parse(req.body);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });

    const check = await checkEvidence(body.url, body.excerpt, app.webFetch ?? fetch, !!app.webFetch);
    const host = new URL(body.url).hostname.replace(/^www\./, "");
    const scout = await agentId(app, "scout");
    const excerptHash = createHash("sha256").update(body.excerpt).digest("hex");
    const [ev] = await app.db
      .insert(evidence)
      .values({
        claimId: row.claims.id,
        title: check.pageTitle ?? host,
        sourceUrl: body.url,
        sourceName: host,
        retrievedAt: check.status === "FETCH_FAILED" ? null : new Date(),
        evidenceType: "ARTICLE",
        stance: body.stance,
        excerpt: body.excerpt,
        excerptHash,
        contentHash: check.contentHash,
        httpStatus: check.httpStatus,
        finalUrl: check.finalUrl,
        verificationStatus: check.status,
        verificationDetail: `${check.detail}${body.submittedBy ? ` Submitted by ${body.submittedBy}.` : ""}`,
      })
      .onConflictDoNothing()
      .returning();
    if (!ev) return reply.code(409).send({ error: "DUPLICATE_EVIDENCE", message: "That quote from that page is already listed." });
    if (scout) {
      await app.db.insert(agentActivities).values({
        agentId: scout,
        marketId: row.markets.id,
        kind: "EVIDENCE_CHECKED",
        summary: check.status === "EXCERPT_VERIFIED" ? `fetched ${host} and found the quoted text on the page` : check.status === "EXCERPT_NOT_FOUND" ? `fetched ${host} but did not find the quoted text` : `could not retrieve ${host}`,
        payload: { evidenceId: ev.id, status: check.status },
      });
    }
    return reply.code(201).send({ evidence: ev, check: { status: check.status, detail: check.detail } });
  });

  /**
   * Help someone turn a rough question into a well-formed claim. The model only drafts wording;
   * the person reviews and edits everything before creating the market.
   */
  app.post("/ai/draft-claim", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { question } = z.object({ question: z.string().trim().min(8).max(300) }).parse(req.body);
    const cfg = { baseUrl: app.cfg.NEAR_AI_BASE_URL, apiKey: app.cfg.NEAR_AI_API_KEY ?? "", model: app.cfg.NEAR_AI_MODEL, fetchFn: app.aiFetch };
    try {
      const inf = await confidentialChat(cfg, [
        { role: "system", content: DRAFT_PROMPT },
        { role: "user", content: question },
      ]);
      let text = inf.content.trim();
      const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
      if (fence) text = fence[1]!;
      const d = DraftSchema.parse(JSON.parse(text));
      return { draft: d, model: inf.model };
    } catch (e) {
      if (e instanceof NearAiError) return reply.code(e.code === "NOT_CONFIGURED" ? 503 : 502).send({ error: e.code, message: e.message });
      return reply.code(502).send({ error: "INVALID_OUTPUT", message: "The model could not draft this claim. Fill in the fields yourself, or rephrase the question." });
    }
  });

  /** Scout researches a claim on its own: finds Wikipedia passages and submits them through the normal evidence check. */
  app.post("/markets/:slug/research", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const candidates = await findCandidates(row.claims.subject, row.claims.title, app.webFetch ?? fetch);
    const MAX_PER_PAGE = 2, MAX_TOTAL = 5;
    const perPage = new Map<string, number>();
    let verified = 0;
    // read each page once and keep only the sentences that really appear on it, so a sentence that
    // renders differently on the page never shows up as a failed quote in the claim's evidence
    const pageText = new Map<string, string | null>();
    for (const c of candidates) {
      if (verified >= MAX_TOTAL) break;
      if ((perPage.get(c.url) ?? 0) >= MAX_PER_PAGE) continue;
      if (!pageText.has(c.url)) {
        try {
          const res = await (app.webFetch ?? fetch)(c.url, { headers: { "user-agent": "QuireEvidenceBot/0.1 (evidence retrieval for a hackathon project)" }, signal: AbortSignal.timeout(12_000) });
          pageText.set(c.url, res.ok ? normalize(htmlToText(await res.text())) : null);
        } catch {
          pageText.set(c.url, null);
        }
      }
      if (!pageText.get(c.url)?.includes(normalize(c.excerpt))) continue;
      const r = await app.inject({ method: "POST", url: `/markets/${slug}/evidence`, headers: { "x-quire-internal": app.internalKey }, payload: { url: c.url, excerpt: c.excerpt, stance: "CONTEXT", submittedBy: "Scout" } });
      if (r.statusCode === 201 && r.json().check.status === "EXCERPT_VERIFIED") {
        verified++;
        perPage.set(c.url, (perPage.get(c.url) ?? 0) + 1);
      }
    }
    // new verified evidence is a reason for a new revision; the update policy has the final say
    if (verified > 0) void runKnowledgePipeline(app, slug, { research: false });
    return { candidates: candidates.length, verified };
  });

  /**
   * Generate a new encyclopedia revision with confidential inference on NEAR AI Cloud.
   * Runs only when the update policy says a revision is due.
   */
  app.post("/markets/:slug/encyclopedia/generate", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await marketBySlug(app, slug);
    if (!row) return reply.code(404).send({ error: "MARKET_NOT_FOUND" });
    const { markets: m, claims: c } = row;
    if (writing.has(c.id)) return reply.code(409).send({ error: "IN_PROGRESS", message: "Scribe is already writing a revision for this claim. It will appear in a moment." });
    writing.add(c.id);
    let stage = "reading market state";
    try {

    await app.db.insert(encyclopediaPages).values({ claimId: c.id }).onConflictDoNothing();
    const [page] = await app.db.select().from(encyclopediaPages).where(eq(encyclopediaPages.claimId, c.id));
    const [prev] = await app.db.select().from(articleRevisions).where(eq(articleRevisions.pageId, page!.id)).orderBy(desc(articleRevisions.revisionNumber)).limit(1);
    const verified = await app.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.claimId, c.id), eq(evidence.verificationStatus, "EXCERPT_VERIFIED")))
      .orderBy(asc(evidence.createdAt))
      .limit(12);

      stage = "checking the update policy";
    // ---- update policy ----
    let trigger: string;
    if (!prev) trigger = "First revision";
    else {
      const move = Math.abs(m.priceYesPpm - prev.priceYesPpm);
      const newEvidence = verified.filter((e) => !prev.evidenceIds.includes(e.id)).length;
      const ageS = (Date.now() - prev.createdAt.getTime()) / 1000;
      if (ageS < app.cfg.ARTICLE_MIN_INTERVAL_S) {
        return reply.code(409).send({ error: "NOT_DUE", message: `The last revision is ${Math.round(ageS)} seconds old. Wait ${Math.ceil(app.cfg.ARTICLE_MIN_INTERVAL_S - ageS)} more seconds.` });
      }
      if (newEvidence > 0) trigger = `${newEvidence} new verified ${newEvidence === 1 ? "source" : "sources"}`;
      else if (move >= app.cfg.ARTICLE_MIN_MOVE_PPM) trigger = `Yes moved ${(move / 10_000).toFixed(1)} points, from ${pctText(prev.priceYesPpm)} to ${pctText(m.priceYesPpm)}`;
      else {
        return reply.code(409).send({
          error: "NOT_DUE",
          message: `No revision is due: Yes has moved ${(move / 10_000).toFixed(1)} points since the last revision (needs ${app.cfg.ARTICLE_MIN_MOVE_PPM / 10_000}) and there is no new verified evidence.`,
        });
      }
    }

      stage = "building the input";
    // ---- structured input from live state ----
    const snaps = await app.db.select({ t: marketSnapshots.takenAt, p: marketSnapshots.priceYesPpm }).from(marketSnapshots).where(eq(marketSnapshots.marketId, m.id)).orderBy(asc(marketSnapshots.takenAt)).limit(2000);
    const step = Math.max(1, Math.ceil(snaps.length / 24));
    const history = snaps.filter((_s, i) => i % step === 0 || i === snaps.length - 1).map((s) => ({ at: s.t.toISOString(), yesProbability: pctText(s.p) }));
    const [stats] = (
      await app.db.execute<{ humans: number; agents: number; day: string }>(sql`
        select (select count(distinct trader_account) from trades where market_id = ${m.id} and actor_kind = 'HUMAN')::int as humans,
               (select count(distinct trader_account) from trades where market_id = ${m.id} and actor_kind = 'AGENT')::int as agents,
               coalesce((select sum(collateral) from trades where market_id = ${m.id} and created_at > now() - interval '24 hours'), 0)::text as day`)
    ).rows;
    const keyOf = new Map(verified.map((e, i) => [`E${i + 1}`, e]));
    const prevContent = prev?.content as Record<string, { body?: string }> | undefined;
    const input = {
      claim: { title: c.title, subject: c.subject, description: c.description, resolutionCriteria: c.resolutionCriteria },
      market: {
        yesProbability: pctText(m.priceYesPpm),
        noProbability: pctText(1_000_000 - m.priceYesPpm),
        currency: "NEAR",
        totalVolume: formatUnits(m.volume, 6, 3),
        volumeLast24h: formatUnits(BigInt(stats?.day ?? "0"), 6, 3),
        liquidity: formatUnits(m.sets, 6, 3),
        tradeCount: m.tradeCount,
        humanTraders: stats?.humans ?? 0,
        agentTraders: stats?.agents ?? 0,
        openSince: m.createdAt.toISOString(),
        network: m.executionMode === "SIMULATED" ? "simulated ledger" : "NEAR testnet",
      },
      history,
      evidence: [...keyOf].map(([key, e]) => ({ key, title: e.title, source: e.sourceName, stance: e.stance, quote: e.excerpt, retrievedAt: e.retrievedAt?.toISOString() ?? null })),
      previous: prev ? { revision: prev.revisionNumber, writtenAt: prev.createdAt.toISOString(), yesProbabilityThen: pctText(prev.priceYesPpm), overview: prevContent?.overview?.body ?? null, consensus: prevContent?.consensus?.body ?? null } : null,
      now: new Date().toISOString(),
    };

      stage = "calling NEAR AI Cloud";
    // ---- confidential inference + validation (one retry on malformed output) ----
    const cfg = { baseUrl: app.cfg.NEAR_AI_BASE_URL, apiKey: app.cfg.NEAR_AI_API_KEY ?? "", model: app.cfg.NEAR_AI_MODEL, fetchFn: app.aiFetch };
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: JSON.stringify(input) },
    ];
    let inf, parsed;
    let lastError = "";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        inf = await confidentialChat(cfg, messages);
      } catch (e) {
        if (e instanceof NearAiError) {
          await app.db.insert(aiInferences).values({ purpose: "ARTICLE", mode: "CONFIDENTIAL_TEE", provider: "near-ai-cloud", model: cfg.model, status: "ERROR", error: e.message });
          return reply.code(e.code === "NOT_CONFIGURED" ? 503 : 502).send({ error: e.code, message: e.message });
        }
        throw e;
      }
      try {
        parsed = parseArticle(inf.content, new Set(keyOf.keys()));
      } catch (e) {
        lastError = (e as Error).message.slice(0, 300);
        await app.db.insert(aiInferences).values({ purpose: "ARTICLE", mode: "CONFIDENTIAL_TEE", provider: "near-ai-cloud", model: inf.model, chatId: inf.chatId, requestHash: inf.requestHash, responseHash: inf.responseHash, responseText: inf.content.replace(/\u0000/g, "").slice(0, 8000), status: "INVALID_OUTPUT", error: lastError });
      }
    }
    if (!parsed || !inf) return reply.code(502).send({ error: "INVALID_OUTPUT", message: `The model did not return a valid article twice in a row. ${lastError}` });

      stage = "saving the revision";
    // citations: model keys (E1..) -> evidence ids
    const content = Object.fromEntries(Object.entries(parsed.article).map(([k, s]) => [k, { body: s.body, citations: s.citations.map((key) => keyOf.get(key)!.id) }]));

    const result = await app.db.transaction(async (tx) => {
      const [infRow] = await tx
        .insert(aiInferences)
        .values({
          purpose: "ARTICLE",
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
        .returning();
      const [snap] = await tx.select({ id: marketSnapshots.id }).from(marketSnapshots).where(eq(marketSnapshots.marketId, m.id)).orderBy(desc(marketSnapshots.takenAt)).limit(1);
      const [rev] = await tx
        .insert(articleRevisions)
        .values({ pageId: page!.id, revisionNumber: (prev?.revisionNumber ?? 0) + 1, content, priceYesPpm: m.priceYesPpm, marketSnapshotId: snap?.id ?? null, evidenceIds: verified.map((e) => e.id), triggerReason: trigger, inferenceId: infRow!.id })
        .returning();
      await tx.update(encyclopediaPages).set({ currentRevisionId: rev!.id, revisionCount: rev!.revisionNumber, updatedAt: new Date() }).where(eq(encyclopediaPages.id, page!.id));
      const scribe = (await tx.select({ id: agents.id }).from(agents).where(eq(agents.slug, "scribe")))[0]?.id;
      if (scribe) {
        await tx.update(agents).set({ model: inf.model, updatedAt: new Date() }).where(eq(agents.id, scribe));
        await tx.insert(agentActivities).values({ agentId: scribe, marketId: m.id, kind: "ARTICLE_GENERATED", summary: `wrote revision ${rev!.revisionNumber} at ${pctText(m.priceYesPpm)} Yes from ${verified.length} verified ${verified.length === 1 ? "source" : "sources"}`, inferenceId: infRow!.id });
      }
      return rev!;
    });
    return reply.code(201).send({ revisionNumber: result.revisionNumber, trigger, model: inf.model, signatureVerified: inf.signatureVerified, attestationBindsSigner: inf.attestationBindsSigner, droppedCitations: parsed.droppedCitations, note: inf.verificationNote });
    } catch (e) {
      // Another server instance saved the same revision number first: the article exists, so this is not a failure.
      if (pgErrorCode(e) === "23505") return reply.code(409).send({ error: "IN_PROGRESS", message: "A revision was just written for this claim. Refresh the page to read it." });
      // Report where it failed instead of a bare "internal error". No secrets are in these messages.
      const err = e as Error & { cause?: { message?: string; code?: string } };
      req.log.error({ err, stage }, "encyclopedia generation failed");
      return reply.code(500).send({ error: "GENERATION_FAILED", message: `Failed while ${stage}: ${err.message?.slice(0, 300) ?? "unknown error"}${err.cause ? ` (cause: ${(err.cause.code ?? err.cause.message ?? "").toString().slice(0, 200)})` : ""}` });
    } finally {
      writing.delete(c.id);
    }
  });
}
