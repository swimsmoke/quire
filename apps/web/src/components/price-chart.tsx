"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { HistoryPoint } from "@/lib/types";
import { pct } from "@/lib/format";
import { AnimatedNumber, Segmented } from "./ui";

type Range = "1D" | "1W" | "1M" | "ALL";
const SPAN: Record<Range, number> = { "1D": 864e5, "1W": 7 * 864e5, "1M": 30 * 864e5, ALL: Infinity };
const RANGE_LABEL: Record<Range, string> = { "1D": "past day", "1W": "past week", "1M": "past month", ALL: "since open" };

const fmtPct = (n: number) => `${(n / 10_000).toFixed(1)}%`;
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Stocks-style probability chart: stepped line, soft fill, scrub to read any
 * moment. Colour follows direction over the selected range.
 */
export function PriceChart({
  points,
  currentPpm,
  height = 240,
  showHeader = true,
  defaultRange = "ALL",
  animate = true,
  asOf,
}: {
  points: HistoryPoint[];
  currentPpm: number;
  height?: number;
  showHeader?: boolean;
  defaultRange?: Range;
  animate?: boolean;
  /** server timestamp (ms) so server and client draw the same line */
  asOf: number;
}) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [scrub, setScrub] = useState<number | null>(null); // index into series
  const box = useRef<HTMLDivElement>(null);
  const now = asOf;

  const series = useMemo(() => {
    const all = points.map((p) => ({ t: new Date(p.t).getTime(), p: p.p }));
    if (!all.length) return [{ t: now - 1, p: currentPpm }, { t: now, p: currentPpm }];
    const start = SPAN[range] === Infinity ? all[0]!.t : now - SPAN[range];
    const before = [...all].reverse().find((p) => p.t <= start);
    const inRange = all.filter((p) => p.t > start);
    const s = [...(before ? [{ t: start, p: before.p }] : []), ...inRange];
    if (!s.length) s.push({ t: start, p: all[0]!.p });
    s.push({ t: now, p: currentPpm });
    return s;
  }, [points, range, currentPpm, now]);

  const t0 = series[0]!.t;
  const t1 = Math.max(series[series.length - 1]!.t, t0 + 1);
  const X = (t: number) => ((t - t0) / (t1 - t0)) * 1000;
  // Auto-scale like Stocks: fit the visible values with a minimum 6-point window.
  const vals = series.map((p) => p.p);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const mid = (lo + hi) / 2;
  const half = Math.max((hi - lo) / 2, 30_000) * 1.4;
  const dLo = Math.max(0, mid - half);
  const dHi = Math.min(1_000_000, mid + half);
  const Y = (p: number) => (1 - (p - dLo) / (dHi - dLo)) * 1000;

  let line = "";
  series.forEach((p, i) => {
    line += i === 0 ? `M${X(p.t).toFixed(2)},${Y(p.p).toFixed(2)}` : ` H${X(p.t).toFixed(2)} V${Y(p.p).toFixed(2)}`;
  });
  const area = `${line} V1000 H0 Z`;

  const first = series[0]!.p;
  const change = currentPpm - first;
  const up = change >= 0;
  const color = change === 0 ? "var(--label-2)" : up ? "var(--yes)" : "var(--no)";

  const active = scrub != null ? series[scrub]! : null;
  const shownValue = active ? active.p : currentPpm;

  function onMove(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const t = t0 + f * (t1 - t0);
    let idx = 0;
    for (let i = 0; i < series.length; i++) if (series[i]!.t <= t) idx = i;
    setScrub(idx);
  }

  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div>
      {showHeader && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="tabular text-[3.5rem] leading-none font-semibold tracking-[-0.035em] sm:text-[4.5rem]">
              {active ? fmtPct(shownValue) : <AnimatedNumber value={currentPpm} format={fmtPct} />}
            </p>
            <p className="mt-2 text-sub text-label-2">
              {active ? (
                <>Yes probability at {when(active.t)}</>
              ) : (
                <>
                  <span className="tabular font-medium" style={{ color }}>
                    {change === 0 ? "No change" : `${up ? "+" : "−"}${(Math.abs(change) / 10_000).toFixed(1)} pts`}
                  </span>{" "}
                  Yes probability, {RANGE_LABEL[range]}
                </>
              )}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Segmented
              label="Chart range"
              size="sm"
              value={range}
              onChange={(r) => {
                setRange(r);
                setScrub(null);
              }}
              options={(["1D", "1W", "1M", "ALL"] as Range[]).map((r) => ({ value: r, label: r === "ALL" ? "All" : r }))}
            />
          </div>
        </div>
      )}

      <div
        ref={box}
        className="relative touch-none select-none"
        style={{ height }}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setScrub(null)}
        onPointerUp={(e) => e.pointerType !== "mouse" && setScrub(null)}
        role="img"
        aria-label={`Yes probability chart, ${RANGE_LABEL[range]}. Now ${pct(currentPpm)}.`}
      >
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* dotted reference: where the selected range started */}
          <line x1="0" x2="1000" y1={Y(first)} y2={Y(first)} stroke="var(--label-3)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gid})`} className={animate ? "anim-fade" : undefined} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            className={animate ? "anim-draw" : undefined}
            key={range}
          />
        </svg>
        <span className="tabular pointer-events-none absolute top-0 right-0 text-caption text-label-3">{fmtPct(dHi)}</span>
        <span className="tabular pointer-events-none absolute right-0 bottom-0 text-caption text-label-3">{fmtPct(dLo)}</span>
        {active ? (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-label-3" style={{ left: `${X(active.t) / 10}%` }} />
            <span
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg"
              style={{ left: `${X(active.t) / 10}%`, top: `${Y(active.p) / 10}%`, background: color }}
            />
          </>
        ) : (
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: "100%", top: `${Y(currentPpm) / 10}%`, background: color, boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` }}
          />
        )}
      </div>
    </div>
  );
}
