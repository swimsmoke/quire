"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** iOS segmented control with a sliding thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  disabled = false,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const h = size === "sm" ? "h-7 text-footnote" : "h-9 text-sub";
  return (
    <div role="radiogroup" aria-label={label} className={`relative grid rounded-lg border hairline bg-bg-2 p-[3px] ${h} ${disabled ? "opacity-50" : ""}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-md border hairline bg-elevated shadow-[0_1px_2px_rgba(14,16,21,0.08)] transition-transform duration-300 ease-ios"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`relative z-10 px-3 font-medium transition-colors duration-200 ${o.value === value ? "text-label" : "text-label-2 hover:text-label"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Drawer: slides up from the bottom on phones, in from the right on larger screens. */
export function Sheet({ open, onClose, title, children, side = "right", bare = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: "right" | "left"; bare?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus(), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className={`fixed inset-0 z-50 flex ${side === "left" ? "items-stretch justify-start" : "items-end justify-center sm:items-stretch sm:justify-end"}`} role="presentation">
      <div className="anim-fade absolute inset-0 bg-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          side === "left"
            ? "anim-drawer-left relative h-full w-[86vw] max-w-[360px] overflow-y-auto bg-elevated pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)]"
            : "anim-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-elevated pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)] sm:anim-drawer sm:h-full sm:max-h-none sm:max-w-[420px] sm:rounded-none sm:pb-6"
        }
      >
        {bare ? children : <>
        {side !== "left" && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-fill-2 sm:hidden" aria-hidden />}
        <div className="flex items-center justify-between border-b hairline px-6 pt-3 pb-3 sm:pt-5 sm:pb-4">
          <h2 className="text-title3 font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-label-2 transition-colors hover:bg-fill hover:text-label">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-6 pt-5">{children}</div>
        </>}
      </div>
    </div>,
    document.body,
  );
}

/** Number that eases to its new value (used for prices that move after a trade). */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || a === value) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const e = 1 - Math.pow(1 - k, 4);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

export const buttonPrimary =
  "inline-flex h-11 items-center justify-center rounded-full bg-label px-6 text-sub font-semibold text-bg shadow-[0_0_0_1px_var(--separator),0_8px_30px_-12px_var(--glow-a)] transition-[transform,opacity,box-shadow] duration-300 ease-glide hover:shadow-[0_0_0_1px_var(--separator),0_10px_40px_-8px_var(--glow-b)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
export const buttonSecondary =
  "glass inline-flex h-11 items-center justify-center rounded-full px-6 text-sub font-semibold text-label transition-[transform,border-color] duration-300 ease-glide hover:border-label-3 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
