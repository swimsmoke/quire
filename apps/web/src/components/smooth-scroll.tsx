"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

let lenis: Lenis | null = null;

/** Gentle inertia for mouse wheels and trackpads. Touch scrolling stays native, and reduced motion turns it off. */
export function SmoothScroll() {
  const path = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, anchors: { offset: -80 }, autoRaf: true });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);
  // a new page starts at the top, without gliding there
  useEffect(() => {
    if (!window.location.hash) lenis?.scrollTo(0, { immediate: true });
  }, [path]);
  return null;
}
