"use client";
/* The tech stack in orbit: logos of the technologies the platform teaches, circling a glowing core on three tilted rings,
   with a few large logos drifting behind. The whole system leans toward the pointer. */
import { useMemo } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import {
  siAngular, siApachekafka, siApachespark, siCplusplus, siDjango, siDocker, siElasticsearch, siFastapi, siFlutter, siGit,
  siGithubactions, siGo, siGooglecloud, siGrafana, siGraphql, siJavascript, siKotlin, siKubernetes, siLinux, siMongodb,
  siMysql, siNextdotjs, siNginx, siNodedotjs, siOpenjdk, siPostgresql, siPrometheus, siPython, siPytorch, siRabbitmq,
  siReact, siRedis, siRust, siSpringboot, siSvelte, siSwift, siTailwindcss, siTerraform, siTypescript, siVuedotjs,
  type SimpleIcon,
} from "simple-icons";
import s from "./techorbit.module.css";

type Icon = SimpleIcon & { label?: string };
const L = (i: SimpleIcon, label?: string): Icon => ({ ...i, label });

// inner ring: the core of the stack the labs build; middle: languages and frameworks; outer: platform and data
const RINGS: { r: number; dur: number; dir: "normal" | "reverse"; small?: boolean; icons: Icon[] }[] = [
  { r: 150, dur: 38, dir: "normal", icons: [L(siPython), L(siPostgresql), L(siRedis), L(siDocker), L(siFastapi, "FastAPI"), L(siReact)] },
  { r: 235, dur: 58, dir: "reverse", icons: [L(siTypescript), L(siGo), L(siRust), L(siNodedotjs, "Node.js"), L(siKubernetes), L(siApachekafka, "Kafka"),
    L(siNextdotjs, "Next.js"), L(siGraphql, "GraphQL"), L(siOpenjdk, "Java"), L(siGit)] },
  { r: 325, dur: 84, dir: "normal", small: true, icons: [L(siMongodb, "MongoDB"), L(siTerraform), L(siNginx, "NGINX"), L(siRabbitmq, "RabbitMQ"),
    L(siElasticsearch), L(siGooglecloud, "Google Cloud"), L(siGithubactions, "GitHub Actions"), L(siPrometheus), L(siGrafana), L(siLinux),
    L(siSpringboot, "Spring Boot"), L(siDjango), L(siMysql, "MySQL"), L(siApachespark, "Spark")] },
];
const DRIFT: Icon[] = [siJavascript, siVuedotjs, siAngular, siSvelte, siKotlin, siSwift, siFlutter, siCplusplus, siPytorch, siTailwindcss].map((i) => L(i));

/** Logos drawn in black or near-black disappear on a dark page; those take the page's text colour instead. */
function ink(hex: string) {
  const n = parseInt(hex, 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.22 ? "var(--lp-fg)" : `#${hex}`;
}

function Tile({ icon }: { icon: Icon }) {
  const c = ink(icon.hex);
  return (
    <div className={s.tile} style={{ ["--ink" as string]: c, ["--glow" as string]: c === "var(--lp-fg)" ? "var(--lp-brand)" : `#${icon.hex}`, ["--bob" as string]: `${(icon.title.length % 7) * -0.6}s` }}>
      <svg viewBox="0 0 24 24" role="img" aria-label={icon.label ?? icon.title}><path d={icon.path} /></svg>
      <span className={s.name}>{icon.label ?? icon.title}</span>
    </div>
  );
}

export default function TechOrbit({ className, scale = 1, label = "Your stack", sub }: { className?: string; scale?: number; label?: string; sub?: string }) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [8, -8]), { stiffness: 60, damping: 18 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-12, 12]), { stiffness: 60, damping: 18 });
  const drift = useMemo(() => DRIFT.map((icon, i) => ({
    icon, left: `${(i * 37 + 7) % 92}%`, top: `${(i * 53 + 11) % 86}%`, size: 34 + ((i * 13) % 30),
    dx: `${((i % 2) ? 1 : -1) * (30 + (i * 11) % 50)}px`, dy: `${((i % 3) ? -1 : 1) * (20 + (i * 7) % 40)}px`, d: `${12 + (i % 5) * 3}s`, dl: `${-i * 1.7}s`,
  })), []);

  return (
    <div className={className} onPointerMove={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width) * 2 - 1); my.set(((e.clientY - r.top) / r.height) * 2 - 1);
    }} onPointerLeave={() => { mx.set(0); my.set(0); }}>
      <div className={s.drift} aria-hidden="true">
        {drift.map((d) => (
          <span key={d.icon.slug} style={{ left: d.left, top: d.top, ["--s" as string]: `${d.size}px`, ["--dx" as string]: d.dx, ["--dy" as string]: d.dy, ["--d" as string]: d.d, ["--dl" as string]: d.dl, ["--ink" as string]: ink(d.icon.hex) }}>
            <svg viewBox="0 0 24 24"><path d={d.icon.path} /></svg>
          </span>
        ))}
      </div>
      <div className={s.stage}>
        <motion.div className={s.scene} style={{ rotateX: rx, rotateY: ry, scale }}>
          <div className={s.plane}>
            {RINGS.map((ring, ri) => (
              <div key={ri} className={`${s.ring} ${ring.small ? s.small : ""}`} style={{ ["--r" as string]: `${ring.r}px`, ["--dur" as string]: `${ring.dur}s`, ["--dir" as string]: ring.dir }}>
                <div className={s.track} />
                {ring.icons.map((icon, i) => (
                  <div key={icon.slug} className={s.slot} style={{ ["--a" as string]: `${(360 / ring.icons.length) * i + ri * 17}deg` }}>
                    <div className={s.face}><Tile icon={icon} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className={s.core} aria-hidden="true">
            <span className={s.pulse} /><span className={s.pulse} />
            <div className={s.coreOrb}><div className={s.coreInner}><span className={s.coreLabel}>{label}{sub ? <span className={s.coreSub}>{sub}</span> : null}</span></div></div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
