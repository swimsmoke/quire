import { priceYes, seedPool } from "@quire/shared";
import type { DB } from "../db/client.js";
import { claims, encyclopediaPages, marketSnapshots, markets, positions } from "../db/schema.js";
import type { ExecMode } from "./engine.js";

export interface NewMarketInput {
  slug: string;
  title: string;
  subject: string;
  category: string;
  description: string;
  resolutionCriteria: string;
  /** Starting price set by the liquidity provider. NOT a forecast. */
  initialProbPpm: bigint;
  liquidity: bigint;
  feeBps: number;
  lpAccount: string;
  executionMode: ExecMode;
  contractId?: string;
  onchainId?: number;
}

export async function createMarket(db: DB, input: NewMarketInput) {
  const seed = seedPool(input.liquidity, input.initialProbPpm);
  return db.transaction(async (tx) => {
    const [claim] = await tx
      .insert(claims)
      .values({
        title: input.title,
        subject: input.subject,
        category: input.category,
        description: input.description,
        resolutionCriteria: input.resolutionCriteria,
      })
      .returning();
    const price = priceYes(seed.pool);
    const [market] = await tx
      .insert(markets)
      .values({
        claimId: claim!.id,
        slug: input.slug,
        executionMode: input.executionMode,
        contractId: input.contractId ?? null,
        onchainId: input.onchainId ?? null,
        poolYes: seed.pool.yes,
        poolNo: seed.pool.no,
        sets: seed.sets,
        feeBps: input.feeBps,
        priceYesPpm: Number(price),
        lpAccount: input.lpAccount,
      })
      .returning();
    if (seed.lpYes > 0n || seed.lpNo > 0n) {
      await tx.insert(positions).values({
        marketId: market!.id,
        traderAccount: input.lpAccount,
        actorKind: "HUMAN",
        yesShares: seed.lpYes,
        noShares: seed.lpNo,
      });
    }
    await tx.insert(marketSnapshots).values({
      marketId: market!.id,
      priceYesPpm: Number(price),
      poolYes: seed.pool.yes,
      poolNo: seed.pool.no,
      volume: 0n,
      tradeCount: 0,
      cause: "CREATED",
    });
    await tx.insert(encyclopediaPages).values({ claimId: claim!.id });
    return { claim: claim!, market: market! };
  });
}
