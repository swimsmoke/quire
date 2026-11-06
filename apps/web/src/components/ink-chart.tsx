import type { HistoryPoint } from "@/lib/types";

/**
 * Probability history as a single stepped ink line on a 0–100% scale.
 * The SVG stretches to its box (fixed pixel height, fluid width) so it stays
 * legible on phones; strokes don't scale and axis labels are HTML.
 */
export function InkChart({
  points,
  height = 220,
  draw = false,
  label,
}: {
  points: HistoryPoint[];
  height?: number;
  draw?: boolean;
  label: string;
}) {
  const W = 1000;
  const H = 1000;
  const now = Date.now();
  const series = points.length ? [...points, { ...points[points.length - 1]!, t: new Date(now).toISOString() }] : [];
  const t0 = series.length ? new Date(series[0]!.t).getTime() : now - 1;
  const t1 = Math.max(now, t0 + 1);
  const x = (t: string) => ((new Date(t).getTime() - t0) / (t1 - t0)) * W;
  const y = (p: number) => (1 - p / 1_000_000) * H;

  let d = "";
  series.forEach((p, i) => {
    const X = x(p.t).toFixed(1);
    const Y = y(p.p).toFixed(1);
    d += i === 0 ? `M${X},${Y}` : ` H${X} V${Y}`;
  });
  const last = series[series.length - 1];
  const grid = [0, 250_000, 500_000, 750_000, 1_000_000];

  return (
    <figure className="w-full">
      <div className="relative pl-8" style={{ height }}>
        {grid.map((g) => (
          <span key={g} className="tabular absolute left-0 w-6 -translate-y-1/2 text-right text-[11px] leading-none text-fade" style={{ top: `${(1 - g / 1_000_000) * 100}%` }}>
            {g / 10_000}
          </span>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible" role="img" aria-label={label}>
          {grid.map((g) => (
            <line
              key={g}
              x1={0}
              x2={W}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--color-rule)"
              strokeWidth={g === 500_000 ? 1 : 0.75}
              strokeDasharray={g === 500_000 ? undefined : "2 4"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {d && (
            <path
              d={d}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={1.75}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              className={draw ? "ink-draw" : undefined}
              style={draw ? ({ "--len": 1 } as React.CSSProperties) : undefined}
            />
          )}
          {last && (
            // zero-length round-capped line = a dot that stays round under non-uniform scaling
            <line x1={x(last.t)} x2={x(last.t)} y1={y(last.p)} y2={y(last.p)} stroke="var(--color-ledger)" strokeWidth={8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      {!points.length && <figcaption className="text-sm text-fade">No price history yet.</figcaption>}
    </figure>
  );
}
