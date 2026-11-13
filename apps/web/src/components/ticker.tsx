import Link from "next/link";
import type { Market } from "@/lib/types";
import { pct } from "@/lib/format";

/** Live claims running across the page. Doubled so the loop is seamless; pauses on hover. */
export function ClaimTicker({ markets }: { markets: Market[] }) {
  if (markets.length < 2) return null;
  const row = (hidden: boolean) =>
    markets.map((m) => (
      <li key={`${hidden ? "b" : "a"}-${m.id}`} aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-12">
        <Link href={`/markets/${m.slug}`} tabIndex={hidden ? -1 : undefined} className="max-w-[44ch] truncate text-sub text-label-2 transition-colors hover:text-label">
          {m.question}
        </Link>
        <span className="tabular text-sub font-semibold">{pct(m.probabilityYesPpm, 0)}</span>
        {m.change24hPpm !== 0 && (
          <span className={`tabular text-footnote ${m.change24hPpm > 0 ? "text-yes" : "text-no"}`}>
            {m.change24hPpm > 0 ? "▲" : "▼"} {(Math.abs(m.change24hPpm) / 10_000).toFixed(1)}
          </span>
        )}
      </li>
    ));
  return (
    <section aria-label="Live claims" className="edge-fade -mx-5 overflow-hidden border-y hairline py-4 md:mx-[calc(50%-50vw+0.5rem)] motion-reduce:overflow-x-auto">
      <ul className="ticker-track flex w-max motion-reduce:animate-none">
        {row(false)}
        {row(true)}
      </ul>
    </section>
  );
}
