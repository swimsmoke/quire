/**
 * Trading profit, replayed from trades. Cash out for buys, cash in for sales, plus the shares still
 * held valued at the Yes/No price. The same function backs the leaderboard and profiles,
 * so the two always agree. Liquidity a creator seeds into a market is not trading and is left out.
 */
export interface PnlTrade {
  marketId: string;
  side: "BUY" | "SELL";
  outcome: "YES" | "NO";
  collateral: bigint;
  shares: bigint;
  priceAfterPpm: number;
  createdAt: Date;
}

export interface MarketPnl {
  marketId: string;
  cash: bigint;
  yes: bigint;
  no: bigint;
  value: bigint;
  pnl: bigint;
}

const SCALE = 1_000_000n;
const value = (yes: bigint, no: bigint, pYes: number) => (yes * BigInt(pYes) + no * (SCALE - BigInt(pYes))) / SCALE;

export function pnlByMarket(trades: PnlTrade[], priceNow: Map<string, number>): MarketPnl[] {
  const m = new Map<string, { cash: bigint; yes: bigint; no: bigint }>();
  for (const t of trades) {
    const s = m.get(t.marketId) ?? { cash: 0n, yes: 0n, no: 0n };
    const sign = t.side === "BUY" ? 1n : -1n;
    s.cash += t.side === "BUY" ? -t.collateral : t.collateral;
    if (t.outcome === "YES") s.yes += sign * t.shares;
    else s.no += sign * t.shares;
    m.set(t.marketId, s);
  }
  return [...m.entries()].map(([marketId, s]) => {
    const v = value(s.yes, s.no, priceNow.get(marketId) ?? 500_000);
    return { marketId, ...s, value: v, pnl: s.cash + v };
  });
}

/** Profit over time: one point per trade by this account and per price change on a market they hold. */
export function pnlSeries(trades: PnlTrade[], prices: { marketId: string; priceYesPpm: number; at: Date }[], now: Date, maxPoints = 240) {
  type Ev = { at: number; kind: 0 | 1; t?: PnlTrade; p?: { marketId: string; priceYesPpm: number } };
  const evs: Ev[] = [...trades.map((t) => ({ at: t.createdAt.getTime(), kind: 0 as const, t })), ...prices.map((p) => ({ at: p.at.getTime(), kind: 1 as const, p }))].sort((a, b) => a.at - b.at || a.kind - b.kind);
  const first = trades.length ? Math.min(...trades.map((t) => t.createdAt.getTime())) : now.getTime();
  const held = new Map<string, { yes: bigint; no: bigint; price: number }>();
  let cash = 0n;
  // start from zero just before the first trade, so the all-time change equals total profit
  const pts: { t: string; pnl: string }[] = trades.length ? [{ t: new Date(first - 1).toISOString(), pnl: "0" }] : [];
  const total = () => {
    let v = 0n;
    for (const h of held.values()) v += value(h.yes, h.no, h.price);
    return cash + v;
  };
  for (const e of evs) {
    if (e.at < first) continue;
    if (e.t) {
      const t = e.t;
      const h = held.get(t.marketId) ?? { yes: 0n, no: 0n, price: t.priceAfterPpm };
      const sign = t.side === "BUY" ? 1n : -1n;
      cash += t.side === "BUY" ? -t.collateral : t.collateral;
      if (t.outcome === "YES") h.yes += sign * t.shares;
      else h.no += sign * t.shares;
      h.price = t.priceAfterPpm;
      held.set(t.marketId, h);
    } else if (e.p && held.has(e.p.marketId)) {
      held.get(e.p.marketId)!.price = e.p.priceYesPpm;
    } else continue;
    pts.push({ t: new Date(e.at).toISOString(), pnl: total().toString() });
  }
  if (trades.length) pts.push({ t: now.toISOString(), pnl: total().toString() });
  if (pts.length <= maxPoints) return pts;
  const step = pts.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => pts[Math.min(pts.length - 1, Math.round(i * step))]!).concat(pts[pts.length - 1]!);
}
