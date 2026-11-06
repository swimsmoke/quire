/**
 * Quire relational schema (PostgreSQL via Drizzle).
 *
 * Money/share amounts are base-unit integers (6 decimals) stored as
 * numeric(39,0) — wide enough for u128 — and surfaced in TS as bigint.
 * Probabilities/prices are integer parts-per-million.
 * Nothing here is ever a JS float.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const u128 = customType<{ data: bigint; driverData: string }>({
  dataType: () => "numeric(39,0)",
  toDriver: (v) => v.toString(),
  fromDriver: (v) => BigInt(v),
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

// ---------- enums ----------
export const executionMode = pgEnum("execution_mode", ["ONCHAIN_TESTNET", "ONCHAIN_MAINNET", "SIMULATED"]);
export const marketStatus = pgEnum("market_status", ["ACTIVE", "PAUSED", "RESOLUTION_PROPOSED", "RESOLVED_YES", "RESOLVED_NO", "INVALID"]);
export const outcome = pgEnum("outcome", ["YES", "NO"]);
export const tradeSide = pgEnum("trade_side", ["BUY", "SELL"]);
export const actorKind = pgEnum("actor_kind", ["HUMAN", "AGENT"]);
export const walletKind = pgEnum("wallet_kind", ["NEAR_ACCOUNT", "CHAIN_SIGNATURES_DERIVED", "EXTERNAL"]);
export const txStatus = pgEnum("tx_status", ["PENDING", "SUCCESS", "FAILED"]);
export const fundingStatus = pgEnum("funding_status", ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "EXPIRED", "REFUNDED"]);
export const agentRole = pgEnum("agent_role", ["RESEARCH", "ANALYSIS", "TRADING", "KNOWLEDGE"]);
export const evidenceStance = pgEnum("evidence_stance", ["SUPPORTS", "CONTRADICTS", "CONTEXT"]);
export const evidenceType = pgEnum("evidence_type", ["ARTICLE", "DATA", "OFFICIAL", "ACADEMIC", "SOCIAL", "OTHER"]);
export const verificationStatus = pgEnum("verification_status", [
  "UNVERIFIED", // submitted, not yet fetched
  "FETCHED", // URL retrieved by Quire, no excerpt to check
  "EXCERPT_VERIFIED", // excerpt text found verbatim in the retrieved document
  "EXCERPT_NOT_FOUND", // retrieved, but excerpt not present
  "FETCH_FAILED",
]);
export const inferenceMode = pgEnum("inference_mode", ["CONFIDENTIAL_TEE", "SIMULATED"]);

// ---------- identity ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  nearAccountId: text("near_account_id").notNull().unique(),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: created(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    chain: text("chain").notNull(), // near | eth | base | arb | sol | btc ...
    address: text("address").notNull(),
    kind: walletKind("kind").notNull(),
    derivationPath: text("derivation_path"), // Chain Signatures path, e.g. "quire-funding-1"
    verifiedAt: ts("verified_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("wallets_chain_address_uq").on(t.chain, t.address)],
);

export const authChallenges = pgTable("auth_challenges", {
  nonce: text("nonce").primaryKey(), // base64 32-byte NEP-413 nonce
  accountId: text("account_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: created(),
});

// ---------- claims & markets ----------
export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(), // the claim, phrased as a yes/no question
  subject: text("subject").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  resolutionCriteria: text("resolution_criteria").notNull(),
  createdAt: created(),
});

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id").notNull().unique().references(() => claims.id),
    slug: text("slug").notNull().unique(),
    executionMode: executionMode("execution_mode").notNull(),
    contractId: text("contract_id"), // NEAR market contract when on-chain
    onchainId: integer("onchain_id"),
    status: marketStatus("status").notNull().default("ACTIVE"),
    poolYes: u128("pool_yes").notNull(),
    poolNo: u128("pool_no").notNull(),
    sets: u128("sets").notNull(), // collateral backing all outcome shares
    fees: u128("fees").notNull().default(sql`0`),
    feeBps: integer("fee_bps").notNull(),
    volume: u128("volume").notNull().default(sql`0`),
    tradeCount: integer("trade_count").notNull().default(0),
    priceYesPpm: integer("price_yes_ppm").notNull(),
    lpAccount: text("lp_account").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("markets_contract_onchain_uq").on(t.contractId, t.onchainId), index("markets_status_idx").on(t.status)],
);

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id").notNull().references(() => markets.id, { onDelete: "cascade" }),
    priceYesPpm: integer("price_yes_ppm").notNull(),
    poolYes: u128("pool_yes").notNull(),
    poolNo: u128("pool_no").notNull(),
    volume: u128("volume").notNull(),
    tradeCount: integer("trade_count").notNull(),
    cause: text("cause").notNull(), // CREATED | TRADE | RECONCILE
    takenAt: ts("taken_at").notNull().defaultNow(),
  },
  (t) => [index("snapshots_market_time_idx").on(t.marketId, t.takenAt)],
);

// ---------- ledger ----------
/** Collateral balances per trading account. In SIMULATED mode this IS the ledger;
 *  on-chain it mirrors the contract's get_account().balance (contract is source of truth). */
export const accountBalances = pgTable(
  "account_balances",
  {
    traderAccount: text("trader_account").notNull(),
    executionMode: executionMode("execution_mode").notNull(),
    available: u128("available").notNull().default(sql`0`),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("balances_pk").on(t.traderAccount, t.executionMode)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    network: text("network").notNull(), // near-testnet | near-mainnet | eth | base | sim
    txHash: text("tx_hash").notNull(),
    signerId: text("signer_id"),
    receiverId: text("receiver_id"),
    kind: text("kind").notNull(), // TRADE | DEPOSIT | WITHDRAW | FUNDING_DEPOSIT | BRIDGE_MINT | AGENT_* | CHAIN_SIG
    status: txStatus("status").notNull().default("PENDING"),
    blockHeight: u128("block_height"),
    logs: jsonb("logs").$type<string[]>(),
    error: text("error"),
    executionMode: executionMode("execution_mode").notNull(),
    verifiedAt: ts("verified_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("transactions_network_hash_uq").on(t.network, t.txHash)],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id").notNull().references(() => markets.id),
    traderAccount: text("trader_account").notNull(),
    actorKind: actorKind("actor_kind").notNull(),
    userId: uuid("user_id").references(() => users.id),
    agentId: uuid("agent_id").references(() => agents.id),
    yesShares: u128("yes_shares").notNull().default(sql`0`),
    noShares: u128("no_shares").notNull().default(sql`0`),
    /** Collateral paid for currently held shares (average-cost basis). */
    yesCost: u128("yes_cost").notNull().default(sql`0`),
    noCost: u128("no_cost").notNull().default(sql`0`),
    /** Signed realised PnL as numeric (may be negative). */
    realizedPnl: text("realized_pnl").notNull().default("0"),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("positions_market_trader_uq").on(t.marketId, t.traderAccount), index("positions_trader_idx").on(t.traderAccount)],
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id").notNull().references(() => markets.id),
    traderAccount: text("trader_account").notNull(),
    actorKind: actorKind("actor_kind").notNull(),
    userId: uuid("user_id").references(() => users.id),
    agentId: uuid("agent_id").references(() => agents.id),
    side: tradeSide("side").notNull(),
    outcome: outcome("outcome").notNull(),
    collateral: u128("collateral").notNull(), // paid (BUY) or received (SELL), gross for BUY / net for SELL
    shares: u128("shares").notNull(),
    fee: u128("fee").notNull(),
    priceBeforePpm: integer("price_before_ppm").notNull(), // YES prob before
    priceAfterPpm: integer("price_after_ppm").notNull(), // YES prob after
    avgPricePpm: integer("avg_price_ppm").notNull(), // per-share execution price of traded outcome
    poolYesAfter: u128("pool_yes_after").notNull(),
    poolNoAfter: u128("pool_no_after").notNull(),
    executionMode: executionMode("execution_mode").notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    eventIndex: integer("event_index"),
    clientOrderId: text("client_order_id"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("trades_client_order_uq").on(t.traderAccount, t.clientOrderId),
    uniqueIndex("trades_tx_event_uq").on(t.transactionId, t.eventIndex),
    index("trades_market_time_idx").on(t.marketId, t.createdAt),
    index("trades_trader_idx").on(t.traderAccount, t.createdAt),
  ],
);

// ---------- funding (NEAR Intents) ----------
export const fundingRequests = pgTable(
  "funding_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    provider: text("provider").notNull().default("NEAR_INTENTS_1CLICK"),
    originAsset: text("origin_asset").notNull(),
    originChain: text("origin_chain").notNull(),
    destinationAsset: text("destination_asset").notNull(),
    amountIn: u128("amount_in").notNull(),
    amountOutExpected: u128("amount_out_expected"),
    amountOutMin: u128("amount_out_min"),
    depositAddress: text("deposit_address").unique(),
    depositMemo: text("deposit_memo"),
    refundTo: text("refund_to").notNull(),
    quote: jsonb("quote"),
    quoteSignature: text("quote_signature"),
    deadline: ts("deadline"),
    status: fundingStatus("status").notNull().default("PENDING"),
    providerStatus: text("provider_status"),
    depositTxHash: text("deposit_tx_hash"),
    settlementTxHash: text("settlement_tx_hash"),
    creditTransactionId: uuid("credit_transaction_id").references(() => transactions.id),
    creditedAmount: u128("credited_amount"),
    signedViaChainSignatures: boolean("signed_via_chain_signatures").notNull().default(false),
    error: text("error"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("funding_user_idx").on(t.userId, t.createdAt), index("funding_status_idx").on(t.status)],
);

export const fundingEvents = pgTable("funding_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundingRequestId: uuid("funding_request_id").notNull().references(() => fundingRequests.id, { onDelete: "cascade" }),
  status: fundingStatus("status").notNull(),
  providerStatus: text("provider_status"),
  detail: jsonb("detail"),
  createdAt: created(),
});

// ---------- agents ----------
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role: agentRole("role").notNull(),
  description: text("description").notNull(),
  nearAccountId: text("near_account_id").unique(), // trading agents hold a function-call key only
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  model: text("model"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const agentPermissions = pgTable(
  "agent_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(), // SUBMIT_EVIDENCE | ANALYSE | TRADE | GENERATE_ARTICLE
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id),
    createdAt: created(),
  },
  (t) => [uniqueIndex("agent_permission_uq").on(t.agentId, t.permission)],
);

export const agentStrategies = pgTable("agent_strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** { edgeThresholdPpm, minConfidence, kellyFractionBps, maxTrade, spendLimit, maxPositionPerMarket } (amounts as strings) */
  params: jsonb("params").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export const agentActivities = pgTable(
  "agent_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    marketId: uuid("market_id").references(() => markets.id),
    kind: text("kind").notNull(), // RESEARCH_RUN | EVIDENCE_SUBMITTED | ANALYSIS | TRADE_DECISION | TRADE_EXECUTED | TRADE_REJECTED | ARTICLE_GENERATED
    summary: text("summary").notNull(),
    payload: jsonb("payload"),
    inferenceId: uuid("inference_id").references(() => aiInferences.id),
    tradeId: uuid("trade_id").references(() => trades.id),
    createdAt: created(),
  },
  (t) => [index("agent_activity_idx").on(t.agentId, t.createdAt), index("agent_activity_market_idx").on(t.marketId, t.createdAt)],
);

// ---------- evidence ----------
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id").notNull().references(() => claims.id),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceName: text("source_name").notNull(),
    publishedAt: ts("published_at"),
    retrievedAt: ts("retrieved_at"),
    evidenceType: evidenceType("evidence_type").notNull(),
    stance: evidenceStance("stance").notNull(),
    excerpt: text("excerpt").notNull(),
    excerptHash: text("excerpt_hash").notNull(),
    contentHash: text("content_hash"), // sha256 of retrieved body
    httpStatus: integer("http_status"),
    finalUrl: text("final_url"),
    verificationStatus: verificationStatus("verification_status").notNull().default("UNVERIFIED"),
    verificationDetail: text("verification_detail"),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
    submittedByAgentId: uuid("submitted_by_agent_id").references(() => agents.id),
    createdAt: created(),
  },
  (t) => [uniqueIndex("evidence_claim_url_excerpt_uq").on(t.claimId, t.sourceUrl, t.excerptHash), index("evidence_claim_idx").on(t.claimId)],
);

export const evidenceSubmissions = pgTable("evidence_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceId: uuid("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  agentId: uuid("agent_id").references(() => agents.id),
  note: text("note"),
  createdAt: created(),
});

// ---------- AI ----------
export const aiInferences = pgTable("ai_inferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull(), // ARTICLE | EVIDENCE_EXTRACTION | ANALYSIS
  mode: inferenceMode("mode").notNull(),
  provider: text("provider").notNull(), // near-ai-cloud | dev-simulator
  model: text("model").notNull(),
  chatId: text("chat_id"),
  requestHash: text("request_hash"), // sha256 of exact request body bytes
  responseHash: text("response_hash"), // sha256 of exact response body bytes
  responseText: text("response_text"),
  status: text("status").notNull(), // OK | INVALID_OUTPUT | ERROR
  error: text("error"),
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  signatureText: text("signature_text"),
  signature: text("signature"),
  signingAddress: text("signing_address"),
  signingAlgo: text("signing_algo"),
  signatureVerified: boolean("signature_verified"), // recovered signer == signing_address AND hashes match
  attestationReport: jsonb("attestation_report"),
  attestationNonce: text("attestation_nonce"),
  attestationBindsSigner: boolean("attestation_binds_signer"), // signing_address present in attested report_data
  createdAt: created(),
});

export const encyclopediaPages = pgTable("encyclopedia_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id").notNull().unique().references(() => claims.id),
  currentRevisionId: uuid("current_revision_id"),
  revisionCount: integer("revision_count").notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
});

export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => encyclopediaPages.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    content: jsonb("content").notNull(), // validated structured article (see ai/article-schema.ts)
    priceYesPpm: integer("price_yes_ppm").notNull(),
    marketSnapshotId: uuid("market_snapshot_id").references(() => marketSnapshots.id),
    evidenceIds: uuid("evidence_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    triggerReason: text("trigger_reason").notNull(),
    inferenceId: uuid("inference_id").references(() => aiInferences.id),
    createdAt: created(),
  },
  (t) => [uniqueIndex("revision_page_number_uq").on(t.pageId, t.revisionNumber)],
);

export const indexerCursors = pgTable("indexer_cursors", {
  name: text("name").primaryKey(),
  blockHeight: u128("block_height").notNull(),
  updatedAt: updated(),
});
