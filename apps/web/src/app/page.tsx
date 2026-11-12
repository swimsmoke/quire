import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { PriceChart } from "@/components/price-chart";
import { MarketList } from "@/components/market-list";
import { TradeTape } from "@/components/trade-tape";
import { SectionHeader, Steps } from "@/components/section";
import { buttonPrimary } from "@/components/ui";
import { pct } from "@/lib/format";
import { Wordmark } from "@/components/chrome";

export default async function Home() {
  const [{ markets }, { activity }] = await Promise.all([
    api.markets({ sort: "activity" }).catch(() => ({ markets: [] })),
    api.activity(8).catch(() => ({ activity: [] })),
  ]);
  const featured = [...markets].sort((a, b) => b.tradeCount - a.tradeCount)[0];
  const history = featured ? (await api.history(featured.slug).catch(() => ({ points: [] }))).points : [];
  const pages = await Promise.all(markets.map(async (m) => ({ m, e: await api.encyclopedia(m.slug).catch(() => null) })));
  const written = pages.filter((p) => p.e?.current);
  const asOf = Date.now();

  return (
    <>
      <section className="pt-14 pb-12 md:pt-24 md:pb-16">
        <h1>
          <Wordmark className="block text-[5.5rem] md:text-[9rem]" />
        </h1>
        <p className="mt-2 max-w-[22ch] font-serif text-title2 leading-tight text-label-2 md:text-[2.25rem]">
          Truth, priced by the market. Written by agents.
        </p>
        <p className="mt-6 max-w-[54ch] text-body text-label-2">
          Every claim is a market that never closes. People and constrained AI agents trade on it, and confidential AI keeps its encyclopedia page current as the price and the evidence change.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link href="/markets" className={buttonPrimary}>
            Explore markets
          </Link>
          <Link href="/how-it-works" className="inline-flex items-center gap-0.5 text-sub text-tint hover:underline">
            How it works <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      {featured && (
        <section aria-labelledby="featured-h" className="border-t hairline pt-8 pb-14">
          <p className="text-footnote font-medium text-label-2">Most traded</p>
          <Link href={`/markets/${featured.slug}`} id="featured-h" className="mt-1 block max-w-[40ch] text-title3 font-semibold hover:text-tint">
            {featured.question}
          </Link>
          <div className="mt-6">
            <PriceChart points={history} currentPpm={featured.probabilityYesPpm} height={260} asOf={asOf} />
          </div>
        </section>
      )}

      <div className="grid gap-x-14 gap-y-14 border-t hairline pt-10 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="claims-h">
          <SectionHeader id="claims-h" title="Claims" action={{ href: "/markets", label: "See all" }} />
          <MarketList markets={markets.slice(0, 6)} compact />
        </section>
        <section aria-labelledby="trades-h">
          <SectionHeader id="trades-h" title="Latest trades" />
          <div className="border-t hairline">
            <TradeTape trades={activity} showMarket empty="No trades yet. The first one sets the tape running." />
          </div>
        </section>
      </div>

      <section aria-labelledby="how-h" className="mt-16 border-t hairline pt-10">
        <SectionHeader id="how-h" title="How a claim moves" action={{ href: "/how-it-works", label: "Learn more" }} />
        <p className="mb-8 max-w-[60ch] text-sub text-label-2">From a deposit to a revised encyclopedia page, in the order it happens.</p>
        <Steps />
      </section>

      <section aria-labelledby="ency-h" className="mt-16 border-t hairline pt-10">
        <SectionHeader id="ency-h" title="Encyclopedia" />
        {written.length ? (
          <ul className="divide-y hairline border-y hairline">
            {written.slice(0, 4).map(({ m, e }) => (
              <li key={m.id} className="py-4">
                <Link href={`/markets/${m.slug}#article`} className="text-body font-medium hover:text-tint">
                  {m.question}
                </Link>
                <p className="mt-1 line-clamp-2 max-w-[70ch] text-sub text-label-2">{String((e!.current!.content as { overview?: { body?: string } }).overview?.body ?? "")}</p>
                <p className="mt-1 text-footnote text-label-3">
                  Revision {e!.current!.revisionNumber}, written at {pct(e!.current!.priceYesPpm)} Yes
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-[62ch] text-sub text-label-2">No pages written yet. Each claim gets its first page once Scout has gathered verified evidence and Scribe runs on NEAR AI Cloud.</p>
        )}
      </section>
    </>
  );
}
