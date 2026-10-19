import { calm } from "./prefs";

/** A short burst of confetti in the accent colours, for finishing something. */
export async function celebrate() {
  if (calm()) return;
  const { default: confetti } = await import("canvas-confetti");
  const css = getComputedStyle(document.documentElement);
  const colors = ["--lp-brand", "--lp-brand-2", "--lp-pink", "--lp-brand-3"].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  const shot = (x: number, angle: number) => confetti({ particleCount: 70, spread: 70, angle, origin: { x, y: 0.7 }, colors, startVelocity: 55, ticks: 220, scalar: 0.95 });
  shot(0.15, 60); shot(0.85, 120);
  setTimeout(() => confetti({ particleCount: 90, spread: 120, origin: { y: 0.45 }, colors, scalar: 1.1 }), 260);
}
