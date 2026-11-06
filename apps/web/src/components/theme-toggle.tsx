"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Pref = "light" | "dark" | "system";
const KEY = "quire.theme";
const ORDER: Pref[] = ["system", "light", "dark"];

/** Inline script run before paint so the page never flashes the wrong theme. */
export const themeScript = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.dataset.theme=d?'dark':'light';e.dataset.themePref=p;}catch(_){document.documentElement.dataset.theme='light'}})();`;

function apply(pref: Pref, animate: boolean) {
  const el = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (animate) {
    el.classList.add("theme-transition");
    window.setTimeout(() => el.classList.remove("theme-transition"), 400);
  }
  el.dataset.theme = dark ? "dark" : "light";
  el.dataset.themePref = pref;
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");

  useEffect(() => {
    const p = (document.documentElement.dataset.themePref as Pref) || "system";
    setPref(p);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((document.documentElement.dataset.themePref as Pref) === "system") apply("system", true);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!;
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  const label = { system: "Theme: matches your device", light: "Theme: light", dark: "Theme: dark" }[pref];

  return (
    <button
      type="button"
      title={`${label}. Switch to ${next}.`}
      aria-label={`${label}. Switch to ${next}.`}
      onClick={() => {
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* preference lasts for this page only */
        }
        apply(next, true);
        setPref(next);
      }}
      className="grid size-9 place-items-center rounded-full text-label-2 transition-[background-color,color,transform] duration-200 ease-ios hover:bg-fill hover:text-label active:scale-90"
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}
