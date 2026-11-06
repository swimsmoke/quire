import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, UserRound } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { InkChart } from "@/components/ink-chart";
import { SplitBar } from "@/components/market-table";
import { TradeTicket } from "@/components/trade-ticket";
import { TradeTape } from "@/components/trade-tape";
import { EncyclopediaArticle, EvidenceList } from "@/components/encyclopedia";
import { ModeTag } from "@/components/mode";
import { ago, dateTime, pct, pctWhole, qusd } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await api.market(slug).catch(() => null);
  return { title: d?.claim.title ?? "Claim" };
}

export default async function ClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let detail;
  try {
    detail = await api.market(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { market: m, claim, related } = detail;
  const [history, tape, ency, ev, agentAct] = await Promise.all([
    api.history(slug),
    api.trades(slug, 25),
    api.encyclopedia(slug),
    api.evidence(slug),
    api.marketAgentActivity(slug),
  ]);

  return (
    <div className="py-8">
      <nav className="text-sm text-fade">
        <Link href="/markets" className="hover:text-ink">
          Markets
        </Link>{" "}
        / <Link href={`/markets?category=${m.category}`} className="hover:text-ink">{m.category}</Link>
      </nav>

      <header className="mt-4 border-b border-ink pb-6">
        <h1 className="max-w-[28ch] text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2.75rem]">{claim.title}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-fade">
          <span>
            About {claim.subject}. Open since {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, with no closing date.
          </span>
          {m.status !== "ACTIVE" && <span className="text-umber">{m.status.toLowerCase().replace(/_/g, " ")}</span>}
          <ModeTag mode={m.executionMode} />
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        {/* market */}
        <section aria-labelledby="mkt-h" className="lg:col-start-1">
          <h2 id="mkt-h" className="sr-only">
            Market
          </h2>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <p className="flex items-end gap-3">
              <span className="tabular text-[5.5rem] font-semibold leading-[0.8] tracking-[-0.05em] text-ledger sm:text-[7.5rem]">{pctWhole(m.probabilityYesPpm)}</span>
              <span className="pb-1 text-sm">
                percent yes
                <br />
                <span className="text-fade">{pct(m.probabilityYesPpm, 2)} exactly</span>
              </span>
            </p>
            <dl className="tabular grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Stat k="24h volume" v={`${qusd(m.volume24h, 0)}`} />
              <Stat k="Total volume" v={`${qusd(m.volume, 0)}`} />
              <Stat k="Liquidity" v={`${qusd(m.liquidity, 0)}`} />
              <Stat k="Trades" v={String(m.tradeCount)} />
              <Stat
                k="Traders"
                v={
                  <span className="flex gap-3">
                    <span className="flex items-center gap-1"><UserRound size={13} aria-label="humans" />{m.humanTraders}</span>
                    <span className="flex items-center gap-1"><Bot size={13} aria-label="agents" />{m.agentTraders}</span>
                  </span>
                }
              />
              <Stat k="Fee" v={`${m.feeBps / 100}%`} />
            </dl>
          </div>
          <SplitBar ppm={m.probabilityYesPpm} className="mt-6" />
          <p className="mt-1 flex justify-between text-xs text-fade">
            <span>Yes {pct(m.probabilityYesPpm)}</span>
            <span>No {pct(m.probabilityNoPpm)}</span>
          </p>
          <div className="mt-6">
            <InkChart points={history.points} label={`Yes probability over time, now ${pct(m.probabilityYesPpm)}`} />
            <p className="mt-1 text-xs text-fade">
              Yes probability since the market opened. Liquidity and volume in qUSD. Last trade {ago(m.lastTradeAt)}.
            </p>
          </div>
        </section>

        {/* ticket */}
        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="space-y-8 lg:sticky lg:top-6">
            <TradeTicket market={m} />
            {related.length > 0 && (
              <section>
                <h2 className="mb-2 font-semibold">Related claims</h2>
                <ul className="divide-y divide-rule border-y border-rule text-sm">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link href={`/markets/${r.slug}`} className="flex justify-between gap-3 py-2.5 hover:text-ledger">
                        <span>{r.question}</span>
                        <span className="tabular shrink-0 font-medium">{pct(r.probabilityYesPpm)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>

        {/* body */}
        <div className="space-y-14 lg:col-start-1">
          <section id="article" aria-labelledby="art-h" className="border-t border-ink pt-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="art-h" className="text-xl font-semibold">Encyclopedia</h2>
              <span className="text-sm text-fade">{ency.revisions.length} revision{ency.revisions.length === 1 ? "" : "s"}</span>
            </div>
            <EncyclopediaArticle data={ency} evidence={ev.evidence} currentPpm={m.probabilityYesPpm} />
          </section>

          <section aria-labelledby="res-h" className="border-t border-ink pt-6">
            <h2 id="res-h" className="mb-3 text-xl font-semibold">The claim</h2>
            <p className="max-w-prose">{claim.description}</p>
            <h3 className="mt-5 font-semibold">How it could resolve</h3>
            <p className="mt-1 max-w-prose text-fade">{claim.resolutionCriteria}</p>
            <p className="mt-3 max-w-prose text-sm text-fade">
              Until then the market stays open and the price keeps moving. If the claim turns out to be ill-posed, it is resolved invalid and each share redeems for 0.50 qUSD.
            </p>
          </section>

          <section aria-labelledby="ev-h" className="border-t border-ink pt-6">
            <h2 id="ev-h" className="mb-2 text-xl font-semibold">Evidence</h2>
            <EvidenceList evidence={ev.evidence} />
          </section>

          <section aria-labelledby="ag-h" className="border-t border-ink pt-6">
            <h2 id="ag-h" className="mb-2 text-xl font-semibold">Agent activity</h2>
            {agentAct.activity.length ? (
              <ul className="divide-y divide-rule text-sm">
                {agentAct.activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-x-3 py-2.5">
                    <Link href="/agents" className="flex items-center gap-1.5 font-medium">
                      <Bot size={13} aria-hidden /> {a.agentName}
                    </Link>
                    <span className="flex-1">{a.summary}</span>
                    <span className="text-xs text-fade">{ago(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-fade">No agent has worked on this claim yet. Research, analysis and agent trades will be logged here as they happen.</p>
            )}
          </section>

          <section aria-labelledby="tape-h" className="border-t border-ink pt-6">
            <h2 id="tape-h" className="mb-2 text-xl font-semibold">Trades</h2>
            <TradeTape trades={tape.trades} empty="No trades yet. Be the first to price this claim." />
          </section>

          {ency.revisions.length > 0 && (
            <section aria-labelledby="rev-h" className="border-t border-ink pt-6">
              <h2 id="rev-h" className="mb-2 text-xl font-semibold">Revision history</h2>
              <ol className="divide-y divide-rule text-sm">
                {ency.revisions.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-x-4 py-2">
                    <span className="tabular">Revision {r.revisionNumber}</span>
                    <span className="text-fade">{dateTime(r.createdAt)}</span>
                    <span className="tabular">written at {pct(r.priceYesPpm)}</span>
                    <span className="text-fade">{r.triggerReason}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-fade">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
