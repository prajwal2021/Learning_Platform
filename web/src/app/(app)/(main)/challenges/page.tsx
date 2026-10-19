"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Clock, Siren, Timer } from "lucide-react";
import clsx from "clsx";
import { get } from "@/lib/http";
import type { ChallengeCard } from "@/lib/challenges";
import { Counter, Empty, PageHeader, Ring, Skeleton, Spotlight } from "@/components/ui/fx";

const STATUS = { new: "Not started", in_progress: "In progress", completed: "Solved" } as const;
type Filter = "all" | "new" | "in_progress" | "completed";

export default function Challenges() {
  const [cards, setCards] = useState<ChallengeCard[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [diff, setDiff] = useState<string>("all");
  const [tag, setTag] = useState<string>("");

  useEffect(() => { get<ChallengeCard[]>("/api/challenges").then(setCards).catch(() => setCards([])); }, []);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    cards?.forEach((c) => c.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
  }, [cards]);
  const shown = (cards ?? []).filter((c) => (filter === "all" || c.status === filter) && (diff === "all" || c.difficulty === diff) && (!tag || c.tags.includes(tag)));
  const done = cards?.filter((c) => c.status === "completed").length ?? 0;
  const going = cards?.filter((c) => c.status === "in_progress").length ?? 0;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
      <PageHeader eyebrow="Incident drills" icon={<Siren size={13} />}
        title={<>Debug production <span className="text-gradient">before it is yours</span>.</>}
        lede="A short incident, and you work it one decision at a time, the way a careful on-call engineer would. A wrong pick gets a hint. A right one gets the reasoning. A side panel explains every technology as you meet it." />

      {cards === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-[240px]" />)}</div>
      ) : cards.length === 0 ? <Empty title="No drills yet" icon={<Siren size={20} />} /> : (
        <>
          <section className="mb-8 grid gap-[var(--lp-gap)] sm:grid-cols-3">
            <div className="card flex items-center gap-4 p-[var(--lp-pad)]">
              <Ring value={done / cards.length} size={60}><CheckCircle2 size={20} className="text-ok" /></Ring>
              <div><p className="text-[1.8rem] font-bold leading-none tracking-[-0.04em]"><Counter value={done} /> <span className="text-[1rem] font-medium text-faint">/ {cards.length}</span></p><p className="mt-1 text-[12.5px] text-muted">drills solved</p></div>
            </div>
            <div className="card p-[var(--lp-pad)]"><p className="text-[1.8rem] font-bold leading-none tracking-[-0.04em]"><Counter value={going} /></p><p className="mt-1.5 text-[12.5px] text-muted">in progress</p></div>
            <div className="card p-[var(--lp-pad)]"><p className="text-[1.8rem] font-bold leading-none tracking-[-0.04em]"><Counter value={cards.reduce((n, c) => n + c.est_minutes, 0)} /> <span className="text-[1rem] font-medium text-faint">min</span></p><p className="mt-1.5 text-[12.5px] text-muted">of practice in the bank</p></div>
          </section>

          <div className="glass sticky top-3 z-20 mb-8 flex flex-col gap-3 rounded-2xl p-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "new", "in_progress", "completed"] as Filter[]).map((f) => (
                <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : STATUS[f]}</button>
              ))}
              <span className="mx-1 w-px bg-line" />
              {["all", "easy", "medium", "hard"].map((d) => <button key={d} className="chip capitalize" aria-pressed={diff === d} onClick={() => setDiff(d)}>{d === "all" ? "Any difficulty" : d}</button>)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => <button key={t} className="chip !py-1 !text-[11.5px]" aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>#{t}</button>)}
            </div>
          </div>

          {shown.length === 0 ? <Empty title="No drills match these filters" /> : (
            <ul className="grid gap-[var(--lp-gap)] md:grid-cols-2 xl:grid-cols-3">
              {shown.map((c, i) => (
                <motion.li key={c.slug} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 9) * 0.03 }}>
                  <Link href={`/challenges/${c.slug}`} className="block h-full">
                    <Spotlight className={clsx("card group flex h-full flex-col overflow-hidden p-6 transition-transform hover:-translate-y-1", c.status === "completed" && "!border-ok/30")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`pill pill-${c.difficulty}`}>{c.difficulty}</span>
                        <span className="flex items-center gap-1 text-[12px] text-faint"><Timer size={12} /> {c.est_minutes} min · {c.steps_total} steps</span>
                      </div>
                      <h3 className="mt-4 text-[1.12rem] font-semibold leading-snug tracking-[-0.015em]">{c.title}</h3>
                      <p className="mt-2 line-clamp-3 flex-1 text-[13.5px] leading-relaxed text-muted">{c.scenario}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5">{c.tags.slice(0, 3).map((t) => <span key={t} className="rounded-md bg-node px-2 py-0.5 text-[11px] text-faint">{t}</span>)}</div>
                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                        <span className={clsx("flex items-center gap-1.5 text-[12.5px] font-medium", c.status === "completed" ? "text-ok" : c.status === "in_progress" ? "text-brand" : "text-faint")}>
                          {c.status === "completed" ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                          {c.status === "in_progress" ? `${c.steps_done} of ${c.steps_total} steps` : STATUS[c.status]}
                        </span>
                        <ArrowRight size={16} className="text-faint transition-transform group-hover:translate-x-1 group-hover:text-fg" />
                      </div>
                      {c.steps_total > 0 ? <div className="absolute inset-x-0 bottom-0 h-[3px] bg-node"><i className="block h-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${(c.steps_done / c.steps_total) * 100}%` }} /></div> : null}
                    </Spotlight>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
