import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { accountBalances, aiInferences, claims, evidence, markets, positions, rulings } from "../db/schema.js";
import { bearer } from "../auth/session.js";
import { askJuror, pickJurors, tally, type JuryInput } from "../jury/jury.js";
import { proposeOnChain } from "../near/jury-signer.js";
import { IngestError, ingestResolutionTx, viewContract } from "../near/ingest.js";
import { chainCtx } from "./onchain.js";

/** Bond to dispute a ruling, in micro-NEAR. Matches the contract's DISPUTE_BOND. */
export const DISPUTE_BOND = 500_000n;

type Row = typeof rulings.$inferSelect;
type MarketRow = typeof markets.$inferSelect;

export interface StoredVote {
  model: string;
  verdict: string | null;
  confidence: number | null;
  reasoning: string | null;
  citations: { key: string; title: string; url: string }[];
  inferenceId: string | null;
  signatureVerified: boolean | null;
  attestationBindsSigner: boolean | null;
  latencyMs: number | null;
  error: string | null;
}

/** Where a ruling stands, from the reader's point of view. */
export function stage(r: Row, now = Date.now()) {
  if (r.outcome === "NO_RULING") return "NO_RULING";
  if (r.outcome === "PROPOSE_FAILED") return "NOT_PROPOSED";
  if (r.finalizedAt) return "SETTLED";
  if (r.disputedBy) return "DISPUTED";
  if (r.challengeEndsAt && now < r.challengeEndsAt.getTime()) return "CHALLENGE_WINDOW";
  return "READY_TO_SETTLE";
}

const payoutFor = (verdict: string, yes: bigint, no: bigint) => (verdict === "YES" ? yes : verdict === "NO" ? no : (yes + no) / 2n);

export async function juryRoutes(app: FastifyInstance) {
  const cfg = app.cfg;
  const aiCfg = () => ({ baseUrl: cfg.NEAR_AI_BASE_URL, apiKey: cfg.NEAR_AI_API_KEY ?? "", model: cfg.NEAR_AI_MODEL, fetchFn: app.aiFetch });

  async function optionalAccount(req: FastifyRequest) {
    const t = bearer(req);
    const s = t ? await app.sessions.verify(t) : null;
    return s?.accountId ?? null;
  }

  async function load(slug: string) {
    const [row] = await app.db.select({ m: markets, c: claims }).from(markets).innerJoin(claims, eq(claims.id, markets.claimId)).where(eq(markets.slug, slug));
    return row ?? null;
  }

  async function latest(marketId: string) {
    const [r] = await app.db.select().from(rulings).where(eq(rulings.marketId, marketId)).orderBy(desc(rulings.createdAt)).limit(1);
    return r ?? null;
  }

  /** What winners are owed, or would be owed, under a ruling. */
  async function payouts(m: MarketRow, verdict: string) {
    if (!["YES", "NO", "INVALID"].includes(verdict)) return null;
    const rows = await app.db.select({ a: positions.traderAccount, y: positions.yesShares, n: positions.noShares }).from(positions).where(eq(positions.marketId, m.id));
    let total = 0n;
    let holders = 0;
    for (const p of rows) {
      if (p.a === m.lpAccount) continue;
      const v = payoutFor(verdict, p.y, p.n);
      if (v > 0n) {
        total += v;
        holders++;
      }
    }
    return { total, holders };
  }

  function view(r: Row, m: MarketRow, c: typeof claims.$inferSelect, pay: { total: bigint; holders: number } | null) {
    return {
      id: r.id,
      market: { slug: m.slug, question: c.title, category: c.category, status: m.status, probabilityYesPpm: m.priceYesPpm, executionMode: m.executionMode, onchainId: m.onchainId },
      verdict: r.verdict,
      outcome: r.outcome,
      stage: stage(r),
      votes: r.votes as StoredVote[],
      evidenceCount: r.evidenceCount,
      durationMs: r.durationMs,
      requestedBy: r.requestedBy,
      proposalTx: r.proposalTx,
      proposalError: r.proposalError,
      challengeEndsAt: r.challengeEndsAt,
      disputedBy: r.disputedBy,
      disputedAt: r.disputedAt,
      disputeTx: r.disputeTx,
      finalizedAt: r.finalizedAt,
      finalizeTx: r.finalizeTx,
      disputeBond: DISPUTE_BOND,
      payout: pay,
      createdAt: r.createdAt,
    };
  }

  // ---------- ask the jury ----------
  app.post("/markets/:slug/jury", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await load(slug);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND", message: "no such market" });
    const { m, c } = row;
    if (m.status !== "ACTIVE" && m.status !== "PAUSED") return reply.code(409).send({ error: "BAD_STATUS", message: "This claim already has a ruling in progress or is settled." });
    const prev = await latest(m.id);
    if (prev) {
      const age = (Date.now() - prev.createdAt.getTime()) / 1000;
      if (age < cfg.JURY_COOLDOWN_S) {
        const wait = Math.ceil(cfg.JURY_COOLDOWN_S - age);
        return reply.code(429).send({ error: "COOLDOWN", message: `The jury ruled on this claim ${Math.round(age / 60)} minutes ago. It can be asked again in ${Math.ceil(wait / 60)} minutes.`, retryAfterS: wait });
      }
    }
    if (!cfg.NEAR_AI_API_KEY) return reply.code(503).send({ error: "NOT_CONFIGURED", message: "NEAR AI Cloud is not configured on this server." });

    const ev = await app.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.claimId, c.id), eq(evidence.verificationStatus, "EXCERPT_VERIFIED")))
      .orderBy(desc(evidence.createdAt))
      .limit(12);
    if (!ev.length) return reply.code(409).send({ error: "NO_EVIDENCE", message: "The jury only rules from checked sources, and this claim has none yet. Find sources first." });

    const keyed = ev.map((e, i) => ({ key: `E${i + 1}`, e }));
    const input: JuryInput = {
      question: c.title,
      description: c.description,
      resolutionCriteria: c.resolutionCriteria,
      evidence: keyed.map(({ key, e }) => ({ key, title: e.title, source: e.sourceName, url: e.finalUrl ?? e.sourceUrl, quote: e.excerpt, retrievedAt: e.retrievedAt?.toISOString() ?? null })),
      now: new Date().toISOString(),
    };

    const started = Date.now();
    const models = await pickJurors(aiCfg());
    const results = await Promise.all(models.map((model) => askJuror(aiCfg(), model, input)));
    const durationMs = Date.now() - started;

    const votes: StoredVote[] = [];
    for (const r of results) {
      const inf = r.inference;
      let inferenceId: string | null = null;
      if (inf) {
        const [ir] = await app.db
          .insert(aiInferences)
          .values({
            purpose: "JURY",
            mode: "CONFIDENTIAL_TEE",
            provider: "near-ai-cloud",
            model: inf.model,
            chatId: inf.chatId,
            requestHash: inf.requestHash,
            responseHash: inf.responseHash,
            responseText: inf.content.replace(/\u0000/g, "").slice(0, 8000),
            status: r.vote ? "OK" : "INVALID_OUTPUT",
            error: r.error ?? inf.verificationNote,
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
        inferenceId = ir!.id;
      }
      // A juror whose signature does not check out does not get a vote.
      const counted = r.vote && inf?.signatureVerified !== false ? r.vote : null;
      votes.push({
        model: r.model,
        verdict: counted?.verdict ?? null,
        confidence: counted?.confidence ?? null,
        reasoning: r.vote?.reasoning ?? null,
        citations: (r.vote?.citations ?? []).map((k) => {
          const e = keyed.find((x) => x.key === k)!.e;
          return { key: k, title: e.title, url: e.finalUrl ?? e.sourceUrl };
        }),
        inferenceId,
        signatureVerified: inf?.signatureVerified ?? null,
        attestationBindsSigner: inf?.attestationBindsSigner ?? null,
        latencyMs: inf?.latencyMs ?? null,
        error: r.vote && inf?.signatureVerified === false ? "signature did not verify; vote not counted" : r.error,
      });
    }

    const { verdict } = tally(votes.map((v) => (v.verdict as never) ?? null));
    const requestedBy = await optionalAccount(req);
    const base = { marketId: m.id, requestedBy, verdict, votes, evidenceCount: ev.length, durationMs };

    if (verdict === "NOT_YET") {
      const [r] = await app.db.insert(rulings).values({ ...base, outcome: "NO_RULING" }).returning();
      return reply.code(201).send(view(r!, m, c, null));
    }

    // ---- propose the ruling ----
    let proposalTx: string | null = null;
    let challengeS = cfg.JURY_CHALLENGE_S;
    const ctx = chainCtx(app);
    if (ctx && m.executionMode !== "SIMULATED") {
      if (!cfg.JURY_ACCOUNT_ID || !cfg.JURY_PRIVATE_KEY || m.onchainId == null) {
        const [r] = await app.db.insert(rulings).values({ ...base, outcome: "PROPOSE_FAILED", proposalError: "The jury account is not configured on this server, so the ruling was not sent on-chain." }).returning();
        return reply.code(201).send(view(r!, m, c, null));
      }
      try {
        const origin = cfg.WEB_ORIGIN.split(",")[0]!.replace(/\/$/, "");
        proposalTx = await proposeOnChain({ accountId: cfg.JURY_ACCOUNT_ID, privateKey: cfg.JURY_PRIVATE_KEY, rpcUrl: cfg.NEAR_RPC_URL, contractId: ctx.contractId }, m.onchainId, verdict, `${origin}/results/${m.slug}`);
        const conf = await viewContract<{ challenge_period_ns: string }>(ctx, "get_config", {}).catch(() => null);
        if (conf) challengeS = Math.round(Number(BigInt(conf.challenge_period_ns) / 1_000_000_000n));
      } catch (e) {
        const [r] = await app.db.insert(rulings).values({ ...base, outcome: "PROPOSE_FAILED", proposalError: (e as Error).message.slice(0, 400) }).returning();
        return reply.code(201).send(view(r!, m, c, null));
      }
    }

    const r = await app.db.transaction(async (tx) => {
      // A held dispute bond is settled when the jury rules again, as on the contract.
      const [held] = await tx.select().from(rulings).where(and(eq(rulings.marketId, m.id), eq(rulings.bondSettled, false), sql`${rulings.disputedBy} is not null`));
      if (held) {
        await tx.update(rulings).set({ bondSettled: true }).where(eq(rulings.id, held.id));
        if (m.executionMode === "SIMULATED") {
          const to = verdict !== held.verdict ? held.disputedBy! : m.lpAccount;
          await credit(tx, to, DISPUTE_BOND);
        }
      }
      await tx.update(markets).set({ status: "RESOLUTION_PROPOSED", updatedAt: new Date() }).where(eq(markets.id, m.id));
      const [row] = await tx
        .insert(rulings)
        .values({ ...base, outcome: "PROPOSED", proposalTx, challengeEndsAt: new Date(Date.now() + challengeS * 1000) })
        .returning();
      return row!;
    });
    return reply.code(201).send(view(r, { ...m, status: "RESOLUTION_PROPOSED" }, c, await payouts(m, verdict)));
  });

  async function credit(db: Parameters<Parameters<typeof app.db.transaction>[0]>[0], account: string, amount: bigint) {
    await db
      .insert(accountBalances)
      .values({ traderAccount: account, executionMode: "SIMULATED", available: amount })
      .onConflictDoUpdate({ target: [accountBalances.traderAccount, accountBalances.executionMode], set: { available: sql`${accountBalances.available} + ${amount.toString()}::numeric` } });
  }

  // ---------- read ----------
  app.get("/markets/:slug/ruling", async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await load(slug);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const r = await latest(row.m.id);
    const cooldownS = r ? Math.max(0, Math.ceil(cfg.JURY_COOLDOWN_S - (Date.now() - r.createdAt.getTime()) / 1000)) : 0;
    return { ruling: r ? view(r, row.m, row.c, await payouts(row.m, r.verdict)) : null, cooldownS, juryReady: !!cfg.NEAR_AI_API_KEY };
  });

  app.get("/results", async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(60).default(30) }).parse(req.query);
    const rows = await app.db
      .select({ r: rulings, m: markets, c: claims })
      .from(rulings)
      .innerJoin(markets, eq(markets.id, rulings.marketId))
      .innerJoin(claims, eq(claims.id, markets.claimId))
      .orderBy(desc(rulings.createdAt))
      .limit(limit * 3);
    // One card per claim: its latest ruling.
    const seen = new Set<string>();
    const out = [];
    for (const { r, m, c } of rows) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(view(r, m, c, await payouts(m, r.verdict)));
      if (out.length >= limit) break;
    }
    const settled = out.filter((x) => x.stage === "SETTLED").length;
    return { results: out, counts: { total: out.length, settled } };
  });

  app.get("/rulings/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await app.db.select({ r: rulings, m: markets, c: claims }).from(rulings).innerJoin(markets, eq(markets.id, rulings.marketId)).innerJoin(claims, eq(claims.id, markets.claimId)).where(eq(rulings.id, id));
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const ids = (row.r.votes as StoredVote[]).map((v) => v.inferenceId).filter((x): x is string => !!x);
    const infs = ids.length
      ? await app.db
          .select({ id: aiInferences.id, model: aiInferences.model, chatId: aiInferences.chatId, requestHash: aiInferences.requestHash, responseHash: aiInferences.responseHash, signatureText: aiInferences.signatureText, signature: aiInferences.signature, signingAddress: aiInferences.signingAddress, signingAlgo: aiInferences.signingAlgo, signatureVerified: aiInferences.signatureVerified, attestationBindsSigner: aiInferences.attestationBindsSigner })
          .from(aiInferences)
          .where(inArray(aiInferences.id, ids))
      : [];
    return { ...view(row.r, row.m, row.c, await payouts(row.m, row.r.verdict)), inferences: infs };
  });

  // ---------- simulated settlement (on-chain, the wallet signs and we ingest) ----------
  const simOnly = (m: MarketRow) => m.executionMode === "SIMULATED";

  app.post("/markets/:slug/dispute", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await app.requireSession(req, reply);
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await load(slug);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    if (!simOnly(row.m)) return reply.code(409).send({ error: "ONCHAIN", message: "Dispute with your wallet; this market settles on NEAR." });
    const r = await latest(row.m.id);
    if (!r || row.m.status !== "RESOLUTION_PROPOSED" || stage(r) !== "CHALLENGE_WINDOW") return reply.code(409).send({ error: "BAD_STATUS", message: "There is no ruling open to dispute." });
    const done = await app.db.transaction(async (tx) => {
      const [bal] = await tx.select().from(accountBalances).where(and(eq(accountBalances.traderAccount, s.accountId), eq(accountBalances.executionMode, "SIMULATED"))).for("update");
      if (!bal || bal.available < DISPUTE_BOND) return false;
      await tx.update(accountBalances).set({ available: bal.available - DISPUTE_BOND }).where(and(eq(accountBalances.traderAccount, s.accountId), eq(accountBalances.executionMode, "SIMULATED")));
      await tx.update(rulings).set({ disputedBy: s.accountId, disputedAt: new Date() }).where(eq(rulings.id, r.id));
      await tx.update(markets).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(markets.id, row.m.id));
      return true;
    });
    if (!done) return reply.code(422).send({ error: "INSUFFICIENT_BALANCE", message: "A dispute needs a 0.5 NEAR bond in your Quire balance." });
    return { ok: true, bond: DISPUTE_BOND };
  });

  app.post("/markets/:slug/finalize", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await load(slug);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    if (!simOnly(row.m)) return reply.code(409).send({ error: "ONCHAIN", message: "Settle with your wallet; this market settles on NEAR." });
    const r = await latest(row.m.id);
    if (!r || row.m.status !== "RESOLUTION_PROPOSED" || stage(r) !== "READY_TO_SETTLE") return reply.code(409).send({ error: "BAD_STATUS", message: "The challenge window is still open, or there is nothing to settle." });
    const status = r.verdict === "YES" ? "RESOLVED_YES" : r.verdict === "NO" ? "RESOLVED_NO" : "INVALID";
    await app.db.transaction(async (tx) => {
      await tx.update(markets).set({ status, updatedAt: new Date() }).where(eq(markets.id, row.m.id));
      await tx.update(rulings).set({ finalizedAt: new Date() }).where(eq(rulings.id, r.id));
    });
    return { ok: true, status };
  });

  app.post("/markets/:slug/redeem", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await app.requireSession(req, reply);
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const row = await load(slug);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    if (!simOnly(row.m)) return reply.code(409).send({ error: "ONCHAIN", message: "Redeem with your wallet; this market settles on NEAR." });
    const verdict = { RESOLVED_YES: "YES", RESOLVED_NO: "NO", INVALID: "INVALID" }[row.m.status as string];
    if (!verdict) return reply.code(409).send({ error: "NOT_RESOLVED", message: "This claim is not settled yet." });
    const payout = await app.db.transaction(async (tx) => {
      const [p] = await tx.select().from(positions).where(and(eq(positions.marketId, row.m.id), eq(positions.traderAccount, s.accountId))).for("update");
      if (!p) return 0n;
      const v = payoutFor(verdict, p.yesShares, p.noShares);
      const pnl = BigInt(p.realizedPnl) + v - p.yesCost - p.noCost;
      await tx.update(positions).set({ yesShares: 0n, noShares: 0n, yesCost: 0n, noCost: 0n, realizedPnl: pnl.toString() }).where(eq(positions.id, p.id));
      await tx.update(markets).set({ sets: sql`${markets.sets} - ${v.toString()}::numeric` }).where(eq(markets.id, row.m.id));
      if (v > 0n) await credit(tx, s.accountId, v);
      return v;
    });
    return { payout };
  });

  // ---------- on-chain settlement: dispute, finalize, redeem signed by the user's wallet ----------
  app.post("/onchain/resolution", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ctx = chainCtx(app);
    if (!ctx) return reply.code(409).send({ error: "NOT_ONCHAIN", message: "this deployment runs in simulated mode" });
    const body = z.object({ txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/), signerId: z.string().min(2).max(64) }).parse(req.body);
    try {
      return await ingestResolutionTx(app.db, ctx, body.txHash, body.signerId);
    } catch (e) {
      if (e instanceof IngestError) return reply.code(e.code === "TX_NOT_FOUND" ? 404 : 422).send({ error: e.code, message: e.message });
      throw e;
    }
  });
}
