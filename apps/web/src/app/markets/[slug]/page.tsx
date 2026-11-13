import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PriceChart } from "@/components/price-chart";
import { TradeTicket } from "@/components/trade-ticket";
import { TradeTape } from "@/components/trade-tape";
import { EncyclopediaArticle, EvidenceList } from "@/components/encyclopedia";
import { ModeTag } from "@/components/mode";
import { AddEvidence, GenerateArticle, WritingNotice } from "@/components/knowledge-actions";
import { ChangePill } from "@/components/market-list";
import { SectionHeader } from "@/components/section";
import { ago, dateTime, pct, fmtNear } from "@/lib/format";
import { category } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await api.market(slug).catch(() => null);
  return { title: d?.claim.title ?? "Claim" };
}

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ new?: string }> }) {
  const { slug } = await params;
  const { new: isNew } = await searchParams;
  let detail;
  try {
    detail = await api.market(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { market: m, claim, related } = detail;
  const [history, tape, ency, ev, agentAct, health] = await Promise.all([api.history(slug), api.trades(slug, 25), api.encyclopedia(slug), api.evidence(slug), api.marketAgentActivity(slug), api.health().catch(() => null)]);
  // the background writer only runs when NEAR AI Cloud is configured on the API
  const aiWriting = health?.integrations.nearAiCloud === "configured";
  const asOf = Date.now();

  return (
    <>
      <nav className="pt-6">
        <Link href="/markets" className="inline-flex items-center gap-0.5 text-sub text-tint hover:underline">
          <ChevronLeft size={17} aria-hidden /> Markets
        </Link>
      </nav>

      <header className="pt-4 pb-8">
        <p className="flex flex-wrap items-center gap-2 text-footnote text-label-2">
          <span>{category(m.category)}</span>
          <ModeTag mode={m.executionMode} />
          {m.status !== "ACTIVE" && <span className="font-medium text-no">{m.status.toLowerCase().replace(/_/g, " ")}</span>}
        </p>
        <h1 className="mt-2 max-w-[24ch] text-[2rem] leading-[1.12] font-semibold tracking-[-0.02em] md:text-large">{claim.title}</h1>
        <p className="mt-3 text-sub text-label-2">
          About {claim.subject}. Open since {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}, with no closing date.
        </p>
      </header>

      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Market" className="lg:col-start-1">
          <PriceChart points={history.points} currentPpm={m.probabilityYesPpm} asOf={asOf} />
          <dl className="tabular mt-8 grid grid-cols-2 gap-x-6 border-t hairline sm:grid-cols-3">
            <Stat k="No" v={pct(m.probabilityNoPpm)} />
            <Stat k="24h change" v={<ChangePill ppm={m.change24hPpm} />} />
            <Stat k="24h volume" v={`${fmtNear(m.volume24h, 0)} NEAR`} />
            <Stat k="Total volume" v={`${fmtNear(m.volume, 0)} NEAR`} />
            <Stat k="Liquidity" v={`${fmtNear(m.liquidity, 0)} NEAR`} />
            <Stat
              k="Traders"
              v={
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><UserRound size={14} aria-label="humans" />{m.humanTraders}</span>
                  <span className="flex items-center gap-1"><Bot size={14} aria-label="agents" />{m.agentTraders}</span>
                </span>
              }
            />
          </dl>
          <p className="mt-3 text-footnote text-label-3">
            {m.tradeCount} {m.tradeCount === 1 ? "trade" : "trades"}, last {ago(m.lastTradeAt)}. {m.feeBps / 100}% fee per trade. Drag across the chart to read any moment.
          </p>
        </section>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:hairline lg:pl-10">
          <div className="lg:sticky lg:top-20">
            <TradeTicket market={m} />
          </div>
        </aside>

        <div className="space-y-16 lg:col-start-1">
          <section id="article" aria-labelledby="art-h" className="scroll-mt-20 border-t hairline pt-8">
            <div className="flex items-baseline justify-between gap-4">
              <SectionHeader id="art-h" title="Encyclopedia" />
              <span className="text-footnote text-label-2">
                {ency.revisions.length} {ency.revisions.length === 1 ? "revision" : "revisions"}
              </span>
            </div>
            <WritingNotice fresh={aiWriting && !ency.current && (isNew === "1" || Date.now() - new Date(m.createdAt).getTime() < 10 * 60_000)} />
            <EncyclopediaArticle data={ency} evidence={ev.evidence} currentPpm={m.probabilityYesPpm} />
            <GenerateArticle slug={m.slug} hasArticle={!!ency.current} />
          </section>

          <section aria-labelledby="claim-h" className="border-t hairline pt-8">
            <SectionHeader id="claim-h" title="The claim" />
            <p className="max-w-[64ch] text-body">{claim.description}</p>
            <h3 className="mt-6 text-body font-semibold">How it could resolve</h3>
            <p className="mt-1 max-w-[64ch] text-body text-label-2">{claim.resolutionCriteria}</p>
            <p className="mt-4 max-w-[64ch] text-sub text-label-2">
              Until then the market stays open. If the claim turns out to be ill-posed, it resolves invalid and every share redeems for 0.50 NEAR.
            </p>
          </section>

          <section aria-labelledby="ev-h" className="border-t hairline pt-8">
            <SectionHeader id="ev-h" title="Evidence" />
            <EvidenceList evidence={ev.evidence} />
            <AddEvidence slug={m.slug} />
          </section>

          <section aria-labelledby="ag-h" className="border-t hairline pt-8">
            <SectionHeader id="ag-h" title="Agent activity" action={{ href: "/agents", label: "About the agents" }} />
            {agentAct.activity.length ? (
              <ul className="divide-y hairline">
                {agentAct.activity.map((a) => (
                  <li key={a.id} className="flex gap-3 py-3.5">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-tint/12 text-tint">
                      <Bot size={15} aria-hidden />
                    </span>
                    <div>
                      <p className="text-sub">
                        <span className="font-medium">{a.agentName}</span> {a.summary}
                      </p>
                      <p className="text-footnote text-label-3">{ago(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="max-w-[62ch] text-sub text-label-2">No agent has worked on this claim yet. Research, analysis and agent trades are logged here as they happen.</p>
            )}
          </section>

          <section aria-labelledby="tape-h" className="border-t hairline pt-8">
            <SectionHeader id="tape-h" title="Trades" />
            <TradeTape trades={tape.trades} empty="No trades yet. Be the first to price this claim." />
          </section>

          {ency.revisions.length > 0 && (
            <section aria-labelledby="rev-h" className="border-t hairline pt-8">
              <SectionHeader id="rev-h" title="Revision history" />
              <ol className="divide-y hairline text-sub">
                {ency.revisions.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-x-4 py-3">
                    <span className="font-medium">Revision {r.revisionNumber}</span>
                    <span className="text-label-2">{dateTime(r.createdAt)}</span>
                    <span className="tabular text-label-2">at {pct(r.priceYesPpm)} Yes</span>
                    <span className="text-label-3">{r.triggerReason}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {related.length > 0 && (
            <section aria-labelledby="rel-h" className="border-t hairline pt-8">
              <SectionHeader id="rel-h" title="Related claims" />
              <ul className="divide-y hairline border-y hairline">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/markets/${r.slug}`} className="group flex items-center gap-4 py-3.5">
                      <span className="flex-1 text-body group-hover:text-tint">{r.question}</span>
                      <span className="tabular text-body font-semibold">{pct(r.probabilityYesPpm)}</span>
                      <ChevronRight size={17} className="text-label-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="border-b hairline py-3">
      <dt className="text-footnote text-label-2">{k}</dt>
      <dd className="mt-0.5 text-body font-medium">{v}</dd>
    </div>
  );
}
