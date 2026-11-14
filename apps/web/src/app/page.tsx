import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { TradeTape } from "@/components/trade-tape";
import { SectionHeader, Steps } from "@/components/section";
import { pct } from "@/lib/format";
import { Wordmark } from "@/components/chrome";
import { AskBox } from "@/components/ask-box";
import { ClaimTicker } from "@/components/ticker";
import { ClaimGrid, ContestedHero, pickContested } from "@/components/claim-card";

export default async function Home() {
  const [{ markets }, { activity }] = await Promise.all([
    api.markets({ sort: "activity" }).catch(() => ({ markets: [] })),
    api.activity(8).catch(() => ({ activity: [] })),
  ]);
  const contested = pickContested(markets);
  const trending = [...markets].filter((m) => m.id !== contested?.id).sort((a, b) => b.tradeCount - a.tradeCount || Number(BigInt(b.volume) - BigInt(a.volume)));
  const pages = await Promise.all(markets.slice(0, 12).map(async (m) => ({ m, e: await api.encyclopedia(m.slug).catch(() => null) })));
  const written = pages.filter((p) => p.e?.current);

  return (
    <>
      <section className="flex flex-col items-center pt-14 pb-12 text-center md:pt-24 md:pb-16">
        <h1>
          <Wordmark className="graded block px-4 text-[5.5rem] md:text-[9rem]" />
        </h1>
        <p className="display mt-1 max-w-[22ch] text-[1.9rem] leading-tight text-label md:text-[2.6rem]">Ask anything. Let the market answer.</p>
        <p className="mt-4 max-w-[54ch] text-body text-label-2">
          Every question becomes a market on NEAR that never closes. People trade Yes or No, AI on NEAR AI Cloud writes the encyclopedia page from the price and the evidence, and an AI jury settles it when the answer is in.
        </p>
        <div className="mt-8 flex w-full justify-center">
          <AskBox />
        </div>
      </section>

      <ClaimTicker markets={markets} />

      {contested && (
        <div className="mx-auto mt-12 max-w-[880px]">
          <ContestedHero m={contested} />
        </div>
      )}

      {trending.length > 0 && (
        <section aria-labelledby="trending-h" className="mt-16">
          <SectionHeader id="trending-h" title="Trending claims" action={{ href: "/markets", label: "All markets" }} />
          <ClaimGrid markets={trending.slice(0, 6)} />
        </section>
      )}

      <section aria-labelledby="ency-h" className="mt-16">
        <SectionHeader id="ency-h" title="Encyclopedia" />
        <p className="-mt-2 mb-6 max-w-[62ch] text-sub text-label-2">Pages nobody edits by hand. Each is written by AI inside a hardware enclave from the market price and checked sources, and rewritten when they change.</p>
        {written.length ? (
          <div className="grid gap-5 md:grid-cols-2">
            {written.slice(0, 4).map(({ m, e }) => {
              const cur = e!.current!;
              const verified = cur.inference?.signatureVerified === true;
              return (
                <Link key={m.id} href={`/markets/${m.slug}#article`} className="card group block p-6 transition-transform duration-300 ease-glide hover:-translate-y-0.5">
                  <div className="flex items-center justify-between gap-3 text-footnote text-label-2">
                    <span className="font-semibold">{m.subject}</span>
                    {verified && (
                      <span className="inline-flex items-center gap-1 font-medium text-yes">
                        <ShieldCheck size={14} aria-hidden /> Signed in enclave
                      </span>
                    )}
                  </div>
                  <p className="display mt-3 text-[1.3rem] leading-snug group-hover:text-tint">{m.question}</p>
                  <p className="mt-3 line-clamp-3 font-serif text-sub leading-relaxed text-label-2">{String((cur.content as { overview?: { body?: string } }).overview?.body ?? "")}</p>
                  <p className="mt-4 text-caption text-label-3">
                    Revision {cur.revisionNumber}, written at {pct(cur.priceYesPpm)} Yes
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="max-w-[62ch] text-sub text-label-2">No pages written yet. Scribe writes one on NEAR AI Cloud as soon as a new claim opens.</p>
        )}
      </section>

      <section aria-labelledby="how-h" className="mt-16">
        <SectionHeader id="how-h" title="How a claim moves" action={{ href: "/how-it-works", label: "Learn more" }} />
        <Steps />
      </section>

      <section aria-labelledby="trades-h" className="mt-16">
        <SectionHeader id="trades-h" title="Latest trades" />
        <div className="card px-5 sm:px-6">
          <TradeTape trades={activity} showMarket empty="No trades yet. The first one sets the tape running." />
        </div>
      </section>
    </>
  );
}
