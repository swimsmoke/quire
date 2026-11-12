import Link from "next/link";
import { BookOpenText, ChartNoAxesCombined, Scale, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ago, fmtNear } from "@/lib/format";
import { PageTitle } from "@/components/section";
import type { Agent } from "@/lib/types";

export const metadata = { title: "Agents" };

const ROLE: Record<Agent["role"], { label: string; icon: typeof Search }> = {
  RESEARCH: { label: "Research", icon: Search },
  ANALYSIS: { label: "Analysis", icon: Scale },
  TRADING: { label: "Trading", icon: ChartNoAxesCombined },
  KNOWLEDGE: { label: "Knowledge", icon: BookOpenText },
};

const PERMISSION: Record<string, string> = {
  SUBMIT_EVIDENCE: "Submit evidence",
  ANALYSE: "Publish analysis",
  TRADE: "Trade within limits",
  GENERATE_ARTICLE: "Write encyclopedia revisions",
};

function strategyRows(p: Record<string, string | number>): [string, string][] {
  const r: [string, string][] = [];
  if (p.edgeThresholdPpm != null) r.push(["Trades when its estimate differs from the price by", `${Number(p.edgeThresholdPpm) / 10_000} points or more`]);
  if (p.minConfidence != null) r.push(["Minimum confidence", String(p.minConfidence)]);
  if (p.kellyFractionBps != null) r.push(["Sizing", `${Number(p.kellyFractionBps) / 100}% of Kelly`]);
  if (p.maxTrade != null) r.push(["Largest single trade", `${fmtNear(String(p.maxTrade))} NEAR`]);
  if (p.spendLimit != null) r.push(["Total spend limit", `${fmtNear(String(p.spendLimit))} NEAR`]);
  if (p.maxPositionPerMarket != null) r.push(["Largest position per claim", `${fmtNear(String(p.maxPositionPerMarket))} NEAR`]);
  return r;
}

export default async function AgentsPage() {
  const { agents } = await api.agents();
  const activity = await Promise.all(agents.map((a) => api.agentActivity(a.slug).then((r) => r.activity.slice(0, 4)).catch(() => [])));

  return (
    <>
      <PageTitle
        title="Agents"
        subtitle="Quire is designed around four agents, each with one job and only the permissions it needs. Two run today: Scout checks evidence and Scribe writes the encyclopedia. The analysis and trading agents are planned, and the contract already enforces the trading limits they will work under."
      />
      <div className="space-y-14">
        {agents.map((a, i) => {
          const role = ROLE[a.role];
          const Icon = role.icon;
          return (
            <section key={a.id} aria-labelledby={`agent-${a.slug}`} className="grid gap-x-14 gap-y-6 border-t hairline pt-8 lg:grid-cols-2">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-tint/12 text-tint">
                    <Icon size={21} strokeWidth={1.8} aria-hidden />
                  </span>
                  <div>
                    <h2 id={`agent-${a.slug}`} className="text-title2 leading-tight font-semibold tracking-[-0.02em]">
                      {a.name}
                    </h2>
                    <p className="text-footnote text-label-2">
                      {role.label} agent,{" "}
                      <span className={a.enabled ? "text-yes" : "text-label-2"}>{a.enabled ? "active" : "not active in this build"}</span>
                    </p>
                  </div>
                </div>
                <p className="mt-4 max-w-[58ch] text-body text-label-2">{a.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {a.permissions.map((p) => (
                    <span key={p} className="rounded-md bg-fill px-3 py-1 text-footnote font-medium">
                      {PERMISSION[p] ?? p}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-footnote text-label-3">
                  {a.nearAccountId
                    ? `Trades as ${a.nearAccountId} with a key that can only call the market contract.`
                    : a.role === "TRADING"
                      ? "No NEAR account yet. When it is switched on it trades from its own account with a contract-only key."
                      : "Holds no funds and no keys."}
                </p>
              </div>

              <div className="space-y-8">
                {a.strategy && (
                  <div>
                    <h3 className="text-sub font-semibold">Strategy</h3>
                    <p className="mt-1 text-sub text-label-2">{a.strategy.description}</p>
                    <dl className="tabular mt-3 divide-y hairline border-y hairline text-sub">
                      {strategyRows(a.strategy.params).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-6 py-2.5">
                          <dt className="text-label-2">{k}</dt>
                          <dd className="text-right font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <div>
                  <h3 className="text-sub font-semibold">Record</h3>
                  <p className="tabular mt-1 text-sub text-label-2">
                    {a.stats.activityCount} actions, {a.stats.tradeCount} trades, {fmtNear(a.stats.volume)} NEAR traded. Last active {ago(a.stats.lastActiveAt)}.
                  </p>
                  {activity[i]!.length > 0 && (
                    <ul className="mt-2 divide-y hairline text-sub">
                      {activity[i]!.map((x) => (
                        <li key={x.id} className="flex justify-between gap-4 py-2">
                          {x.marketSlug ? (
                            <Link href={`/markets/${x.marketSlug}`} className="hover:text-tint">
                              {x.summary}
                            </Link>
                          ) : (
                            <span>{x.summary}</span>
                          )}
                          <span className="shrink-0 text-footnote text-label-3">{ago(x.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
