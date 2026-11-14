import { CountUp } from "./count-up";

/**
 * Quire's mark, drawn live: the green arc is the chance of Yes, the rust arc the
 * chance of No, and the ink tail turns the ring into a Q. Arcs draw themselves in
 * on first paint.
 */
export function OddsRing({
  ppm,
  size = 64,
  stroke = 9,
  label = false,
  animate = true,
  delay = 0,
  className = "",
}: {
  ppm: number;
  size?: number;
  stroke?: number;
  label?: boolean;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  const p = Math.min(100, Math.max(0, ppm / 10_000));
  const gap = p <= 1 || p >= 99 ? 0 : 3.2; // space between the arcs, in % of the ring
  const yes = Math.max(0, p - gap);
  const no = Math.max(0, 100 - p - gap);
  const r = 39;
  const anim = animate ? "ring-arc" : "";
  const style = (d: number) => (animate ? { animationDelay: `${delay + d}ms` } : undefined);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90 overflow-visible" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        {yes > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--yes)"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${yes} 100`}
            strokeDashoffset={-gap / 2}
            className={anim}
            style={style(0)}
          />
        )}
        {no > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--no)"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${no} 100`}
            strokeDashoffset={-(p + gap / 2)}
            className={anim}
            style={style(180)}
          />
        )}
      </svg>
      {/* the tail of the Q, cut out of the ring like the logo */}
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <line x1="76" y1="76" x2="96" y2="96" stroke="var(--cut, var(--elevated))" strokeWidth={stroke + 6} strokeLinecap="round" />
        <line x1="76" y1="76" x2="96" y2="96" stroke="var(--label)" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
      {label && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="tabular leading-none font-semibold tracking-[-0.035em]" style={{ fontSize: size * 0.2 }}>
            {animate ? <CountUp value={p} delay={delay} /> : Math.round(p)}
            <span style={{ fontSize: size * 0.11 }}>%</span>
          </p>
        </div>
      )}
    </div>
  );
}
