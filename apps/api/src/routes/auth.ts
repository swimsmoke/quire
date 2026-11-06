import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { accountBalances, transactions, users } from "../db/schema.js";

const FAUCET_AMOUNT = 1_000_000_000n; // 1,000 qUSD

export async function authRoutes(app: FastifyInstance) {
  /**
   * DEV ONLY: passwordless login for *.sim accounts in SIMULATED mode.
   * Real sign-in (NEP-413 signed message from a NEAR wallet) is added in Stage 3.
   */
  app.post("/auth/dev-login", async (req, reply) => {
    if (!app.cfg.QUIRE_DEV_AUTH) return reply.code(404).send({ error: "NOT_FOUND" });
    const { handle } = z.object({ handle: z.string().regex(/^[a-z0-9_-]{2,32}$/) }).parse(req.body);
    const accountId = `${handle}.sim`;
    await app.db.insert(users).values({ nearAccountId: accountId, displayName: handle }).onConflictDoNothing();
    const [u] = await app.db.select().from(users).where(eq(users.nearAccountId, accountId));
    const token = await app.sessions.sign({ userId: u!.id, accountId, method: "DEV_SIM" });
    return { token, accountId, method: "DEV_SIM", warning: "Simulated account: not a NEAR wallet. Trades are not on-chain." };
  });

  app.get("/me", async (req, reply) => {
    const s = await app.requireSession(req, reply);
    const [u] = await app.db.select().from(users).where(eq(users.id, s.userId));
    const balances = await app.db.select().from(accountBalances).where(eq(accountBalances.traderAccount, s.accountId));
    return { user: u, session: { accountId: s.accountId, method: s.method }, balances };
  });

  /** SIMULATED-mode faucet: 1,000 qUSD per account per UTC day, recorded as a sim transaction. */
  app.post("/faucet", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const s = await app.requireSession(req, reply);
    if (app.cfg.QUIRE_EXECUTION_MODE !== "SIMULATED") {
      return reply.code(409).send({ error: "USE_ONCHAIN_FAUCET", message: "call faucet() on the qUSD testnet contract from your wallet" });
    }
    const day = new Date().toISOString().slice(0, 10);
    const ref = `faucet:${s.accountId}:${day}`;
    const res = await app.db.transaction(async (tx) => {
      const ins = await tx
        .insert(transactions)
        .values({ network: "sim", txHash: ref, signerId: s.accountId, kind: "FAUCET", status: "SUCCESS", executionMode: "SIMULATED", verifiedAt: new Date() })
        .onConflictDoNothing()
        .returning();
      if (ins.length === 0) return null;
      await tx.insert(accountBalances).values({ traderAccount: s.accountId, executionMode: "SIMULATED", available: 0n }).onConflictDoNothing();
      const [b] = await tx
        .select()
        .from(accountBalances)
        .where(and(eq(accountBalances.traderAccount, s.accountId), eq(accountBalances.executionMode, "SIMULATED")))
        .for("update");
      const [nb] = await tx
        .update(accountBalances)
        .set({ available: b!.available + FAUCET_AMOUNT, updatedAt: new Date() })
        .where(and(eq(accountBalances.traderAccount, s.accountId), eq(accountBalances.executionMode, "SIMULATED")))
        .returning();
      return nb!;
    });
    if (!res) return reply.code(429).send({ error: "FAUCET_COOLDOWN", message: "faucet already used today" });
    return { credited: FAUCET_AMOUNT, available: res.available, executionMode: "SIMULATED" };
  });
}
