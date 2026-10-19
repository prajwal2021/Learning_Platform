"use client";
/** The page background chosen in Appearance: aurora blobs, a grid, drifting particles, or plain. */
import { useEffect, useRef, useState } from "react";
import { calm } from "@/lib/prefs";

export default function Background() {
  const [bg, setBg] = useState<string>("aurora");
  useEffect(() => {
    const read = () => setBg(document.documentElement.dataset.bg || "aurora");
    read();
    window.addEventListener("lp-prefs", read);
    return () => window.removeEventListener("lp-prefs", read);
  }, []);
  return (
    <div className="bgfx" aria-hidden="true">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <div className="grid" />
      {bg === "particles" ? <Particles /> : null}
      <div className="noise" />
    </div>
  );
}

function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!;
    let raf = 0, w = 0, h = 0;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pts = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0004, vy: (Math.random() - .5) * .0004 }));
    const mouse = { x: -1, y: -1 };
    const size = () => { w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr; };
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; };
    size();
    addEventListener("resize", size);
    addEventListener("pointermove", onMove);
    const color = () => getComputedStyle(document.documentElement).getPropertyValue("--lp-brand").trim() || "#8b7dff";
    let col = color(), frame = 0;
    const draw = () => {
      if (++frame % 60 === 0) col = color();
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!calm()) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
      }
      ctx.fillStyle = col; ctx.strokeStyle = col;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], ax = a.x * w, ay = a.y * h;
        ctx.globalAlpha = .55; ctx.beginPath(); ctx.arc(ax, ay, 1.6 * dpr, 0, 7); ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(ax - b.x * w, ay - b.y * h);
          if (d < 140 * dpr) { ctx.globalAlpha = (1 - d / (140 * dpr)) * .22; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(b.x * w, b.y * h); ctx.stroke(); }
        }
        const dm = Math.hypot(ax - mouse.x, ay - mouse.y);
        if (dm < 180 * dpr) { ctx.globalAlpha = (1 - dm / (180 * dpr)) * .5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}
