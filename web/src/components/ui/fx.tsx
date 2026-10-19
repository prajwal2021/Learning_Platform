"use client";
import { useEffect, useRef, useState } from "react";
import { animate, motion, type Variants, useInView, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import clsx from "clsx";
import { calm } from "@/lib/prefs";

/** A card lit by a soft light under the pointer (CSS .spotlight reads --mx / --my). */
export function Spotlight({ className, children, as: Tag = "div", ...rest }: { className?: string; children: React.ReactNode; as?: any } & Record<string, any>) {
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return <Tag className={clsx("spotlight", className)} onPointerMove={onMove} {...rest}>{children}</Tag>;
}

/** Tilts toward the pointer in 3D, with a glare. */
export function Tilt({ className, children, max = 8, glare = true }: { className?: string; children: React.ReactNode; max?: number; glare?: boolean }) {
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 220, damping: 20 });
  const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 220, damping: 20 });
  const gx = useTransform(x, (v) => `${v * 100}%`), gy = useTransform(y, (v) => `${v * 100}%`);
  const bg = useMotionTemplate`radial-gradient(500px circle at ${gx} ${gy}, rgba(255,255,255,.14), transparent 40%)`;
  return (
    <motion.div className={clsx("relative", className)} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => { if (calm()) return; const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height); }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}>
      {children}
      {glare ? <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: bg }} /> : null}
    </motion.div>
  );
}

/** Counts up to a number when it scrolls into view. */
export function Counter({ value, className, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (calm()) { setShown(value); return; }
    const c = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => c.stop();
  }, [inView, value]);
  return <span ref={ref} className={className}>{format(shown)}</span>;
}

/** A ring that fills to a fraction, with a gradient stroke. */
export function Ring({ value, size = 64, stroke = 6, children, className }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; className?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const id = useRef(`rg${Math.random().toString(36).slice(2, 8)}`).current;
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={clsx("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--lp-brand)" /><stop offset="1" stopColor="var(--lp-brand-2)" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--lp-node)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: c * (1 - pct) }} viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Fades and rises into view. */
export function Reveal({ children, className, delay = 0, y = 18 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

export const EASE = [0.16, 1, 0.3, 1] as const;
export const stagger: { parent: Variants; child: Variants } = {
  parent: { hidden: {}, show: { transition: { staggerChildren: 0.05 } } },
  child: { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } },
};

export function PageHeader({ eyebrow, title, lede, children, icon }: { eyebrow?: string; title: React.ReactNode; lede?: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <header className="relative mb-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        {eyebrow ? <p className="eyebrow mb-3 flex items-center gap-2">{icon}{eyebrow}</p> : null}
        <h1 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-[1.08] tracking-[-0.035em] text-balance">{title}</h1>
        {lede ? <p className="mt-3 max-w-2xl text-[1.04rem] leading-relaxed text-muted text-pretty">{lede}</p> : null}
        {children ? <div className="mt-5 flex flex-wrap items-center gap-3">{children}</div> : null}
      </motion.div>
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-node", className)} />;
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div> : null}
      <p className="font-semibold">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}
