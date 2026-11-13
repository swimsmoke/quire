"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Share } from "lucide-react";
import type { Profile } from "@/lib/types";
import { useSession } from "@/lib/session";
import { ago, fmtNear, fmtNearCompact, pct, signed, tone } from "@/lib/format";
import { buttonPrimary, buttonSecondary, Sheet } from "./ui";
import { ChainFunds } from "./trade-ticket";


export function CopyShare({ account }: { account: string }) {
  const [done, setDone] = useState<"copy" | "share" | null>(null);
  const flash = (k: "copy" | "share") => {
    setDone(k);
    setTimeout(() => setDone(null), 1400);
  };
  const btn = "grid size-9 place-items-center rounded-full border hairline text-label-2 transition-colors hover:border-label-3 hover:text-label";
  return (
    <span className="flex gap-2">
      <button
        className={btn}
        aria-label="Copy account name"
        onClick={() => navigator.clipboard?.writeText(account).then(() => flash("copy"), () => undefined)}
      >
        {done === "copy" ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <button
        className={btn}
        aria-label="Copy link to this profile"
        onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => flash("share"), () => undefined)}
      >
        {done === "share" ? <Check size={15} /> : <Share size={15} />}
      </button>
    </span>
  );
}

/** Deposit and withdraw, shown only on your own profile. */
export function OwnActions({ account }: { account: string }) {
  const { me, onchain, claimTestFunds, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (me?.session.accountId !== account) return null;
  if (!onchain)
    return (
      <div className="mt-6">
        <button
          className={`${buttonPrimary} w-full sm:w-auto`}
          onClick={async () => {
            try {
              setMsg(`Added ${fmtNear(await claimTestFunds())} test NEAR.`);
              await refresh();
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Get 1,000 test NEAR
        </button>
        {msg && <p className="mt-2 text-footnote text-label-2">{msg}</p>}
      </div>
    );
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className={buttonPrimary} onClick={() => setOpen(true)}>
          Deposit
        </button>
        <button className={buttonSecondary} onClick={() => setOpen(true)}>
          Withdraw
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your Quire balance">
        <p className="text-sub text-label-2">Move NEAR between your wallet and Quire. Keep about 0.5 NEAR in your wallet for network fees.</p>
        <ChainFunds />
        <Link href="/fund" className="mt-6 block text-sub text-tint hover:underline">
          Coming from another chain? See NEAR Intents funding
        </Link>
      </Sheet>
    </>
  );
}

const RANGES = [
  ["1D", 86_400_000],
  ["1W", 7 * 86_400_000],
  ["1M", 30 * 86_400_000],
  ["ALL", Infinity],
] as const;

/** Profit over time, with the change over the chosen range. */
export function PnlChart({ points }: { points: Profile["pnl"] }) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("ALL");
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 150;
  const view = useMemo(() => {
    const span = RANGES.find((r) => r[0] === range)![1];
    const now = points.length ? new Date(points[points.length - 1]!.t).getTime() : Date.now();
    const inRange = points.filter((p) => now - new Date(p.t).getTime() <= span);
    // carry the value from just before the range so the line starts at the right level
    const before = points.filter((p) => now - new Date(p.t).getTime() > span).pop();
    const pts = before ? [{ t: new Date(now - span).toISOString(), pnl: before.pnl }, ...inRange] : inRange;
    return pts.length === 1 ? [pts[0]!, pts[0]!] : pts;
  }, [points, range]);
  const vals = view.map((p) => Number(BigInt(p.pnl)) / 1e6);
  const t0 = view.length ? new Date(view[0]!.t).getTime() : 0;
  const t1 = view.length ? new Date(view[view.length - 1]!.t).getTime() : 1;
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const x = (t: string) => (t1 === t0 ? W : ((new Date(t).getTime() - t0) / (t1 - t0)) * W);
  const y = (v: number) => (hi === lo ? H / 2 : 8 + (1 - (v - lo) / (hi - lo)) * (H - 16));
  const line = view.map((p, i) => `${i ? `H${x(p.t).toFixed(1)}V` : `M${x(p.t).toFixed(1)},`}${y(vals[i]!).toFixed(1)}`).join("");
  const change = view.length ? BigInt(view[view.length - 1]!.pnl) - BigInt(view[0]!.pnl) : 0n;
  const shown = hover !== null ? BigInt(view[hover]!.pnl) : change;
  const color = (hover !== null ? shown : change) < 0n ? "var(--no)" : "var(--yes)";

  return (
    <section aria-label="Profit and loss" className="glass mt-8 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sub text-label-2">
          <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
          Profit/loss
        </p>
        <div role="radiogroup" aria-label="Range" className="flex gap-1">
          {RANGES.map(([k]) => (
            <button
              key={k}
              role="radio"
              aria-checked={range === k}
              onClick={() => setRange(k)}
              className={`h-7 rounded-full px-3 text-footnote font-semibold transition-colors ${range === k ? "bg-tint/15 text-tint" : "text-label-2 hover:text-label"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <p className={`tabular mt-3 text-[2.25rem] leading-none font-semibold tracking-[-0.03em] ${tone(shown)}`}>
        {signed(shown)} <span className="text-title3 font-medium text-label-2">NEAR</span>
      </p>
      <p className="mt-1.5 h-5 text-footnote text-label-3">
        {hover !== null ? new Date(view[hover]!.t).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : range === "ALL" ? "All time" : `Past ${range === "1D" ? "day" : range === "1W" ? "week" : "month"}`}
      </p>
      {view.length ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="mt-4 h-[150px] w-full touch-none"
          role="img"
          aria-label="Profit over time"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const tx = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
            let i = 0;
            while (i < view.length - 1 && new Date(view[i + 1]!.t).getTime() <= tx) i++;
            setHover(i);
          }}
        >
          <defs>
            <linearGradient id="pnl-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--separator)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={`${line}V${H}H0Z`} fill="url(#pnl-fill)" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && <line x1={x(view[hover]!.t)} x2={x(view[hover]!.t)} y1="0" y2={H} stroke="var(--label-3)" vectorEffect="non-scaling-stroke" />}
        </svg>
      ) : (
        <p className="mt-6 text-sub text-label-2">No trades yet, so nothing to chart.</p>
      )}
    </section>
  );
}

export function ProfileTabs({ p }: { p: Profile }) {
  const tabs: [string, number, ReactNode][] = [
    [
      "Positions",
      p.positions.length,
      <Rows
        key="p"
        empty="No open positions."
        items={p.positions.map((x) => ({
          key: x.slug,
          href: `/markets/${x.slug}`,
          title: x.question,
          sub: [BigInt(x.yesShares) > 0n && `${fmtNear(x.yesShares)} Yes`, BigInt(x.noShares) > 0n && `${fmtNear(x.noShares)} No`, `Yes at ${pct(x.probabilityYesPpm, 0)}`].filter(Boolean).join(", "),
          right: (
            <>
              <span className="block font-semibold">{fmtNear(x.value)} NEAR</span>
              <span className={`block text-footnote ${tone(x.pnl)}`}>{signed(x.pnl)}</span>
            </>
          ),
        }))}
      />,
    ],
    [
      "Activity",
      p.stats.trades,
      <Rows
        key="a"
        empty="No trades yet."
        items={p.activity.map((t) => ({
          key: t.id,
          href: `/markets/${t.slug}`,
          title: t.question,
          sub: (
            <>
              {t.side === "BUY" ? "Bought" : "Sold"} <span className={t.outcome === "YES" ? "text-yes" : "text-no"}>{t.outcome === "YES" ? "Yes" : "No"}</span> at {(t.avgPricePpm / 1e6).toFixed(2)}, {ago(t.createdAt)}
            </>
          ),
          right: <span className="font-semibold">{fmtNear(t.collateral)} NEAR</span>,
        }))}
      />,
    ],
    [
      "Created",
      p.created.length,
      <Rows
        key="c"
        empty="Hasn't opened a market yet."
        items={p.created.map((c) => ({
          key: c.slug,
          href: `/markets/${c.slug}`,
          title: c.question,
          sub: `Opened ${ago(c.createdAt)}, ${fmtNearCompact(c.volume)} NEAR traded`,
          right: <span className="font-semibold">{pct(c.probabilityYesPpm, 0)}</span>,
        }))}
      />,
    ],
  ];
  const [i, setI] = useState(0);
  return (
    <section className="mt-10">
      <div role="tablist" className="flex gap-6 border-b hairline">
        {tabs.map(([name, n], k) => (
          <button
            key={name}
            role="tab"
            aria-selected={i === k}
            onClick={() => setI(k)}
            className={`relative -mb-px pb-3 text-body font-semibold transition-colors ${i === k ? "text-label" : "text-label-2 hover:text-label"}`}
          >
            {name} <span className="tabular text-footnote font-medium text-label-3">{n}</span>
            <span aria-hidden className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-label transition-opacity ${i === k ? "opacity-100" : "opacity-0"}`} />
          </button>
        ))}
      </div>
      <div role="tabpanel">{tabs[i]![2]}</div>
    </section>
  );
}

function Rows({ items, empty }: { items: { key: string; href: string; title: string; sub: ReactNode; right: ReactNode }[]; empty: string }) {
  if (!items.length) return <p className="py-8 text-sub text-label-2">{empty}</p>;
  return (
    <ul className="divide-y hairline">
      {items.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="group flex items-center gap-4 py-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium group-hover:text-tint">{r.title}</span>
              <span className="mt-0.5 block text-footnote text-label-2">{r.sub}</span>
            </span>
            <span className="tabular shrink-0 text-right text-sub">{r.right}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
