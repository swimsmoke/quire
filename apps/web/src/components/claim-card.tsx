import Link from "next/link";
import type { Market } from "@/lib/types";
import { category, fmtNearCompact } from "@/lib/format";
import { OddsRing } from "./odds-ring";

/** Where the market stands, in Quire's words. */
export function standing(ppm: number) {
  const p = ppm / 10_000;
  if (p >= 85) return { label: "Near certain", tone: "yes" as const };
  if (p >= 62) return { label: "Probably yes", tone: "yes" as const };
  if (p > 38) return { label: "Too close to call", tone: "amber" as const };
  if (p > 15) return { label: "Probably not", tone: "no" as const };
  return { label: "Near impossible", tone: "no" as const };
}

const TONE = { yes: "text-yes", no: "text-no", amber: "text-amber" };

const STATUS_TEXT: Record<string, string> = {
  RESOLUTION_PROPOSED: "Verdict pending",
  RESOLVED_YES: "Settled: Yes",
  RESOLVED_NO: "Settled: No",
  INVALID: "Settled: invalid",
  PAUSED: "Paused",
};

/** Plain-words standing, or the settlement state once the jury is involved. */
export function StatusBadge({ ppm, status }: { ppm: number; status?: string }) {
  if (status && status !== "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 text-footnote font-semibold whitespace-nowrap text-tint">
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        {STATUS_TEXT[status] ?? status.toLowerCase().replace(/_/g, " ")}
      </span>
    );
  }
  const s = standing(ppm);
  return (
    <span className={`inline-flex items-center gap-1.5 text-footnote font-semibold whitespace-nowrap ${TONE[s.tone]}`}>
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
  const h = size === "lg" ? "h-13 text-body" : "h-10 text-sub";
  const base = `${h} relative z-10 flex items-center justify-between rounded-xl px-4 font-semibold transition-[transform,background-color,color] duration-300 ease-glide active:scale-[0.97]`;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Link href={`/markets/${m.slug}?buy=YES`} className={`${base} bg-yes/12 text-yes hover:bg-yes hover:text-white`}>
        Yes <span className="tabular">{price(m.probabilityYesPpm)}</span>
      </Link>
      <Link href={`/markets/${m.slug}?buy=NO`} className={`${base} bg-no/12 text-no hover:bg-no hover:text-white`}>
        No <span className="tabular">{price(m.probabilityNoPpm)}</span>
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

const traders = (m: Market) => m.humanTraders + m.agentTraders;

/** The hero's right-hand page: the live question the market is least sure about. */
export function ClosestCall({ m }: { m: Market }) {
  return (
    <section aria-labelledby="closest-h" className="card rise relative overflow-hidden p-6 sm:p-8" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between gap-4 text-footnote">
        <p className="font-semibold text-label-2">The closest call on Quire</p>
        <Link href={`/markets?category=${m.category}`} className="text-label-3 transition-colors hover:text-label">
          {category(m.category)}
        </Link>
      </div>
      <div className="mt-6 flex justify-center">
        <OddsRing ppm={m.probabilityYesPpm} size={176} stroke={8} label delay={250} />
      </div>
      <p className="mt-2 text-center text-footnote text-label-3">chance the answer is Yes</p>
      <Link href={`/markets/${m.slug}`} id="closest-h" className="display mt-6 block text-center text-[1.6rem] leading-[1.18] text-balance transition-colors hover:text-tint sm:text-[1.85rem]">
        {m.question}
      </Link>
      <div className="mt-3 flex justify-center">
        <StatusBadge ppm={m.probabilityYesPpm} status={m.status} />
      </div>
      <div className="mt-6">
        <PriceButtons m={m} size="lg" />
      </div>
      <p className="mt-4 text-center text-caption text-label-3">
        {fmtNearCompact(m.volume)} NEAR traded by {traders(m)} {traders(m) === 1 ? "trader" : "traders"}. Each share pays 1 NEAR if it settles its way.
      </p>
    </section>
  );
}

export function ClaimCard({ m }: { m: Market }) {
  return (
    <article className="card card-link group relative flex flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 text-footnote">
        <p className="font-semibold text-label-3">{category(m.category)}</p>
        <StatusBadge ppm={m.probabilityYesPpm} status={m.status} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-4">
        <Link href={`/markets/${m.slug}`} className="display line-clamp-3 text-[1.32rem] leading-snug transition-colors after:absolute after:inset-0 after:rounded-[1.25rem] group-hover:text-tint">
          {m.question}
        </Link>
        <div className="pointer-events-none relative grid place-items-center">
          <OddsRing ppm={m.probabilityYesPpm} size={62} stroke={10} animate={false} />
          <span className="tabular absolute text-[0.8rem] font-semibold">{Math.round(m.probabilityYesPpm / 10_000)}%</span>
        </div>
      </div>
      <div className="mt-auto pt-5">
        <Sparkline points={m.spark ?? [m.probabilityYesPpm]} className="h-10 w-full opacity-80" height={40} />
        <div className="mt-4">
          <PriceButtons m={m} />
        </div>
        <p className="tabular mt-3 text-caption text-label-3">
          {fmtNearCompact(m.volume)} NEAR traded, {traders(m)} {traders(m) === 1 ? "trader" : "traders"}
          {m.change24hPpm !== 0 && (
            <span className={m.change24hPpm > 0 ? "text-yes" : "text-no"}>
              , {m.change24hPpm > 0 ? "up" : "down"} {(Math.abs(m.change24hPpm) / 10_000).toFixed(1)} today
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
    <div className="reveal-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {markets.map((m) => (
        <ClaimCard key={m.id} m={m} />
      ))}
    </div>
  );
}
