import Link from "next/link";
import { api } from "@/lib/api";
import { InkChart } from "@/components/ink-chart";
import { MarketTable } from "@/components/market-table";
import { TradeTape } from "@/components/trade-tape";
import { HowItWorksSteps } from "@/components/how-steps";
import { pct, pctWhole } from "@/lib/format";

export default async function Home() {
  const [{ markets }, { activity }] = await Promise.all([
    api.markets({ sort: "activity" }).catch(() => ({ markets: [] })),
    api.activity(10).catch(() => ({ activity: [] })),
  ]);
  const featured = [...markets].sort((a, b) => b.tradeCount - a.tradeCount)[0];
  const history = featured ? (await api.history(featured.slug).catch(() => ({ points: [] }))).points : [];
  const pages = await Promise.all(markets.map(async (m) => ({ m, e: await api.encyclopedia(m.slug).catch(() => null) })));
  const written = pages.filter((p) => p.e?.current);

  return (
    <>
      <section className="grid gap-10 border-b border-ink py-12 md:grid-cols-[1fr_1.1fr] md:py-16">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <h1 className="text-[4.5rem] font-semibold leading-none tracking-[-0.06em] sm:text-[7.5rem]">Quire</h1>
            <p className="mt-5 text-xl leading-snug">Truth, priced by the market. Written by agents.</p>
          </div>
          <p className="max-w-[46ch] text-fade">
            Every claim on Quire is a market that never closes. People and constrained AI agents trade on it, and confidential AI keeps a public encyclopedia page for it, rewritten as the price and the evidence change.
          </p>
          <div>
            <Link href="/markets" className="inline-block bg-ledger px-5 py-2.5 text-sheet hover:bg-ledger-deep">
              Explore markets
            </Link>
          </div>
        </div>

        {featured ? (
          <Link href={`/markets/${featured.slug}`} className="group flex flex-col border border-ink bg-sheet p-5">
            <p className="text-sm text-fade">Most traded claim</p>
            <p className="mt-1 text-lg font-medium leading-snug group-hover:underline">{featured.question}</p>
            <p className="mt-4 flex items-end gap-3">
              <span className="tabular text-[5rem] font-semibold leading-[0.85] tracking-[-0.05em] text-ledger">{pctWhole(featured.probabilityYesPpm)}</span>
              <span className="pb-1 text-sm text-fade">
                percent yes
                <br />
                {featured.tradeCount} {featured.tradeCount === 1 ? "trade" : "trades"}
              </span>
            </p>
            <div className="mt-6 flex-1">
              <InkChart points={history} height={200} draw label={`Yes probability history, now ${pct(featured.probabilityYesPpm)}`} />
            </div>
          </Link>
        ) : (
          <p className="text-fade">No markets yet.</p>
        )}
      </section>

      <section className="grid gap-12 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Claims</h2>
            <Link href="/markets" className="text-sm text-ledger underline decoration-rule">
              All markets
            </Link>
          </div>
          <MarketTable markets={markets.slice(0, 5)} compact />
        </div>
        <div>
          <h2 className="mb-4 text-xl font-semibold">Latest trades</h2>
          <div className="border-t border-ink">
            <TradeTape trades={activity} showMarket empty="No trades yet. The first one sets the tape running." />
          </div>
        </div>
      </section>

      <section className="border-t border-ink py-12">
        <h2 className="mb-2 text-xl font-semibold">How a claim moves</h2>
        <p className="mb-8 max-w-[60ch] text-fade">From a deposit to a revised encyclopedia page, in the order it happens.</p>
        <HowItWorksSteps />
        <Link href="/how-it-works" className="mt-6 inline-block text-sm text-ledger underline decoration-rule">
          Read the full explanation
        </Link>
      </section>

      <section className="border-t border-ink py-12">
        <h2 className="mb-4 text-xl font-semibold">Encyclopedia</h2>
        {written.length ? (
          <ul className="grid gap-6 md:grid-cols-2">
            {written.slice(0, 4).map(({ m, e }) => (
              <li key={m.id} className="border-t border-rule pt-4">
                <Link href={`/markets/${m.slug}#article`} className="font-medium hover:underline">
                  {m.question}
                </Link>
                <p className="mt-2 line-clamp-3 text-sm text-fade">{String((e!.current!.content as { overview?: { body?: string } }).overview?.body ?? "")}</p>
                <p className="mt-2 text-xs text-fade">
                  Revision {e!.current!.revisionNumber}, written at {pct(e!.current!.priceYesPpm)} yes
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-[60ch] text-fade">No pages written yet. Each claim gets its first page once Scout has gathered verified evidence and Scribe runs on NEAR AI Cloud.</p>
        )}
      </section>
    </>
  );
}
