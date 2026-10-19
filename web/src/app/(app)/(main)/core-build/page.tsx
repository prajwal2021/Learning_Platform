"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Download, GitMerge, Hammer, PlayCircle, Presentation } from "lucide-react";
import clsx from "clsx";
import { get } from "@/lib/http";
import { PageHeader, Reveal, Skeleton, Spotlight } from "@/components/ui/fx";

type Wb = { slug: string; stage: number; title: string; summary: string; companion: boolean; visited: string | null; saved: number;
  files: { name: string; label: string; href: string }[] };
type Lesson = { slug: string; stage: number; title: string; subtitle: string; slides: number; cover: string | null; at: number; done: boolean };

export default function CoreBuild() {
  const [wbs, setWbs] = useState<Wb[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  useEffect(() => {
    get<Wb[]>("/api/core-build/workbooks").then(setWbs).catch(() => setWbs([]));
    get<Lesson[]>("/api/core-build/lessons").then(setLessons).catch(() => {});
  }, []);
  const stages = useMemo(() => {
    const m = new Map<number, Wb[]>();
    (wbs ?? []).forEach((w) => m.set(w.stage, [...(m.get(w.stage) ?? []), w]));
    return [...m.entries()].sort(([a], [b]) => a - b);
  }, [wbs]);
  const visited = (wbs ?? []).filter((w) => w.visited).length;
  const lesson = lessons[0];

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
      <PageHeader eyebrow="Core Build" icon={<Hammer size={13} />}
        title={<>One application, <span className="text-gradient">ten stages</span>, start to production.</>}
        lede="The sequence an experienced developer follows: gather the requirements, pick the stack, settle versions, structure and build the backend, connect the front end, design the database, prepare for load, test and deploy, then operate it. Each stage has an interactive workbook with worked examples, exercises, labs, quizzes and templates. Your answers save to your account.">
        <span className="chip !cursor-default"><CheckCircle2 size={13} /> {visited} of {wbs?.length ?? 11} workbooks opened</span>
        <Link href="/guides/core-build-starter-guide" className="btn btn-sm">Read the Starter Guide <ArrowRight size={14} /></Link>
      </PageHeader>

      {lesson ? (
        <Reveal className="mb-12">
          <Link href={`/core-build/lessons/${lesson.slug}`} className="card group relative grid overflow-hidden !rounded-[26px] md:grid-cols-[1.1fr_1fr]">
            <div className="relative aspect-video overflow-hidden bg-node md:aspect-auto">
              {lesson.cover ? <img src={lesson.cover} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" /> : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent md:bg-gradient-to-r" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="relative grid h-16 w-16 place-items-center rounded-full bg-white/90 text-black shadow-2xl transition-transform group-hover:scale-110">
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-white/60" /><PlayCircle size={30} className="relative" />
                </span>
              </span>
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-9">
              <p className="eyebrow flex items-center gap-2"><Presentation size={13} /> Stage {lesson.stage} lesson · {lesson.slides} slides</p>
              <h2 className="mt-2 text-[1.5rem] font-bold tracking-[-0.03em]">{lesson.title}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{lesson.subtitle}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="btn btn-primary btn-sm">{lesson.done ? "Watch again" : lesson.at ? `Resume at slide ${lesson.at}` : "Start the lesson"} <ArrowRight size={14} /></span>
                <div className="bar flex-1"><i style={{ width: `${lesson.done ? 100 : (lesson.at / Math.max(1, lesson.slides)) * 100}%` }} /></div>
              </div>
            </div>
          </Link>
        </Reveal>
      ) : null}

      {wbs === null ? <div className="grid gap-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div> : (
        <ol className="relative">
          <div className="absolute bottom-6 left-[27px] top-6 w-[2px] bg-gradient-to-b from-brand via-brand-2 to-pink opacity-40 md:left-1/2 md:-translate-x-1/2" aria-hidden />
          {stages.map(([stage, list], i) => {
            const main = list.find((w) => !w.companion) ?? list[0];
            const extra = list.filter((w) => w !== main);
            const seen = list.some((w) => w.visited);
            const left = i % 2 === 0;
            return (
              <li key={stage} className="relative mb-8 md:grid md:grid-cols-2 md:gap-14">
                <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  className={clsx("absolute left-0 top-5 z-[1] grid h-14 w-14 place-items-center rounded-2xl border text-[1.15rem] font-bold md:left-1/2 md:-translate-x-1/2",
                    seen ? "border-transparent bg-gradient-to-br from-brand to-brand-2 text-white shadow-glow" : "border-line-strong bg-surface text-muted")}>
                  {seen ? <CheckCircle2 size={22} /> : stage}
                </motion.span>
                <motion.div initial={{ opacity: 0, x: left ? -30 : 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className={clsx("ml-[76px] md:ml-0", left ? "md:col-start-1 md:pr-2" : "md:col-start-2 md:pl-2")}>
                  <Spotlight className="card !rounded-[22px] p-6">
                    <p className="eyebrow">Stage {stage} of 10</p>
                    <Link href={`/core-build/${main.slug}`} className="group mt-1.5 flex items-center gap-2">
                      <h3 className="text-[1.3rem] font-bold tracking-[-0.025em] group-hover:text-brand">{main.title}</h3>
                      <ArrowRight size={17} className="text-faint transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                    </Link>
                    <p className="mt-2 line-clamp-4 text-[14px] leading-relaxed text-muted">{main.summary}</p>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Link href={`/core-build/${main.slug}`} className="btn btn-primary btn-sm">{main.visited ? "Continue the workbook" : "Open the workbook"}</Link>
                      {extra.map((w) => <Link key={w.slug} href={`/core-build/${w.slug}`} className="btn btn-sm"><GitMerge size={14} /> {w.title}</Link>)}
                      {lessons.filter((l) => l.stage === stage).map((l) => <Link key={l.slug} href={`/core-build/lessons/${l.slug}`} className="btn btn-sm"><Presentation size={14} /> Lesson</Link>)}
                      {list.flatMap((w) => w.files).map((f) => <a key={f.href} href={f.href} className="btn btn-ghost btn-sm" title={f.label}><Download size={14} /> {f.name}</a>)}
                    </div>
                    {main.visited ? <p className="mt-4 text-[12px] text-faint">Last opened {new Date(main.visited).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {main.saved} saved {main.saved === 1 ? "entry" : "entries"}</p> : null}
                  </Spotlight>
                </motion.div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
