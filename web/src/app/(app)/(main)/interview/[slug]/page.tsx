"use client";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  BookmarkPlus, Check, ChevronDown, ChevronLeft, ChevronRight, Flag, Layers, ListChecks, RotateCcw, Search, Shuffle, Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { get, post, put } from "@/lib/http";
import { LEVELS, LEVEL_LABEL, type Level, type Mark, type Question, type TopicDetail } from "@/lib/interview";
import { Empty, Skeleton } from "@/components/ui/fx";
import Code from "@/components/ui/Code";
import { celebrate } from "@/lib/confetti";

type View = "all" | "review" | "unmarked" | "known";

/** Text with `code` spans shown as inline code (the bank writes identifiers between backticks). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return <>{parts.map((p, i) => p.length > 2 && p.startsWith("`") && p.endsWith("`")
    ? <code key={i} className="rounded-md bg-node px-1.5 py-0.5 font-mono text-[0.86em] text-brand">{p.slice(1, -1)}</code>
    : <span key={i}>{p}</span>)}</>;
}

function Topic({ slug }: { slug: string }) {
  const params = useSearchParams();
  const [t, setT] = useState<TopicDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [level, setLevel] = useState<Level>("basic");
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState(params.get("q") || "");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"list" | "cards">("list");

  useEffect(() => {
    get<TopicDetail>(`/api/interview/topics/${slug}`).then(setT).catch((e) => e.status === 404 && setMissing(true));
    const fromUrl = params.get("level") as Level | null;
    if (fromUrl && LEVELS.includes(fromUrl)) { setLevel(fromUrl); return; }
    try {
      const saved = sessionStorage.getItem("iq.level." + slug) as Level | null;
      if (saved && LEVELS.includes(saved)) setLevel(saved);
    } catch {}
  }, [slug, params]);

  const byLevel = useMemo(() => {
    const m: Record<Level, Question[]> = { basic: [], intermediate: [], advanced: [] };
    t?.questions.forEach((x) => m[x.level].push(x));
    return m;
  }, [t]);

  const setMark = useCallback((id: string, m: Mark | null) => {
    setT((cur) => {
      if (!cur) return cur;
      const next = { ...cur.marks };
      if (m) next[id] = m; else delete next[id];
      return { ...cur, marks: next };
    });
    put(`/api/interview/topics/${slug}/marks`, { question_id: id, mark: m }).catch(() => toast.error("Could not save that mark. Check your connection."));
  }, [slug]);

  if (missing) return <main className="mx-auto max-w-3xl px-6 py-20"><Empty title="No questions for that technology yet"><Link className="text-brand" href="/interview">Back to all technologies</Link></Empty></main>;
  if (!t) return <main className="mx-auto max-w-5xl px-6 py-12"><Skeleton className="mb-6 h-24" /><Skeleton className="mb-3 h-14" /><Skeleton className="h-[480px]" /></main>;

  const marks = t.marks;
  const s = q.trim().toLowerCase();
  const list = byLevel[level].filter((x) => {
    const m = marks[x.id];
    if (view === "review" && m !== "review") return false;
    if (view === "known" && m !== "known") return false;
    if (view === "unmarked" && m) return false;
    return !s || x.question.toLowerCase().includes(s) || x.answer.toLowerCase().includes(s);
  });
  const known = byLevel[level].filter((x) => marks[x.id] === "known").length;
  const allKnown = t.questions.filter((x) => marks[x.id] === "known").length;

  function pickLevel(l: Level) {
    setLevel(l);
    try { sessionStorage.setItem("iq.level." + slug, l); } catch {}
  }
  const allOpen = list.length > 0 && list.every((x) => open[x.id]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
      <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-faint">
        <Link href="/interview" className="hover:text-fg">Interview prep</Link><ChevronRight size={14} /><span className="text-muted">{t.name}</span>
      </nav>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{t.category}</p>
          <h1 className="mt-2 text-[clamp(2rem,4vw,3rem)] font-bold leading-none tracking-[-0.04em]">{t.name}</h1>
          <p className="mt-3 text-[14px] text-muted">{t.questions.length} questions · {allKnown} known · {Object.values(marks).filter((v) => v === "review").length} to review</p>
        </div>
        <div className="flex rounded-2xl bg-node p-1 text-[13px] font-medium" role="tablist" aria-label="Mode">
          {([["list", "Study list", ListChecks], ["cards", "Flashcards", Layers]] as const).map(([m, label, Icon]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={clsx("relative flex items-center gap-2 rounded-xl px-4 py-2", mode === m ? "text-fg" : "text-faint hover:text-muted")}>
              {mode === m ? <motion.span layoutId="iq-mode" className="absolute inset-0 rounded-xl bg-surface shadow-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
              <Icon size={15} className="relative" /><span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Level">
        {LEVELS.map((l) => {
          const n = byLevel[l].length, k = byLevel[l].filter((x) => marks[x.id] === "known").length;
          return (
            <button key={l} type="button" role="tab" aria-selected={level === l} disabled={!n} onClick={() => pickLevel(l)}
              className={clsx("card relative overflow-hidden !rounded-2xl p-4 text-left transition-all disabled:opacity-40", level === l ? "!border-brand/50 shadow-glow" : "hover:-translate-y-0.5")}>
              <span className="flex items-center justify-between"><span className="font-semibold">{LEVEL_LABEL[l]}</span><span className="text-[12px] text-faint">{k} / {n}</span></span>
              <span className="bar mt-3 block"><i style={{ width: `${n ? (k / n) * 100 : 0}%` }} /></span>
            </button>
          );
        })}
      </div>

      {mode === "cards" ? (
        <Flashcards key={level + view} list={list.length ? list : byLevel[level]} marks={marks} onMark={setMark} levelLabel={LEVEL_LABEL[level]} />
      ) : (
        <>
          <div className="glass sticky top-3 z-20 mb-4 flex flex-col gap-2.5 rounded-2xl p-2.5 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input type="search" className="input !py-2 !pl-10" aria-label="Search these questions" placeholder="Search questions and answers" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {([["all", "All"], ["unmarked", "Not marked"], ["review", "Review later"], ["known", "Known"]] as [View, string][]).map(([v, label]) => (
                <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
              ))}
              <button type="button" className="chip" onClick={() => setOpen(Object.fromEntries(list.map((x) => [x.id, !allOpen])))}>{allOpen ? "Collapse all" : "Expand all"}</button>
            </div>
          </div>
          <p className="mb-4 text-[12.5px] text-faint">{known} of {byLevel[level].length} {LEVEL_LABEL[level].toLowerCase()} questions marked known · showing {list.length}</p>
          <ol className="grid gap-2.5">
            {list.map((x, i) => (
              <QuestionItem key={x.id} n={i + 1} x={x} mark={marks[x.id]} open={!!open[x.id]}
                onToggle={() => setOpen((o) => ({ ...o, [x.id]: !o[x.id] }))} onMark={(m) => setMark(x.id, m)} />
            ))}
          </ol>
          {list.length === 0 ? <Empty title="No questions match" icon={<Search size={20} />}>Clear the search or pick another filter.</Empty> : null}
        </>
      )}
    </main>
  );
}

function Answer({ x }: { x: Question }) {
  return (
    <div className="grid gap-4">
      <p className="whitespace-pre-line text-[15px] leading-[1.75]"><Rich text={x.answer} /></p>
      {x.real_world ? (
        <div className="rounded-xl border-l-[3px] border-brand bg-brand-soft/60 px-4 py-3">
          <p className="eyebrow mb-1">In practice</p>
          <p className="text-[14px] leading-relaxed text-muted"><Rich text={x.real_world} /></p>
        </div>
      ) : null}
      {x.code ? <Code code={x.code} lang={x.code_lang} /> : null}
      {x.follow_up ? <p className="text-[14px] text-muted"><b className="text-fg">Interviewer may ask next:</b> <Rich text={x.follow_up} /></p> : null}
    </div>
  );
}

function QuestionItem({ n, x, mark, open, onToggle, onMark }: {
  n: number; x: Question; mark?: Mark; open: boolean; onToggle: () => void; onMark: (m: Mark | null) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  async function report() {
    await post(`/api/interview/questions/${x.id}/flag`, { note }).catch(() => {});
    setSent(true); setReporting(false); setNote("");
    toast.success("Thanks. The answer is flagged for a fix.");
  }

  return (
    <li className={clsx("card overflow-hidden !rounded-2xl transition-colors", open && "!border-line-strong", mark === "known" && "!border-ok/30", mark === "review" && "!border-warn/30")}>
      <button type="button" className="flex w-full items-start gap-3.5 p-4 text-left sm:p-5" aria-expanded={open} onClick={onToggle}>
        <span className={clsx("grid h-7 w-7 flex-none place-items-center rounded-lg text-[12px] font-bold", mark === "known" ? "bg-ok/15 text-ok" : mark === "review" ? "bg-warn/15 text-warn" : "bg-node text-faint")}>
          {mark === "known" ? <Check size={14} /> : n}
        </span>
        <span className="flex-1 pt-0.5 text-[15px] font-medium leading-snug"><Rich text={x.question} /></span>
        {mark ? <span className={clsx("pill mt-0.5 hidden sm:inline-flex", mark === "known" ? "pill-easy" : "pill-medium")}>{mark === "known" ? "Known" : "Review"}</span> : null}
        <ChevronDown size={18} className={clsx("mt-1 flex-none text-faint transition-transform duration-300", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
            <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5 sm:pl-[3.9rem]">
              <Answer x={x} />
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" className={clsx("btn btn-sm", mark === "known" && "!border-ok/50 !bg-ok/15 !text-ok")} aria-pressed={mark === "known"} onClick={() => onMark(mark === "known" ? null : "known")}><Check size={14} /> I know this</button>
                <button type="button" className={clsx("btn btn-sm", mark === "review" && "!border-warn/50 !bg-warn/15 !text-warn")} aria-pressed={mark === "review"} onClick={() => onMark(mark === "review" ? null : "review")}><BookmarkPlus size={14} /> Review later</button>
                <span className="flex-1" />
                {sent ? <span className="text-[12.5px] text-faint">Thanks, reported.</span> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReporting(!reporting)}><Flag size={13} /> Report a problem</button>}
              </div>
              {reporting ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor={`n-${x.id}`} className="sr-only">What is wrong?</label>
                  <textarea id={`n-${x.id}`} rows={2} maxLength={1000} className="input flex-1" placeholder="What is wrong or unclear? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" className="btn btn-primary btn-sm self-end" onClick={report}>Send</button>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

/** Flashcards: the question on the front, the model answer on the back. Space flips, arrows move, K and R mark. */
function Flashcards({ list: source, marks, onMark, levelLabel }: { list: Question[]; marks: Record<string, Mark>; onMark: (id: string, m: Mark | null) => void; levelLabel: string }) {
  const [order, setOrder] = useState(() => source.map((_, i) => i));
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [dir, setDir] = useState(1);
  const list = order.map((k) => source[k]).filter(Boolean);
  const x = list[i];
  const seen = list.filter((q) => marks[q.id]).length;

  const go = useCallback((d: number) => {
    setDir(d); setFlip(false);
    setI((v) => Math.max(0, Math.min(list.length - 1, v + d)));
  }, [list.length]);
  const markAndNext = useCallback((m: Mark) => {
    if (!x) return;
    onMark(x.id, m);
    if (i === list.length - 1) { if (m === "known") celebrate(); toast.success(`Deck finished: ${levelLabel}`); }
    else go(1);
  }, [x, i, list.length, onMark, go, levelLabel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === " ") { e.preventDefault(); setFlip((f) => !f); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "k") markAndNext("known");
      else if (e.key.toLowerCase() === "r") markAndNext("review");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, markAndNext]);

  if (!x) return <Empty title="No cards in this level" icon={<Layers size={20} />} />;
  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between text-[13px] text-faint">
        <span>Card {i + 1} of {list.length} · {seen} marked</span>
        <span className="flex gap-1.5">
          <button className="btn btn-ghost btn-sm" onClick={() => { setOrder((o) => [...o].sort(() => Math.random() - 0.5)); setI(0); setFlip(false); }}><Shuffle size={14} /> Shuffle</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setOrder(source.map((_, k) => k)); setI(0); setFlip(false); }}><RotateCcw size={14} /> Restart</button>
        </span>
      </div>
      <div className="bar mb-6"><i style={{ width: `${((i + 1) / list.length) * 100}%` }} /></div>
      <div className="relative [perspective:1600px]">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={x.id} custom={dir} initial={{ opacity: 0, x: dir * 60, rotate: dir * 2 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: -dir * 60, rotate: -dir * 2 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <motion.div onClick={() => setFlip((f) => !f)} animate={{ rotateY: flip ? 180 : 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative min-h-[380px] cursor-pointer [transform-style:preserve-3d]" role="button" aria-label={flip ? "Show the question" : "Show the answer"} tabIndex={0}>
              <div className="card border-glow absolute inset-0 flex flex-col !rounded-[26px] p-8 [backface-visibility:hidden] sm:p-10">
                <p className="eyebrow flex items-center gap-2"><Sparkles size={13} /> {levelLabel} · question</p>
                <p className="my-auto py-6 text-center text-[clamp(1.25rem,2.6vw,1.75rem)] font-semibold leading-snug tracking-[-0.02em]"><Rich text={x.question} /></p>
                <p className="text-center text-[12.5px] text-faint">Click or press <kbd className="kbd">Space</kbd> to reveal the answer</p>
              </div>
              <div className="card absolute inset-0 overflow-y-auto !rounded-[26px] p-7 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-9" data-lenis-prevent>
                <p className="eyebrow mb-3">Model answer</p>
                <Answer x={x} />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button className="btn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous card"><ChevronLeft size={16} /></button>
        <button className="btn !border-warn/40 !text-warn" onClick={() => markAndNext("review")}><BookmarkPlus size={15} /> Review later <kbd className="kbd">R</kbd></button>
        <button className="btn btn-primary" onClick={() => markAndNext("known")}><Check size={15} /> I knew it <kbd className="kbd !border-white/30 !bg-white/10 !text-white">K</kbd></button>
        <button className="btn" onClick={() => go(1)} disabled={i === list.length - 1} aria-label="Next card"><ChevronRight size={16} /></button>
      </div>
    </section>
  );
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <Suspense><Topic slug={slug} /></Suspense>;
}
