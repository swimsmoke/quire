"use client";

import { useEffect, useState } from "react";

/** Counts from 0 up to `value` once, in step with the ring drawing. */
export function CountUp({ value, delay = 0, decimals = 0 }: { value: number; delay?: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t + delay;
      const k = Math.min(1, Math.max(0, (t - start) / 1300));
      const e = 1 - Math.pow(1 - k, 4);
      setShown(value * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);
  return <>{shown.toFixed(decimals)}</>;
}
