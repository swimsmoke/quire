import { PageIn } from "@/components/page-in";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { TradeTape } from "@/components/trade-tape";
import { SectionHeader, Steps } from "@/components/section";
import { pct } from "@/lib/format";
import { AskBox } from "@/components/ask-box";
import { ClaimTicker } from "@/components/ticker";
import { ClaimGrid, ClosestCall, pickContested } from "@/components/claim-card";
import { ResultsGrid } from "@/components/jury";

export default async function Home() {
  const [{ markets }, { activity }, verdicts] = await Promise.all([
    api.markets({ sort: "activity" }).catch(() => ({ markets: [] })),
    api.activity(8).catch(() => ({ activity: [] })),
    api.results().catch(() => ({ results: [] })),
  ]);
  const closest = pickContested(markets);
  const busiest = [...markets].filter((m) => m.id !== closest?.id).sort((a, b) => b.tradeCount - a.tradeCount || Number(BigInt(b.volume) - BigInt(a.volume)));
  const pages = await Promise.all(markets.slice(0, 8).map(async (m) => ({ m, e: await api.encyclopedia(m.slug).catch(() => null) })));
  const written = pages.filter((p) => p.e?.current);
  const ruled = verdicts.results.filter((r) => r.outcome !== "NO_RULING").slice(0, 3);
  const excerpt = (t: string, n: number) => {
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const end = cut.lastIndexOf(". ");
    return end > n * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  };
  const overview = (c: unknown) => String((c as { overview?: { body?: string } }).overview?.body ?? "");

  return (
    <PageIn>
    <>
      <section className="grid items-center gap-12 pt-12 pb-14 md:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:pb-20">
        <div>
          <h1 className="display rise text-[2.9rem] leading-[1.0] tracking-[-0.025em] sm:text-[4.2rem] lg:text-[4.6rem]">
            Ask anything.
            <br />
            Let the market answer.
          </h1>
          <p className="rise mt-6 max-w-[46ch] text-[1.08rem] leading-relaxed text-label-2" style={{ animationDelay: "90ms" }}>
            Every question on Quire is a market on NEAR that never closes. Traders put a price on the answer, AI inside a hardware enclave writes the page behind it, and a jury of models settles it once the world knows.
          </p>
          <div className="rise mt-8" style={{ animationDelay: "180ms" }}>
            <AskBox />
          </div>
        </div>
        {closest && <ClosestCall m={closest} />}
      </section>

      <ClaimTicker markets={markets} />

      {busiest.length > 0 && (
        <section aria-labelledby="busy-h" className="mt-20">
          <SectionHeader id="busy-h" title="Busiest claims" action={{ href: "/markets", label: "Every claim" }} />
          <ClaimGrid markets={busiest.slice(0, 6)} />
        </section>
      )}

      <section aria-labelledby="ency-h" className="mt-24">
        <SectionHeader id="ency-h" title="From the encyclopedia" />
        {written.length ? (
          <div className={`grid gap-x-12 gap-y-8 ${written.length > 1 ? "lg:grid-cols-[1.25fr_1fr]" : "max-w-[46rem]"}`}>
            {(() => {
              const { m, e } = written[0]!;
              const cur = e!.current!;
              return (
                <Link href={`/markets/${m.slug}#article`} className="reveal group block">
                  <p className="flex items-center gap-2 text-footnote font-semibold text-label-3">
                    {m.subject}
                    {cur.inference?.signatureVerified && (
                      <span className="inline-flex items-center gap-1 text-yes">
                        <ShieldCheck size={14} aria-hidden /> signed in an enclave
                      </span>
                    )}
                  </p>
                  <h3 className="display mt-3 text-[2rem] leading-[1.12] transition-colors group-hover:text-tint sm:text-[2.4rem]">{m.question}</h3>
                  <p className="drop-cap mt-5 font-serif text-[1.06rem] leading-[1.75] text-label-2">{excerpt(overview(cur.content), 460)}</p>
                  <p className="mt-4 text-footnote text-label-3">
                    Revision {cur.revisionNumber}, written when Yes stood at {pct(cur.priceYesPpm)}. Read the page
                  </p>
                </Link>
              );
            })()}
            {written.length > 1 && <ul className="reveal-stagger divide-y hairline border-y hairline">
              {written.slice(1, 5).map(({ m, e }) => (
                <li key={m.id}>
                  <Link href={`/markets/${m.slug}#article`} className="group block py-5">
                    <p className="text-caption font-semibold text-label-3">{m.subject}</p>
                    <p className="display mt-1 text-[1.25rem] leading-snug transition-colors group-hover:text-tint">{m.question}</p>
                    <p className="mt-2 line-clamp-2 font-serif text-sub leading-relaxed text-label-2">{overview(e!.current!.content)}</p>
                  </Link>
                </li>
              ))}
            </ul>}
          </div>
        ) : (
          <p className="max-w-[62ch] text-sub text-label-2">No pages written yet. Scribe writes one on NEAR AI Cloud as soon as a new claim opens.</p>
        )}
      </section>

      {ruled.length > 0 && (
        <section aria-labelledby="verdicts-h" className="mt-24">
          <SectionHeader id="verdicts-h" title="Latest verdicts" action={{ href: "/verdicts", label: "All verdicts" }} />
          <ResultsGrid results={ruled} />
        </section>
      )}

      <section aria-labelledby="how-h" className="mt-24">
        <SectionHeader id="how-h" title="How a claim moves" action={{ href: "/how-it-works", label: "The full story" }} />
        <Steps />
      </section>

      <section aria-labelledby="trades-h" className="mt-24">
        <SectionHeader id="trades-h" title="On the tape" />
        <div className="reveal card px-5 sm:px-6">
          <TradeTape trades={activity} showMarket empty="No trades yet. The first one sets the tape running." />
        </div>
      </section>
    </>
    </PageIn>
  );
}
