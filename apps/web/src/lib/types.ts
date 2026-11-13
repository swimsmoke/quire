// Mirrors the API's JSON. All amounts are base-unit integer strings (6 decimals).

export type ExecutionMode = "SIMULATED" | "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET";

export interface Market {
  id: string;
  slug: string;
  question: string;
  subject: string;
  category: string;
  status: string;
  executionMode: ExecutionMode;
  contractId: string | null;
  onchainId: number | null;
  probabilityYesPpm: number;
  probabilityNoPpm: number;
  poolYes: string;
  poolNo: string;
  liquidity: string;
  volume: string;
  volume24h: string;
  fees: string;
  feeBps: number;
  tradeCount: number;
  humanTraders: number;
  agentTraders: number;
  lastTradeAt: string | null;
  change24hPpm: number;
  createdAt: string;
}

export interface Claim {
  id: string;
  title: string;
  subject: string;
  category: string;
  description: string;
  resolutionCriteria: string;
}

export interface Trade {
  id: string;
  marketId: string;
  traderAccount: string;
  actorKind: "HUMAN" | "AGENT";
  side: "BUY" | "SELL";
  outcome: "YES" | "NO";
  collateral: string;
  shares: string;
  fee: string;
  priceBeforePpm: number;
  priceAfterPpm: number;
  avgPricePpm: number;
  executionMode: ExecutionMode;
  createdAt: string;
  slug?: string;
  question?: string;
  agentName?: string | null;
}

export interface Quote {
  side: "BUY" | "SELL";
  outcome: "YES" | "NO";
  amountIn: string;
  fee: string;
  amountOut: string;
  avgPricePpm: string;
  priceBeforePpm: string;
  priceAfterPpm: string;
  priceImpactPpm: string;
  minAmountOut: string;
  slippageBps: number;
  executionMode: ExecutionMode;
  quotedAt: string;
}

export interface HistoryPoint {
  t: string;
  p: number;
  v: string;
  cause: string;
}

export interface Inference {
  mode: "CONFIDENTIAL_TEE" | "SIMULATED";
  provider: string;
  model: string;
  chatId: string | null;
  requestHash: string | null;
  responseHash: string | null;
  signature: string | null;
  signingAddress: string | null;
  signingAlgo: string | null;
  signatureVerified: boolean | null;
  attestationBindsSigner: boolean | null;
  createdAt: string;
}

export interface ArticleSection {
  heading: string;
  body: string;
  citations?: string[];
}

export interface ArticleContent {
  summary?: string;
  sections?: ArticleSection[];
  [k: string]: unknown;
}

export interface Encyclopedia {
  page: { id: string; revisionCount: number } | null;
  current: {
    id: string;
    revisionNumber: number;
    content: ArticleContent;
    priceYesPpm: number;
    evidenceIds: string[];
    triggerReason: string;
    createdAt: string;
    inference: Inference | null;
  } | null;
  revisions: { id: string; revisionNumber: number; priceYesPpm: number; triggerReason: string; createdAt: string }[];
}

export interface Evidence {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string | null;
  retrievedAt: string | null;
  evidenceType: string;
  stance: "SUPPORTS" | "CONTRADICTS" | "CONTEXT";
  excerpt: string;
  verificationStatus: "UNVERIFIED" | "FETCHED" | "EXCERPT_VERIFIED" | "EXCERPT_NOT_FOUND" | "FETCH_FAILED";
  verificationDetail: string | null;
  agentName: string | null;
  createdAt: string;
}

export interface AgentActivity {
  id: string;
  kind: string;
  summary: string;
  agentName?: string;
  agentSlug?: string;
  role?: string;
  marketSlug?: string | null;
  createdAt: string;
}

export interface Agent {
  id: string;
  slug: string;
  name: string;
  role: "RESEARCH" | "ANALYSIS" | "TRADING" | "KNOWLEDGE";
  description: string;
  nearAccountId: string | null;
  model: string | null;
  enabled: boolean;
  permissions: string[];
  strategy: { name: string; description: string; params: Record<string, string | number> } | null;
  stats: { activityCount: number; tradeCount: number; volume: string; lastActiveAt: string | null };
}

export interface Health {
  ok: boolean;
  executionMode: "SIMULATED" | "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET";
  network: "testnet" | "mainnet";
  integrations: Record<string, string | boolean | null>;
}

export interface LeaderRow {
  account: string;
  actorKind: "HUMAN" | "AGENT";
  pnl: string;
  trades: number;
  markets: number;
  volume: string;
}

export interface ClaimDraft {
  question: string;
  subject: string;
  category: string;
  description: string;
  resolutionCriteria: string;
}
