"use client";
/** Smooth, eased wheel scrolling on the new pages (not on the legacy pages, whose scripts manage scrolling). */
import { useEffect } from "react";
import Lenis from "lenis";
import { calm } from "@/lib/prefs";

export default function SmoothScroll() {
  useEffect(() => {
    if (calm()) return;
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true, easing: (t) => 1 - Math.pow(1 - t, 3), prevent: (n) => !!n.closest?.("[data-lenis-prevent], .react-flow, [cmdk-list], iframe") });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return null;
}
