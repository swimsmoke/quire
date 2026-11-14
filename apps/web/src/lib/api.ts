import type { Ruling, RulingInference, LeaderRow, Profile, Agent, AgentActivity, Claim, Encyclopedia, Evidence, Health, HistoryPoint, Market, Trade } from "./types";

/** Server-side base URL (inside the network) vs browser base URL. */
const SERVER_API = process.env.QUIRE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const BROWSER_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${SERVER_API}${path}`, { cache: "no-store" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body.error ?? "HTTP_ERROR", body.message ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

export const api = {
  health: () => get<Health>("/health"),
  markets: (params: { q?: string; category?: string; sort?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return get<{ markets: Market[] }>(`/markets${qs ? `?${qs}` : ""}`);
  },
  categories: () => get<{ category: string; count: number }[]>("/categories"),
  market: (slug: string) => get<{ market: Market; claim: Claim; related: Market[] }>(`/markets/${encodeURIComponent(slug)}`),
  history: (slug: string, range = "all") => get<{ points: HistoryPoint[] }>(`/markets/${encodeURIComponent(slug)}/history?range=${range}`),
  trades: (slug: string, limit = 30) => get<{ trades: Trade[] }>(`/markets/${encodeURIComponent(slug)}/trades?limit=${limit}`),
  encyclopedia: (slug: string) => get<Encyclopedia>(`/markets/${encodeURIComponent(slug)}/encyclopedia`),
  evidence: (slug: string) => get<{ evidence: Evidence[] }>(`/markets/${encodeURIComponent(slug)}/evidence`),
  marketAgentActivity: (slug: string) => get<{ activity: AgentActivity[] }>(`/markets/${encodeURIComponent(slug)}/agent-activity`),
  activity: (limit = 12) => get<{ activity: Trade[] }>(`/activity?limit=${limit}`),
  agents: () => get<{ agents: Agent[] }>("/agents"),
  leaderboard: () => get<{ leaderboard: LeaderRow[] }>("/leaderboard"),
  profile: (account: string) => get<Profile>(`/profile/${encodeURIComponent(account)}`),
  ruling: (slug: string) => get<{ ruling: Ruling | null; cooldownS: number; juryReady: boolean }>(`/markets/${encodeURIComponent(slug)}/ruling`),
  results: () => get<{ results: Ruling[]; counts: { total: number; settled: number } }>("/results"),
  rulingDetail: (id: string) => get<Ruling & { inferences: RulingInference[] }>(`/rulings/${encodeURIComponent(id)}`),
  agentActivity: (slug: string) => get<{ activity: AgentActivity[] }>(`/agents/${encodeURIComponent(slug)}/activity`),
};

/** Browser-side request with the session token. */
export async function clientRequest<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const r = await fetch(`${BROWSER_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? "HTTP_ERROR", body.message ?? humanError(body.error) ?? r.statusText);
  return body as T;
}

export function humanError(code?: string): string | undefined {
  switch (code) {
    case "SLIPPAGE":
      return "The price moved past your slippage limit. Get a new quote and try again.";
    case "INSUFFICIENT_BALANCE":
      return "Your NEAR balance is too low for this trade. Add funds or lower the amount.";
    case "INSUFFICIENT_SHARES":
      return "You don't hold that many shares in this outcome.";
    case "DUPLICATE_ORDER":
      return "This order was already submitted. Check your trade history before retrying.";
    case "MARKET_NOT_ACTIVE":
      return "Trading is paused on this market.";
    case "LIQUIDITY_TOO_LOW":
      return "A new market needs at least 0.1 NEAR of liquidity.";
    case "UNAUTHENTICATED":
      return "Sign in to trade.";
    case "VALIDATION":
      return "Check the amount: use a plain number with up to 6 decimal places.";
    default:
      return undefined;
  }
}
