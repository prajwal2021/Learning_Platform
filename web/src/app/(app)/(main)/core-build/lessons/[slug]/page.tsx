"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Captions, ChevronLeft, ChevronRight, ListVideo, Pause, Play, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { get, put } from "@/lib/http";
import { celebrate } from "@/lib/confetti";
import { Skeleton } from "@/components/ui/fx";

type Slide = { n: number; chapter: string; narration: string; image: string };
type Lesson = { slug: string; stage: number; title: string; subtitle: string; slides: Slide[]; at: number; done: boolean };

export default function LessonPlayer({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [l, setL] = useState<Lesson | null>(null);
  const [i, setI] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [voice, setVoice] = useState(false);   // read the narration aloud
  const [auto, setAuto] = useState(false);     // move on when the narration ends
  const [chapters, setChapters] = useState(true);
  const saveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const speaking = useRef(false);

  useEffect(() => {
    get<Lesson>(`/api/core-build/lessons/${slug}`).then((d) => {
      setL(d);
      const at = d.slides.findIndex((s) => s.n === d.at);
      if (at > 0 && !d.done) setI(at);
    }).catch(() => {});
    setChapters(matchMedia("(min-width: 1100px)").matches);
    return () => { try { speechSynthesis.cancel(); } catch {} };
  }, [slug]);

  const slide = l?.slides[i];
  const total = l?.slides.length ?? 0;
  const groups = useMemo(() => {
    const out: { chapter: string; start: number; end: number }[] = [];
    l?.slides.forEach((s, k) => {
      const last = out[out.length - 1];
      if (last && last.chapter === s.chapter) last.end = k; else out.push({ chapter: s.chapter, start: k, end: k });
    });
    return out;
  }, [l]);

  const save = useCallback((k: number) => {
    if (!l) return;
    clearTimeout(saveT.current);
    const done = k === l.slides.length - 1;
    saveT.current = setTimeout(() => {
      put(`/api/state/lesson/${slug}`, { value: { slide: l.slides[k].n, done: done || l.done } }).catch(() => {});
    }, 500);
    if (done && !l.done) { setL({ ...l, done: true }); celebrate(); }
  }, [l, slug]);

  const go = useCallback((k: number) => {
    if (!l) return;
    const n = Math.max(0, Math.min(l.slides.length - 1, k));
    setI(n);
    save(n);
  }, [l, save]);

  // read aloud with the browser's own speech engine
  useEffect(() => {
    if (!slide) return;
    try { speechSynthesis.cancel(); } catch {}
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(slide.narration);
    u.rate = 1.02;
    const en = speechSynthesis.getVoices().find((v) => /en-(US|GB)/.test(v.lang) && /Natural|Samantha|Google|Daniel/i.test(v.name));
    if (en) u.voice = en;
    u.onend = () => { speaking.current = false; if (auto) setTimeout(() => go(i + 1), 450); };
    speaking.current = true;
    speechSynthesis.speak(u);
  }, [slide, voice, auto, go, i]);

  // without the voice, autoplay moves on after a reading-speed pause
  useEffect(() => {
    if (!auto || voice || !slide) return;
    const ms = Math.max(3500, slide.narration.split(/\s+/).length * 330);
    const t = setTimeout(() => go(i + 1), ms);
    return () => clearTimeout(t);
  }, [auto, voice, slide, go, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
      if (e.key === " ") { e.preventDefault(); setAuto((a) => !a); }
      if (e.key.toLowerCase() === "c") setCaptions((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, i]);

  // keep the next slide image warm
  useEffect(() => { if (l && l.slides[i + 1]) { const im = new Image(); im.src = l.slides[i + 1].image; } }, [l, i]);

  if (!l || !slide) return <main className="mx-auto max-w-6xl px-6 py-12"><Skeleton className="aspect-video w-full" /></main>;

  return (
    <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/core-build" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Core Build</Link>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Stage {l.stage} lesson</p>
          <h1 className="truncate text-[1.25rem] font-bold tracking-[-0.025em]">{l.title}</h1>
        </div>
        <button className="btn btn-sm" onClick={() => setChapters(!chapters)} aria-pressed={chapters}><ListVideo size={15} /> Chapters</button>
      </div>

      <div className={clsx("grid items-start gap-6", chapters && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
        <div className="min-w-0">
          <div className="card relative overflow-hidden !rounded-[22px] bg-black">
            <div className="relative aspect-video">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.img key={slide.n} src={slide.image} alt={`Slide ${slide.n}`} initial={{ opacity: 0, scale: 1.015 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }} className="absolute inset-0 h-full w-full object-contain" />
              </AnimatePresence>
              <button className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize" onClick={() => go(i - 1)} aria-label="Previous slide" />
              <button className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize" onClick={() => go(i + 1)} aria-label="Next slide" />
            </div>
            <AnimatePresence initial={false}>
              {captions ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/10 bg-[#0b0d18]">
                  <AnimatePresence mode="wait">
                    <motion.p key={slide.n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}
                      className="mx-auto min-h-[5.5rem] max-w-4xl px-6 py-4 text-center text-[clamp(.92rem,1.3vw,1.08rem)] leading-relaxed text-white/90 sm:px-10">{slide.narration}</motion.p>
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="flex items-center gap-2 border-t border-white/10 bg-[#0b0d18] px-3 py-2.5 text-white">
              <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide"><ChevronLeft size={18} /></button>
              <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => setAuto(!auto)} aria-label={auto ? "Pause" : "Play"}>{auto ? <Pause size={18} /> : <Play size={18} />}</button>
              <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => go(i + 1)} disabled={i === total - 1} aria-label="Next slide"><ChevronRight size={18} /></button>
              <div className="group relative mx-2 h-1.5 flex-1 cursor-pointer rounded-full bg-white/15"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); go(Math.round(((e.clientX - r.left) / r.width) * (total - 1))); }}>
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${((i + 1) / total) * 100}%` }} />
                {groups.map((g) => <span key={g.start} className="absolute top-0 h-full w-[2px] bg-black/60" style={{ left: `${(g.start / total) * 100}%` }} />)}
              </div>
              <span className="w-16 text-right font-mono text-[12px] text-white/60">{i + 1}/{total}</span>
              <button className={clsx("rounded-lg p-2 hover:bg-white/10", voice && "text-brand-2")} onClick={() => setVoice(!voice)} aria-pressed={voice} title="Read the narration aloud">{voice ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
              <button className={clsx("rounded-lg p-2 hover:bg-white/10", captions && "text-brand-2")} onClick={() => setCaptions(!captions)} aria-pressed={captions} title="Captions (C)"><Captions size={18} /></button>
            </div>
          </div>
          <div className="mt-5 grid gap-1 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="eyebrow">{slide.chapter}</p>
              <p className="mt-1 text-[13px] text-faint">← → to move · Space to autoplay · C for captions · the speaker reads the narration aloud</p>
            </div>
            {l.done ? <span className="pill pill-easy">Completed</span> : null}
          </div>
        </div>

        {chapters ? (
          <aside className="card max-h-[calc(100vh-7rem)] overflow-y-auto !rounded-[22px] p-3 lg:sticky lg:top-6" data-lenis-prevent>
            <p className="px-2 pb-2 pt-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-faint">{groups.length} chapters</p>
            <ol className="grid gap-1">
              {groups.map((g, k) => {
                const on = i >= g.start && i <= g.end;
                const doneCh = i > g.end || l.done;
                return (
                  <li key={g.start}>
                    <button onClick={() => go(g.start)} className={clsx("flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors", on ? "bg-brand-soft" : "hover:bg-node")}>
                      <span className={clsx("grid h-7 w-7 flex-none place-items-center rounded-lg text-[12px] font-bold", on ? "bg-brand text-white" : doneCh ? "bg-ok/15 text-ok" : "bg-node text-faint")}>{k + 1}</span>
                      <span className="min-w-0">
                        <span className={clsx("block text-[13.5px] font-medium leading-snug", on ? "text-fg" : "text-muted")}>{g.chapter}</span>
                        <span className="text-[11.5px] text-faint">{g.end - g.start + 1} slides</span>
                        {on ? <span className="bar mt-1.5 block"><i style={{ width: `${((i - g.start + 1) / (g.end - g.start + 1)) * 100}%` }} /></span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
