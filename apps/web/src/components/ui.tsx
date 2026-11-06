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
    <div role="radiogroup" aria-label={label} className={`relative grid rounded-[9px] bg-fill p-0.5 ${h} ${disabled ? "opacity-50" : ""}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-[7px] bg-elevated shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-ios dark:bg-[#636366]"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
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

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="anim-fade absolute inset-0 bg-scrim backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-sheet relative w-full max-w-md rounded-t-[14px] bg-elevated pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)] sm:anim-pop sm:rounded-[14px] sm:pb-5"
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-fill-2 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <h2 className="text-body font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-full bg-fill text-label-2 transition-colors hover:text-label">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-5 pt-2">{children}</div>
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
  "inline-flex h-11 items-center justify-center rounded-full bg-tint px-5 text-sub font-semibold text-white transition-[transform,background-color,opacity] duration-200 ease-ios hover:bg-tint-press active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
export const buttonSecondary =
  "inline-flex h-11 items-center justify-center rounded-full bg-fill px-5 text-sub font-semibold text-tint transition-[transform,background-color] duration-200 ease-ios hover:bg-fill-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
