/** Appearance settings kept in this browser: accent colour, background effect, density and motion.
 *  Each is set as a data- attribute on <html> before the page paints (see bootScript), and CSS reads them. */
import { THEME_KEY } from "./theme";

export const ACCENTS = {
  violet: { label: "Violet", a: "#7c6cff", b: "#38bdf8" },
  cyan: { label: "Cyan", a: "#06b6d4", b: "#818cf8" },
  emerald: { label: "Emerald", a: "#10b981", b: "#22d3ee" },
  rose: { label: "Rose", a: "#f43f5e", b: "#f59e0b" },
  amber: { label: "Amber", a: "#f59e0b", b: "#ef4444" },
  mono: { label: "Graphite", a: "#64748b", b: "#94a3b8" },
} as const;
export type Accent = keyof typeof ACCENTS;
export const BACKGROUNDS = { aurora: "Aurora", grid: "Grid", particles: "Particles", none: "Plain" } as const;
export type Background = keyof typeof BACKGROUNDS;
export type Density = "comfortable" | "compact";
export type Motion = "full" | "reduced";
export type Prefs = { accent: Accent; bg: Background; density: Density; motion: Motion };

const KEY = "lp-prefs";
export const DEFAULTS: Prefs = { accent: "violet", bg: "aurora", density: "comfortable", motion: "full" };

export function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      accent: v.accent in ACCENTS ? v.accent : DEFAULTS.accent,
      bg: v.bg in BACKGROUNDS ? v.bg : DEFAULTS.bg,
      density: v.density === "compact" ? "compact" : "comfortable",
      motion: v.motion === "reduced" ? "reduced" : "full",
    };
  } catch {
    return DEFAULTS;
  }
}

export function applyPrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  const el = document.documentElement;
  el.dataset.accent = p.accent;
  el.dataset.bg = p.bg;
  el.dataset.density = p.density;
  el.dataset.motion = p.motion;
  window.dispatchEvent(new CustomEvent("lp-prefs", { detail: p }));
}

/** True when animations should be calm: the visitor's system setting, or the switch in Appearance. */
export function calm(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Theme and appearance, applied in <head> before anything paints. */
export const bootScript = `(function(){var h=document.documentElement;try{var t=localStorage.getItem("${THEME_KEY}")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);h.setAttribute("data-theme",d?"dark":"light");var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");h.dataset.accent=p.accent||"violet";h.dataset.bg=p.bg||"aurora";h.dataset.density=p.density||"comfortable";h.dataset.motion=p.motion||"full"}catch(e){h.setAttribute("data-theme","dark");h.dataset.accent="violet";h.dataset.bg="aurora"}})()`;
