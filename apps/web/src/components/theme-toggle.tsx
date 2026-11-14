"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const KEY = "quire.theme";

/** Inline script run before paint so the page never flashes the wrong theme. Light unless dark was chosen. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}')==='dark'?'dark':'light';document.documentElement.dataset.theme=t;}catch(_){document.documentElement.dataset.theme='light'}})();`;

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

/** Light or dark. The new theme spreads out from the button in a circle where the browser supports it. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* lasts for this page only */
    }
    const el = document.documentElement;
    const set = () => {
      el.dataset.theme = next;
      setTheme(next);
    };
    const doc = document as VTDoc;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduce || !btn.current) return set();
    const r = btn.current.getBoundingClientRect();
    el.style.setProperty("--vt-x", `${r.left + r.width / 2}px`);
    el.style.setProperty("--vt-y", `${r.top + r.height / 2}px`);
    el.classList.add("theme-vt");
    doc.startViewTransition(set).finished.finally(() => el.classList.remove("theme-vt"));
  }

  const dark = theme === "dark";
  return (
    <button
      ref={btn}
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`relative grid size-9 place-items-center overflow-hidden rounded-full text-label-2 transition-[background-color,color,transform] duration-200 ease-ios hover:bg-fill hover:text-label active:scale-90 ${className}`}
    >
      <Sun size={18} strokeWidth={1.8} className={`absolute transition-[transform,opacity] duration-500 ease-glide ${dark ? "translate-y-0 rotate-0 opacity-100" : "translate-y-5 -rotate-90 opacity-0"}`} />
      <Moon size={17} strokeWidth={1.8} className={`absolute transition-[transform,opacity] duration-500 ease-glide ${dark ? "-translate-y-5 rotate-90 opacity-0" : "translate-y-0 rotate-0 opacity-100"}`} />
    </button>
  );
}
