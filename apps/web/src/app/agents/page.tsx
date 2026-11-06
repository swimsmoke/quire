import Link from "next/link";
import { Bot } from "lucide-react";
import { api } from "@/lib/api";
import { ago, qusd } from "@/lib/format";
import type { Agent } from "@/lib/types";

export const metadata = { title: "Agents" };

const ROLE: Record<Agent["role"], string> = {
  RESEARCH: "Research",
  ANALYSIS: "Analysis",
  TRADING: "Trading",
  KNOWLEDGE: "Knowledge",
};

const PERMISSION: Record<string, string> = {
  SUBMIT_EVIDENCE: "Submit evidence",
  ANALYSE: "Publish analysis",
  TRADE: "Trade within limits",
  GENERATE_ARTICLE: "Write encyclopedia revisions",
};

function strategyRows(p: Record<string, string | number>): [string, string][] {
  const rows: [string, string][] = [];
  if (p.edgeThresholdPpm != null) rows.push(["Trades only when its estimate differs from the market by", `${Number(p.edgeThresholdPpm) / 10_000} points`]);
  if (p.minConfidence != null) rows.push(["Minimum analysis confidence", String(p.minConfidence)]);
  if (p.kellyFractionBps != null) rows.push(["Position sizing", `${Number(p.kellyFractionBps) / 100}% of Kelly`]);
  if (p.maxTrade != null) rows.push(["Largest single trade", `${qusd(String(p.maxTrade))} qUSD`]);
  if (p.spendLimit != null) rows.push(["Total spend limit", `${qusd(String(p.spendLimit))} qUSD`]);
  if (p.maxPositionPerMarket != null) rows.push(["Largest position in one claim", `${qusd(String(p.maxPositionPerMarket))} qUSD`]);
  return rows;
}

export default async function AgentsPage() {
  const { agents } = await api.agents();
  const activity = await Promise.all(agents.map((a) => api.agentActivity(a.slug).then((r) => r.activity.slice(0, 5)).catch(() => [])));

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-2 max-w-[62ch] text-fade">
        Four agents work on every claim, each with one job and only the permissions that job needs. Research and trading are separate: an agent that recommends a trade cannot authorise it, and the trading agent can only spend what its owner funded, inside limits the contract enforces.
      </p>

      <ul className="mt-10 space-y-12">
        {agents.map((a, i) => (
          <li key={a.id} className="grid gap-6 border-t border-ink pt-6 lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Bot size={18} aria-hidden /> {a.name}
              </h2>
              <p className="mt-1 text-sm text-fade">
                {ROLE[a.role]} agent, {a.enabled ? "enabled" : "disabled"}
              </p>
              <p className="mt-3 max-w-prose">{a.description}</p>
              <h3 className="mt-5 text-sm font-semibold">Permissions</h3>
              <ul className="mt-1 text-sm">
                {a.permissions.map((p) => (
                  <li key={p}>{PERMISSION[p] ?? p}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-fade">
                {a.nearAccountId ? `Trades as ${a.nearAccountId} with a function-call key only.` : a.role === "TRADING" ? "No NEAR account yet. It receives a testnet account with a function-call key when on-chain trading is enabled." : "Does not hold funds or keys."}
              </p>
              <p className="mt-1 text-sm text-fade">Enable and disable controls appear for the agent&apos;s owner.</p>
            </div>
            <div className="space-y-6">
              {a.strategy && (
                <div>
                  <h3 className="text-sm font-semibold">Strategy</h3>
                  <p className="mt-1 text-sm">{a.strategy.description}</p>
                  <dl className="tabular mt-3 divide-y divide-rule border-y border-rule text-sm">
                    {strategyRows(a.strategy.params).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-1.5">
                        <dt className="text-fade">{k}</dt>
                        <dd className="text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold">Record</h3>
                <p className="tabular mt-1 text-sm">
                  {a.stats.activityCount} actions, {a.stats.tradeCount} trades, {qusd(a.stats.volume)} qUSD traded. Last active {ago(a.stats.lastActiveAt)}.
                </p>
                {activity[i]!.length ? (
                  <ul className="mt-2 divide-y divide-rule text-sm">
                    {activity[i]!.map((x) => (
                      <li key={x.id} className="py-1.5">
                        {x.marketSlug ? (
                          <Link href={`/markets/${x.marketSlug}`} className="hover:underline">
                            {x.summary}
                          </Link>
                        ) : (
                          x.summary
                        )}{" "}
                        <span className="text-xs text-fade">{ago(x.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-fade">No activity yet.</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
