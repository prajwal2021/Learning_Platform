"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, ArrowUpRight, BookOpenText, BrainCircuit, CalendarDays, CheckCircle2, Clock, Compass, Flame, FlaskConical, GitBranch,
  Hammer, Layers3, PlayCircle, Presentation, Siren, Sparkles, Target, Trophy, Workflow,
} from "lucide-react";
import clsx from "clsx";
import { get } from "@/lib/http";
import type { Overview } from "@/lib/types";
import { Counter, Reveal, Ring, Skeleton, Spotlight, Tilt, stagger } from "@/components/ui/fx";

const TechOrbit = dynamic(() => import("@/components/three/TechOrbit"), { ssr: false });

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
const pct = (a: number, b: number) => (b ? a / b : 0);
const hard = (href: string) => /^\/(path|stack-map|field-view)/.test(href);

function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return hard(href) ? <a href={href} className={className}>{children}</a> : <Link href={href} className={className}>{children}</Link>;
}

export default function Home() {
  const [d, setD] = useState<Overview | null>(null);
  useEffect(() => { get<Overview>("/api/me/overview").then(setD).catch(() => {}); }, []);

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-6 sm:px-8 lg:pt-10">
      <Hero d={d} />
      <Stats d={d} />
      <div className="mt-[var(--lp-gap)] grid gap-[var(--lp-gap)] xl:grid-cols-[1.35fr_1fr]">
        <TodayDrill d={d} />
        <ContinueList d={d} />
      </div>
      <CoreBuildStrip d={d} />
      <div className="mt-[var(--lp-gap)] grid gap-[var(--lp-gap)] xl:grid-cols-[1.35fr_1fr]">
        <Activity d={d} />
        <InterviewMap d={d} />
      </div>
      <Explore d={d} />
    </main>
  );
}

/* ------------------------------------------------------------------ hero */
function Hero({ d }: { d: Overview | null }) {
  const first = d?.user.name.split(/\s+/)[0];
  const next = d?.path.next;
  const lastWb = d?.workbooks.last;
  return (
    <section className="card relative overflow-hidden !rounded-[28px] border-glow">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_85%_30%,var(--lp-brand-soft),transparent_70%)]" />
      <div className="relative grid items-center gap-6 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative z-[1]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap items-center gap-2">
            <span className="chip !cursor-default"><CalendarDays size={13} /> {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
            {d ? (
              <span className={clsx("chip !cursor-default", d.activity.streak > 0 && "!border-warn/40 !bg-warn/10 !text-warn")}>
                <Flame size={13} /> {d.activity.streak > 0 ? `${d.activity.streak}-day streak` : "Start a streak today"}
              </span>
            ) : null}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-[clamp(2rem,4.4vw,3.4rem)] font-bold leading-[1.04] tracking-[-0.045em]">
            {greeting()}{first ? <>, <span className="text-gradient">{first}</span></> : null}.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-3 max-w-xl text-[1.05rem] leading-relaxed text-muted">
            {d ? (d.path.done || d.labs.done || d.interview.known
              ? <>You have finished <b className="text-fg">{d.path.done}</b> of {d.path.total} path steps, ticked <b className="text-fg">{d.labs.done}</b> lab items and know <b className="text-fg">{d.interview.known}</b> interview answers. Keep the momentum.</>
              : <>Everything you need to go from your first container to defending a system design, in one place. Start with the next step below.</>)
              : <span className="shimmer-text">Loading your progress…</span>}
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-7">
            {!d ? <Skeleton className="h-[132px] max-w-xl" /> : next ? (
              <Spotlight className="glass relative max-w-xl overflow-hidden rounded-2xl p-5">
                <p className="eyebrow flex items-center gap-2"><Target size={13} /> Your next step · Unit {next.unit}</p>
                <p className="mt-2 text-[1.02rem] font-semibold leading-snug">
                  <span className="mr-2 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand">{next.kind}</span>
                  {next.text}
                </p>
                <p className="mt-1 text-[13px] text-faint">{next.unit_name}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {next.href ? <a href={next.href} className="btn btn-primary btn-sm">{next.link ?? "Open"} <ArrowRight size={15} /></a> : null}
                  <a href={`/path#unit-${next.unit}`} className="btn btn-sm">See it in the path</a>
                </div>
              </Spotlight>
            ) : (
              <div className="glass max-w-xl rounded-2xl p-5">
                <p className="font-semibold">Every built step of the Learning Path is done. 🎉</p>
                <p className="mt-1 text-sm text-muted">Try today’s incident drill, or continue the Core Build.</p>
              </div>
            )}
          </motion.div>
          <div className="mt-4 flex flex-wrap gap-2">
            {lastWb ? <Link href={`/core-build/${lastWb.slug}`} className="btn btn-ghost btn-sm"><Hammer size={15} /> Resume Stage {lastWb.stage}: {lastWb.title}</Link> : null}
            <Link href="/roadmap" className="btn btn-ghost btn-sm"><Workflow size={15} /> Open my roadmap</Link>
          </div>
        </div>
        <div className="relative hidden h-[440px] lg:block">
          <TechOrbit className="absolute inset-0" scale={0.72} label="Your stack" sub={d ? `${d.interview.topics} technologies` : undefined} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ stats */
function Stats({ d }: { d: Overview | null }) {
  const tiles = d ? [
    { label: "Learning Path", value: d.path.done, of: d.path.total, unit: "steps", icon: GitBranch, href: "/path", tone: "var(--lp-brand)" },
    { label: "Lab checklist", value: d.labs.done, of: d.labs.total, unit: "items", icon: FlaskConical, href: "/stack-map", tone: "var(--lp-brand-2)" },
    { label: "Interview answers known", value: d.interview.known, of: d.interview.questions, unit: "questions", icon: BrainCircuit, href: "/interview", tone: "var(--lp-pink)" },
    { label: "Incident drills solved", value: d.challenges.completed, of: d.challenges.total, unit: "drills", icon: Siren, href: "/challenges", tone: "var(--lp-amber)" },
    { label: "Core Build opened", value: d.workbooks.visited, of: d.workbooks.total, unit: "workbooks", icon: Hammer, href: "/core-build", tone: "var(--lp-brand-3)" },
  ] : [];
  return (
    <motion.section variants={stagger.parent} initial="hidden" animate={d ? "show" : "hidden"}
      className="mt-[var(--lp-gap)] grid grid-cols-2 gap-[var(--lp-gap)] md:grid-cols-3 xl:grid-cols-5">
      {!d ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[132px]" />) : tiles.map((t) => (
        <motion.div key={t.label} variants={stagger.child}>
          <SmartLink href={t.href} className="block h-full">
            <Spotlight className="card group h-full overflow-hidden p-[var(--lp-pad)] transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12.5px] font-medium text-muted">{t.label}</p>
                  <p className="mt-2 text-[1.9rem] font-bold leading-none tracking-[-0.04em]"><Counter value={t.value} /></p>
                  <p className="mt-1.5 text-[12px] text-faint">of {t.of.toLocaleString()} {t.unit}</p>
                </div>
                <Ring value={pct(t.value, t.of)} size={52} stroke={5}>
                  <t.icon className="h-[18px] w-[18px]" style={{ color: t.tone }} />
                </Ring>
              </div>
              <ArrowUpRight className="absolute bottom-3 right-3 h-4 w-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </Spotlight>
          </SmartLink>
        </motion.div>
      ))}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ today's drill */
function TodayDrill({ d }: { d: Overview | null }) {
  const c = d?.challenges.today;
  if (!d) return <Skeleton className="h-[260px]" />;
  if (!c) return null;
  return (
    <Reveal>
      <Tilt max={4} className="h-full rounded-[22px]">
        <Link href={`/challenges/${c.slug}`} className="card group relative block h-full overflow-hidden !rounded-[22px] p-6 sm:p-7">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-warn/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-bad/15 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative inline-flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bad opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bad" /></span>
              <span className="eyebrow !text-bad">Today’s incident drill</span>
              <span className={`pill pill-${c.difficulty}`}>{c.difficulty}</span>
              <span className="flex items-center gap-1 text-[12px] text-faint"><Clock size={12} /> {c.est_minutes} min · {c.steps_total} decisions</span>
            </div>
            <h3 className="mt-4 text-[1.55rem] font-bold leading-tight tracking-[-0.03em]">{c.title}</h3>
            <p className="mt-3 line-clamp-3 max-w-2xl text-[0.96rem] leading-relaxed text-muted">{c.scenario}</p>
            <div className="mt-5 flex flex-wrap gap-1.5">{c.tags.slice(0, 5).map((t) => <span key={t} className="chip !cursor-default !py-1 !text-[11.5px]">{t}</span>)}</div>
            <div className="mt-6 flex items-center gap-4">
              <span className="btn btn-primary">{c.status === "completed" ? "Review it" : c.status === "in_progress" ? `Continue · ${c.steps_done}/${c.steps_total}` : "Start the drill"} <ArrowRight size={16} /></span>
              {c.steps_total ? <div className="bar w-40"><i style={{ width: `${pct(c.steps_done, c.steps_total) * 100}%` }} /></div> : null}
            </div>
          </div>
        </Link>
      </Tilt>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ continue */
function ContinueList({ d }: { d: Overview | null }) {
  if (!d) return <Skeleton className="h-[260px]" />;
  const rows: { href: string; icon: React.ComponentType<{ size?: number }>; title: string; sub: string; p: number }[] = [];
  d.challenges.in_progress.forEach((c) => rows.push({ href: `/challenges/${c.slug}`, icon: Siren, title: c.title, sub: `Drill · ${c.steps_done} of ${c.steps_total} decisions`, p: pct(c.steps_done, c.steps_total) }));
  d.interview.recent.slice(0, 3).forEach((t) => rows.push({ href: `/interview/${t.slug}`, icon: BrainCircuit, title: t.name, sub: `Interview · ${t.known} known, ${t.review} to review`, p: pct(t.known, t.total) }));
  d.lessons.filter((l) => l.at && !l.done).forEach((l) => rows.push({ href: `/core-build/lessons/${l.slug}`, icon: Presentation, title: `Lesson: ${l.title}`, sub: `Slide ${l.at} of ${l.slides}`, p: pct(l.at, l.slides) }));
  d.labs.items.filter((l) => l.done && l.done < l.total).slice(0, 2).forEach((l) => rows.push({ href: `/stack-map#lab-${l.id}`, icon: FlaskConical, title: `${l.kicker}: ${l.name}`, sub: `Lab · ${l.done} of ${l.total} ticked`, p: pct(l.done, l.total) }));
  return (
    <Reveal delay={0.05} className="card flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[1.05rem] font-semibold"><PlayCircle size={18} className="text-brand" /> Jump back in</h3>
        <Link href="/roadmap" className="text-[12.5px] text-faint hover:text-fg">Roadmap →</Link>
      </div>
      {rows.length === 0 ? (
        <div className="mt-6 grid flex-1 place-items-center rounded-2xl border border-dashed border-line-strong p-6 text-center">
          <div>
            <Sparkles className="mx-auto mb-2 text-brand" />
            <p className="font-medium">Nothing in progress yet</p>
            <p className="mt-1 text-[13px] text-muted">Start a drill, mark an interview answer or open a workbook, and it shows up here.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 grid gap-1.5">
          {rows.slice(0, 6).map((r, i) => (
            <li key={i}>
              <SmartLink href={r.href} className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-node">
                <Ring value={r.p} size={40} stroke={4}><r.icon size={15} /></Ring>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{r.title}</span>
                  <span className="block truncate text-[12px] text-faint">{r.sub}</span>
                </span>
                <ArrowRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
              </SmartLink>
            </li>
          ))}
        </ul>
      )}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ core build strip */
function CoreBuildStrip({ d }: { d: Overview | null }) {
  const stages = useMemo(() => {
    // one dot per stage: the stage's main workbook, lit when any workbook of that stage was opened
    const by = new Map<number, NonNullable<Overview>["workbooks"]["items"]>();
    d?.workbooks.items.forEach((w) => by.set(w.stage, [...(by.get(w.stage) ?? []), w]));
    return [...by.entries()].sort(([a], [b]) => a - b).map(([stage, list]) => {
      const main = list.find((w) => !w.companion) ?? list[0];
      return { stage, title: main.title, slug: main.slug, visited: list.some((w) => !!w.visited) };
    });
  }, [d]);
  if (!d) return <Skeleton className="mt-[var(--lp-gap)] h-[190px]" />;
  return (
    <Reveal className="card mt-[var(--lp-gap)] overflow-hidden p-6 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-2"><Hammer size={13} /> Core Build</p>
          <h3 className="mt-1.5 text-[1.3rem] font-bold tracking-[-0.03em]">From written requirements to production, in ten stages</h3>
        </div>
        <Link href="/core-build" className="btn btn-sm">All stages <ArrowRight size={14} /></Link>
      </div>
      <div className="relative mt-7 overflow-x-auto pb-2" data-lenis-prevent>
        <div className="relative flex min-w-[880px] items-start justify-between">
          <div className="absolute left-6 right-6 top-6 h-[2px] bg-line-strong" />
          <motion.div className="absolute left-6 top-6 h-[2px] origin-left bg-gradient-to-r from-brand to-brand-2"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ right: `calc(${100 - (Math.max(1, stages.filter((s) => s.visited).length) / Math.max(1, stages.length)) * 100}% + 1.5rem)` }} />
          {stages.map((s, i) => (
            <Link key={s.stage} href={`/core-build/${s.slug}`} className="group relative z-[1] flex w-[88px] flex-col items-center text-center">
              <motion.span initial={{ scale: 0.6, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 18 }}
                className={clsx("grid h-12 w-12 place-items-center rounded-2xl border text-[15px] font-bold transition-all group-hover:-translate-y-1 group-hover:shadow-glow",
                  s.visited ? "border-transparent bg-gradient-to-br from-brand to-brand-2 text-white shadow-glow" : "border-line-strong bg-surface text-muted")}>
                {s.visited ? <CheckCircle2 size={18} /> : s.stage}
              </motion.span>
              <span className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Stage {s.stage}</span>
              <span className="mt-0.5 text-[12.5px] font-medium leading-tight text-muted group-hover:text-fg">{s.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ activity heatmap */
function Activity({ d }: { d: Overview | null }) {
  const [hover, setHover] = useState<{ day: string; n: number } | null>(null);
  const weeks = useMemo(() => {
    if (!d) return [];
    const today = new Date(d.activity.today + "T00:00:00Z");
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (7 * 25 + today.getUTCDay()));
    const out: { day: string; n: number; future: boolean }[][] = [];
    for (let w = 0; w < 26; w++) {
      const col = [];
      for (let k = 0; k < 7; k++) {
        const dt = new Date(start);
        dt.setUTCDate(start.getUTCDate() + w * 7 + k);
        const key = dt.toISOString().slice(0, 10);
        col.push({ day: key, n: d.activity.days[key] || 0, future: dt > today });
      }
      out.push(col);
    }
    return out;
  }, [d]);
  if (!d) return <Skeleton className="h-[250px]" />;
  const max = Math.max(4, ...Object.values(d.activity.days));
  const level = (n: number) => (n === 0 ? 0 : n < max * 0.25 ? 1 : n < max * 0.5 ? 2 : n < max * 0.75 ? 3 : 4);
  const total = Object.values(d.activity.days).reduce((a, b) => a + b, 0);
  return (
    <Reveal className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-[1.05rem] font-semibold"><Flame size={18} className="text-warn" /> Your activity</h3>
          <p className="mt-1 text-[13px] text-faint">Every tick, answer, mark and workbook save counts.</p>
        </div>
        <div className="flex gap-6 text-right">
          {[["Current streak", d.activity.streak, "days"], ["Best streak", d.activity.best_streak, "days"], ["Active days", d.activity.active_days, "total"]].map(([l, v, u]) => (
            <div key={l as string}><p className="text-[1.5rem] font-bold leading-none tracking-[-0.03em]"><Counter value={v as number} /></p><p className="mt-1 text-[11.5px] text-faint">{l} · {u}</p></div>
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto pb-1" data-lenis-prevent>
        <div className="flex w-max gap-[4px]" onMouseLeave={() => setHover(null)}>
          {weeks.map((col, w) => (
            <div key={w} className="flex flex-col gap-[4px]">
              {col.map((c) => (
                <motion.span key={c.day} initial={{ opacity: 0, scale: 0.4 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                  transition={{ delay: w * 0.012, duration: 0.3 }} onMouseEnter={() => setHover(c)}
                  className={clsx("block h-[15px] w-[15px] rounded-[4px] transition-transform hover:scale-125", c.future && "opacity-0")}
                  style={{ background: level(c.n) === 0 ? "var(--lp-node)" : `color-mix(in oklab, var(--lp-brand) ${[0, 30, 55, 78, 100][level(c.n)]}%, var(--lp-node))`,
                    boxShadow: level(c.n) >= 3 ? "0 0 10px color-mix(in oklab, var(--lp-brand) 60%, transparent)" : undefined }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-faint">
        <AnimatePresence mode="wait">
          <motion.span key={hover?.day ?? "sum"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {hover ? `${hover.n} ${hover.n === 1 ? "action" : "actions"} on ${new Date(hover.day + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : `${total.toLocaleString()} actions in the last six months`}
          </motion.span>
        </AnimatePresence>
        <span className="flex items-center gap-1">Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className="inline-block h-[10px] w-[10px] rounded-[3px]" style={{ background: l === 0 ? "var(--lp-node)" : `color-mix(in oklab, var(--lp-brand) ${[0, 30, 55, 78, 100][l]}%, var(--lp-node))` }} />)} More</span>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ interview categories */
function InterviewMap({ d }: { d: Overview | null }) {
  if (!d) return <Skeleton className="h-[250px]" />;
  return (
    <Reveal delay={0.05} className="card p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[1.05rem] font-semibold"><BrainCircuit size={18} className="text-pink" /> Interview readiness</h3>
        <Link href="/interview" className="text-[12.5px] text-faint hover:text-fg">{d.interview.topics} technologies →</Link>
      </div>
      <ul className="mt-5 grid gap-3.5">
        {d.interview.categories.map((c, i) => (
          <li key={c.name}>
            <Link href={`/interview?category=${encodeURIComponent(c.name)}`} className="group block">
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="font-medium text-muted group-hover:text-fg">{c.name}</span>
                <span className="text-faint">{c.known} / {c.questions.toLocaleString()}</span>
              </div>
              <div className="bar"><motion.i initial={{ width: 0 }} whileInView={{ width: `${Math.max(1.5, pct(c.known, c.questions) * 100)}%` }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 1 }} /></div>
            </Link>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ explore */
const MODULES = {
  Build: [
    { href: "/core-build", icon: Hammer, title: "Core Build", body: "Eleven interactive workbooks that take one application from written requirements to a running production system.", tag: "10 stages" },
    { href: "/path", icon: GitBranch, title: "Learning Path", body: "The order to follow, unit by unit: read, see, do. Every step links to the place it is done.", tag: "15 units" },
    { href: "/stack-map", icon: Layers3, title: "Stack Map & Labs", body: "An interactive system map with deeper simulators (caching, sharding, rate limits), and hands-on labs on your own machine.", tag: "11 labs" },
    { href: "/field-view", icon: Compass, title: "Field View", body: "One request, handoff by handoff, across a whole system. Plays, overlays and what breaks at each boundary.", tag: "Interactive" },
  ],
  Practice: [
    { href: "/challenges", icon: Siren, title: "Incident Drills", body: "A real-feeling outage, debugged one decision at a time. Wrong picks get a hint, right ones get the reasoning.", tag: "40 drills" },
    { href: "/interview", icon: BrainCircuit, title: "Interview Prep", body: "Model answers with real-world examples and follow-ups, in three levels, plus a flashcard mode.", tag: "5,295 Qs" },
    { href: "/roadmap", icon: Workflow, title: "Roadmap", body: "Every stage, unit, lab and system component as one living graph, lit up as you progress.", tag: "Graph" },
  ],
  Library: [
    { href: "/guides", icon: BookOpenText, title: "Guides", body: "The Core Build Starter Guide, the job queue comparison and the full roadmap of planned labs.", tag: "3 guides" },
    { href: "/core-build/lessons/stage-1-requirements", icon: Presentation, title: "Stage 1 lesson", body: "A narrated slide lesson on gathering requirements, with captions and read-aloud.", tag: "85 slides" },
  ],
} as const;

function Explore({ d }: { d: Overview | null }) {
  const [tab, setTab] = useState<keyof typeof MODULES>("Build");
  return (
    <section className="mt-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2"><Trophy size={13} /> Explore</p>
          <h2 className="mt-1.5 text-[1.6rem] font-bold tracking-[-0.035em]">Everything on the platform</h2>
        </div>
        <div className="flex rounded-2xl bg-node p-1 text-[13px] font-medium" role="tablist">
          {(Object.keys(MODULES) as (keyof typeof MODULES)[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("relative rounded-xl px-4 py-2", tab === k ? "text-fg" : "text-faint hover:text-muted")}>
              {tab === k ? <motion.span layoutId="explore-tab" className="absolute inset-0 rounded-xl bg-surface shadow-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
              <span className="relative">{k}</span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} variants={stagger.parent} initial="hidden" animate="show" exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className="grid gap-[var(--lp-gap)] sm:grid-cols-2 xl:grid-cols-4">
          {MODULES[tab].map((m) => (
            <motion.div key={m.href} variants={stagger.child}>
              <Tilt className="h-full rounded-[22px]">
                <SmartLink href={m.href} className="card group flex h-full flex-col !rounded-[22px] p-6">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-glow transition-transform group-hover:scale-110 group-hover:rotate-[-4deg]">
                    <m.icon size={22} />
                  </span>
                  <span className="mt-5 flex items-center gap-2">
                    <span className="text-[1.08rem] font-semibold">{m.title}</span>
                    <span className="chip !cursor-default !py-0.5 !text-[11px]">{m.tag}</span>
                  </span>
                  <span className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{m.body}</span>
                  <span className="mt-5 flex items-center gap-1 text-[13px] font-medium text-brand">Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
                </SmartLink>
              </Tilt>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
      {d ? <p className="mt-6 text-center text-[12.5px] text-faint">{d.guides} guides · {d.labs.items.length} labs · {d.workbooks.total} workbooks · {d.interview.questions.toLocaleString()} interview questions · {d.challenges.total} drills</p> : null}
    </section>
  );
}
