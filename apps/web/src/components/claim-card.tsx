import Link from "next/link";
import type { Market } from "@/lib/types";
import { category, fmtNearCompact } from "@/lib/format";

/** Where the market stands, in plain words. */
export function standing(ppm: number) {
  const p = ppm / 10_000;
  if (p >= 80) return { label: "Likely Yes", tone: "yes" as const };
  if (p >= 60) return { label: "Leaning Yes", tone: "yes" as const };
  if (p > 40) return { label: "Contested", tone: "amber" as const };
  if (p > 20) return { label: "Leaning No", tone: "no" as const };
  return { label: "Likely No", tone: "no" as const };
}

const TONE = {
  yes: "bg-yes/12 text-yes",
  no: "bg-no/12 text-no",
  amber: "bg-amber/15 text-amber",
};

export function StatusBadge({ ppm, status }: { ppm: number; status?: string }) {
  if (status && status !== "ACTIVE") {
    const label = status === "RESOLUTION_PROPOSED" ? "Ruling in challenge window" : status === "RESOLVED" ? "Settled" : status.toLowerCase().replace(/_/g, " ");
    return <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-tint/12 px-3 text-footnote font-semibold whitespace-nowrap text-tint">{label}</span>;
  }
  const s = standing(ppm);
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold whitespace-nowrap ${TONE[s.tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </span>
  );
}

/** A small step chart of recent Yes prices. Purely decorative: the numbers are next to it. */
export function Sparkline({ points, className = "", height = 56 }: { points: number[]; className?: string; height?: number }) {
  const pts = points.length > 1 ? points : [points[0] ?? 500_000, points[0] ?? 500_000];
  const W = 240;
  const H = height;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = Math.max((hi - lo) * 0.25, 15_000);
  const y = (p: number) => 4 + (1 - (p - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 8);
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const d = pts.map((p, i) => (i ? `H${x(i).toFixed(1)}V${y(p).toFixed(1)}` : `M0,${y(p).toFixed(1)}`)).join("");
  const up = pts[pts.length - 1]! >= pts[0]!;
  const color = up ? "var(--yes)" : "var(--no)";
  const id = `sp-${Math.round(pts.reduce((a, b) => a + b, 0) % 100000)}-${pts.length}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}V${H}H0Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const price = (ppm: number) => (ppm / 1_000_000).toFixed(2);

function PriceButtons({ m, size = "md" }: { m: Market; size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-14 text-body" : "h-11 text-sub";
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href={`/markets/${m.slug}?buy=YES`} className={`${h} flex items-center justify-center gap-2 rounded-2xl bg-yes font-semibold text-white transition-[transform,filter] duration-200 hover:brightness-105 active:scale-[0.98]`}>
        Yes <span className="tabular opacity-85">{price(m.probabilityYesPpm)}</span>
      </Link>
      <Link href={`/markets/${m.slug}?buy=NO`} className={`${h} flex items-center justify-center gap-2 rounded-2xl bg-no font-semibold text-white transition-[transform,filter] duration-200 hover:brightness-105 active:scale-[0.98]`}>
        No <span className="tabular opacity-85">{price(m.probabilityNoPpm)}</span>
      </Link>
    </div>
  );
}

/** The claim closest to a coin flip that people are actually trading. */
export function pickContested(markets: Market[]) {
  const active = markets.filter((m) => m.status === "ACTIVE");
  const traded = active.filter((m) => m.tradeCount > 0);
  const open = traded.length ? traded : active;
  return [...open].sort((a, b) => Math.abs(a.probabilityYesPpm - 500_000) - Math.abs(b.probabilityYesPpm - 500_000) || b.tradeCount - a.tradeCount)[0];
}

export function ContestedHero({ m }: { m: Market }) {
  return (
    <section aria-labelledby="contested-h" className="card overflow-hidden p-6 sm:p-9">
      <div className="flex items-center justify-between gap-4">
        <p className="text-footnote font-semibold text-label-2">Most contested right now</p>
        <Link href={`/markets?category=${m.category}`} className="text-footnote text-label-2 hover:text-label">
          {category(m.category)} →
        </Link>
      </div>
      <Link href={`/markets/${m.slug}`} id="contested-h" className="display mt-4 block max-w-[24ch] text-[2rem] leading-[1.12] hover:text-tint sm:text-[2.6rem]">
        {m.question}
      </Link>
      <div className="mt-7 grid items-end gap-6 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="tabular text-[4.25rem] leading-none font-semibold tracking-[-0.04em]">{Math.round(m.probabilityYesPpm / 10_000)}%</p>
          <div className="mt-3">
            <StatusBadge ppm={m.probabilityYesPpm} />
          </div>
        </div>
        <Sparkline points={m.spark ?? [m.probabilityYesPpm]} className="h-24 w-full" height={96} />
      </div>
      <div className="mt-7">
        <PriceButtons m={m} size="lg" />
      </div>
      <p className="mt-5 max-w-[62ch] text-footnote text-label-2">
        A Yes share pays 1 NEAR if the claim is settled true. The price is the crowd's probability, and it's the number the AI writer puts on the page. {fmtNearCompact(m.volume)} NEAR traded, {m.tradeCount} trades.
      </p>
    </section>
  );
}

export function ClaimCard({ m }: { m: Market }) {
  const pctNow = Math.round(m.probabilityYesPpm / 10_000);
  return (
    <article className="card group flex flex-col p-5 transition-transform duration-300 ease-glide hover:-translate-y-0.5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-footnote font-semibold text-label-2">{category(m.category)}</p>
        <StatusBadge ppm={m.probabilityYesPpm} status={m.status} />
      </div>
      <Link href={`/markets/${m.slug}`} className="display mt-3 line-clamp-3 text-[1.35rem] leading-snug group-hover:text-tint">
        {m.question}
      </Link>
      <div className="mt-auto pt-5">
        <div className="flex items-end justify-between gap-4">
          <p className="tabular text-[2.25rem] leading-none font-semibold tracking-[-0.03em]">
            {pctNow}%<span className="ml-1.5 text-footnote font-medium tracking-normal text-label-2">Yes</span>
          </p>
          <Sparkline points={m.spark ?? [m.probabilityYesPpm]} className="h-12 w-28" height={48} />
        </div>
        <div className="mt-4">
          <PriceButtons m={m} />
        </div>
        <p className="tabular mt-3 text-caption text-label-3">
          {fmtNearCompact(m.volume)} NEAR traded, {m.humanTraders + m.agentTraders} {m.humanTraders + m.agentTraders === 1 ? "trader" : "traders"}
          {m.change24hPpm !== 0 && (
            <span className={m.change24hPpm > 0 ? "text-yes" : "text-no"}>
              {" "}
              , {m.change24hPpm > 0 ? "+" : "−"}
              {(Math.abs(m.change24hPpm) / 10_000).toFixed(1)} today
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

export function ClaimGrid({ markets }: { markets: Market[] }) {
  if (!markets.length) return <p className="text-sub text-label-2">No claims match. Try another topic, or ask your own question.</p>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {markets.map((m) => (
        <ClaimCard key={m.id} m={m} />
      ))}
    </div>
  );
}
