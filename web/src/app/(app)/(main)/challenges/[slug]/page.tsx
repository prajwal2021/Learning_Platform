"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookOpen, Check, ChevronRight, Lightbulb, PanelRightClose, PanelRightOpen, RotateCcw, Siren, Target, Terminal, Trophy, X } from "lucide-react";
import clsx from "clsx";
import { get, post } from "@/lib/http";
import type { AnswerResult, Challenge, Concept, StepView } from "@/lib/challenges";
import { celebrate } from "@/lib/confetti";
import { Empty, Skeleton } from "@/components/ui/fx";

const LETTER: Record<string, string> = { a: "A", b: "B", c: "C", d: "D" };

function Play({ slug }: { slug: string }) {
  const [ch, setCh] = useState<Challenge | null>(null);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  // the result of the last correct answer, shown until the learner moves on
  const [solved, setSolved] = useState<(AnswerResult & { correct: true }) | null>(null);
  const [split, setSplit] = useState(true);
  const stepRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      setCh(await get<Challenge>(`/api/challenges/${slug}`));
    } catch (e: any) {
      if (e.status === 404) setMissing(true);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSplit(window.matchMedia("(min-width: 80rem)").matches); }, []);

  if (missing) return <main className="mx-auto max-w-3xl px-6 py-20"><Empty title="That drill does not exist"><Link href="/challenges" className="text-brand">Back to the drills</Link></Empty></main>;
  if (!ch) return <main className="mx-auto max-w-5xl px-6 py-12"><Skeleton className="mb-6 h-40" /><Skeleton className="h-[420px]" /></main>;

  const total = ch.steps_total;
  const cur = ch.steps[ch.current] as StepView | undefined;
  const past = ch.steps.filter((s) => s.index < ch.current);
  // the server moves on at the right answer, but this view keeps the solved step (and its reasoning) until Next
  const solvedStep = solved ? cur : undefined;
  const doneCount = ch.current + (solved ? 1 : 0);

  async function submit() {
    if (!cur || !picked || busy) return;
    setBusy(true);
    try {
      const r = await post<AnswerResult>(`/api/challenges/${slug}/answer`, { step: cur.index, option: picked });
      if (r.correct) {
        setSolved(r);
        setCh({ ...ch!, steps: ch!.steps.map((s) => (s.index === cur.index ? { ...s, correct: r.correct_option, explanation: r.explanation, attempts: r.attempts } : s)) });
        if (r.finished) celebrate();
      } else {
        setCh({
          ...ch!,
          steps: ch!.steps.map((s) => s.index === cur.index
            ? { ...s, wrong: [...new Set([...s.wrong, picked])], hints: { ...(s.hints || {}), [picked]: r.hint } }
            : s),
        });
        setPicked(null);
        setShake((n) => n + 1);
      }
    } catch (e: any) {
      if (e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setSolved(null);
    setPicked(null);
    await load();
    requestAnimationFrame(() => stepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function restart() {
    if (!confirm("Start this drill again? Your answers for it will be cleared.")) return;
    await post(`/api/challenges/${slug}/reset`);
    setSolved(null);
    setPicked(null);
    await load();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-8 sm:px-8 lg:pt-10">
      <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-faint">
        <Link href="/challenges" className="hover:text-fg">Incident drills</Link><ChevronRight size={14} /><span className="truncate text-muted">{ch.title}</span>
      </nav>
      <div className={clsx("grid items-start gap-8", split && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="min-w-0">
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill pill-${ch.difficulty}`}>{ch.difficulty}</span>
              <span className="text-[12.5px] text-faint">About {ch.est_minutes} min · {total} decisions</span>
              <span className="flex-1" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSplit(!split)} aria-pressed={split}>
                {split ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />} {split ? "Hide topics" : "Show topics"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={restart}><RotateCcw size={14} /> Restart</button>
            </div>
            <h1 className="mt-3 text-[clamp(1.7rem,3.4vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.035em]">{ch.title}</h1>
          </header>

          <Progress total={total} current={doneCount} />

          <section className="card relative mb-6 overflow-hidden !rounded-[22px]" aria-label="Scenario">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-2.5">
              <span className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-bad" /><i className="h-2.5 w-2.5 rounded-full bg-warn" /><i className="h-2.5 w-2.5 rounded-full bg-ok" /></span>
              <span className="ml-2 flex items-center gap-1.5 font-mono text-[12px] text-faint"><Terminal size={13} /> incident · sev-2 · on-call: you</span>
              <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-bad"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-bad opacity-60" /><span className="relative h-2 w-2 rounded-full bg-bad" /></span>live</span>
            </div>
            <div className="p-6">
              <p className="eyebrow mb-2 flex items-center gap-2 !text-bad"><Siren size={13} /> The incident</p>
              <p className="text-[15.5px] leading-[1.75]">{ch.scenario}</p>
              <p className="mt-4 flex gap-2 rounded-xl bg-brand-soft px-4 py-3 text-[14px]"><Target size={17} className="mt-0.5 flex-none text-brand" /><span><b>Goal:</b> {ch.goal}</span></p>
            </div>
          </section>

          <div className="grid gap-3">
            {past.map((s) => <Done key={s.index} step={s} />)}
          </div>

          <div className="mt-3">
            {ch.completed && !solved ? (
              <Finished ch={ch} onRestart={restart} />
            ) : solved && solved.finished ? (
              <>
                <Reasoning step={solvedStep!} result={solved} />
                <Finished ch={{ ...ch, takeaway: solved.takeaway }} onRestart={restart} />
              </>
            ) : solved ? (
              <>
                <Reasoning step={solvedStep!} result={solved} />
                <div className="mt-4 flex justify-end"><button type="button" className="btn btn-primary" onClick={next} autoFocus>Next step <ArrowRight size={16} /></button></div>
              </>
            ) : cur ? (
              <motion.section key={cur.index} ref={stepRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card border-glow scroll-mt-6 !rounded-[22px] p-6 sm:p-7" aria-labelledby="q-title">
                <p className="eyebrow">Decision {cur.index + 1} of {total}</p>
                <h2 id="q-title" className="mt-2 text-[1.3rem] font-semibold tracking-[-0.02em]">{cur.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{cur.question}</p>
                <motion.fieldset key={shake} animate={shake ? { x: [0, -10, 9, -6, 4, 0] } : undefined} transition={{ duration: 0.45 }} className="mt-5 grid gap-2.5" disabled={busy}>
                  <legend className="sr-only">Choose one answer</legend>
                  {cur.options.map((o) => {
                    const wrong = cur.wrong.includes(o.id);
                    const on = picked === o.id;
                    return (
                      <div key={o.id}>
                        <label className={clsx("group flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition-all",
                          wrong ? "cursor-not-allowed border-bad/25 bg-bad/5 opacity-70" : on ? "border-brand bg-brand-soft shadow-glow" : "border-line-strong bg-surface hover:-translate-y-0.5 hover:border-brand/50")}>
                          <input type="radio" name="opt" value={o.id} checked={on} disabled={wrong} onChange={() => setPicked(o.id)} className="sr-only" />
                          <span className={clsx("grid h-8 w-8 flex-none place-items-center rounded-xl text-[13px] font-bold transition-colors",
                            wrong ? "bg-bad/15 text-bad" : on ? "bg-brand text-white" : "bg-node text-muted group-hover:text-fg")} aria-hidden="true">
                            {wrong ? <X size={15} /> : LETTER[o.id]}
                          </span>
                          <span className={clsx("pt-1 text-[14.5px] leading-relaxed", wrong && "line-through decoration-bad/40")}>{o.text}</span>
                        </label>
                        <AnimatePresence>
                          {wrong && cur.hints?.[o.id] ? (
                            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="ml-12 mt-2 flex gap-2 rounded-xl bg-warn/10 px-3.5 py-2.5 text-[13.5px] leading-relaxed" role="status">
                              <Lightbulb size={15} className="mt-0.5 flex-none text-warn" /><span><b>Not quite.</b> {cur.hints[o.id]}</span>
                            </motion.p>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </motion.fieldset>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" disabled={!picked || busy} onClick={submit}>Submit answer <ArrowRight size={16} /></button>
                  {cur.wrong.length > 0 ? <span className="text-[13px] text-faint">{cur.wrong.length} wrong so far. Read the hint and pick another option.</span> : null}
                </div>
              </motion.section>
            ) : null}
          </div>
        </div>

        {split ? (
          <aside className="xl:sticky xl:top-6" aria-label="Topics">
            <Topics concepts={ch.concepts} stepKeys={(solvedStep ?? cur)?.concept_keys ?? []} />
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function Progress({ total, current }: { total: number; current: number }) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  return (
    <div className="mb-6" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} aria-label={`${current} of ${total} steps done`}>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="relative h-2 flex-1 overflow-hidden rounded-full bg-node">
            <motion.i className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-brand to-brand-2" initial={false} animate={{ scaleX: i < current ? 1 : 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
            {i === current ? <i className="absolute inset-0 animate-pulse rounded-full bg-brand/30" /> : null}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-faint">{current} of {total} decisions · {pct}%</p>
    </div>
  );
}

function Reasoning({ step, result }: { step: StepView; result: AnswerResult & { correct: true } }) {
  const right = step.options.find((o) => o.id === result.correct_option);
  return (
    <motion.section initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card relative overflow-hidden !rounded-[22px] !border-ok/40 p-6 sm:p-7" aria-live="polite">
      <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-ok/20 blur-3xl" />
      <p className="eyebrow flex items-center gap-2 !text-ok"><Check size={14} /> Decision {step.index + 1} · correct</p>
      <h2 className="mt-2 text-[1.25rem] font-semibold">{step.title}</h2>
      <p className="mt-1.5 text-[14.5px] text-muted">{step.question}</p>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-ok/40 bg-ok/10 p-4">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-ok text-[13px] font-bold text-white">{LETTER[result.correct_option]}</span>
        <span className="pt-1 text-[14.5px]">{right?.text}</span>
      </div>
      <div className="mt-4"><p className="mb-1 font-semibold">Why this is right</p><p className="text-[14.5px] leading-[1.75] text-muted">{result.explanation}</p></div>
      <p className="mt-3 text-[12.5px] text-faint">{result.attempts === 1 ? "First try. Nice." : `${result.attempts} tries.`}</p>
    </motion.section>
  );
}

function Done({ step }: { step: StepView }) {
  const right = step.options.find((o) => o.id === step.correct);
  return (
    <details className="card group !rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-ok/15 text-ok"><Check size={14} /></span>
        <span className="flex-1 text-[14.5px] font-medium">Decision {step.index + 1}: {step.title}</span>
        <ChevronRight size={16} className="text-faint transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-line px-4 pb-5 pt-4 sm:pl-14">
        <p className="text-[14px] text-muted">{step.question}</p>
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-ok/10 p-3"><span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-ok text-[12px] font-bold text-white">{step.correct ? LETTER[step.correct] : ""}</span><span className="pt-0.5 text-[14px]">{right?.text}</span></div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted"><b className="text-fg">Why:</b> {step.explanation}</p>
      </div>
    </details>
  );
}

function Finished({ ch, onRestart }: { ch: Challenge; onRestart: () => void }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card border-glow relative mt-4 overflow-hidden !rounded-[24px] p-7 text-center sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_0%,var(--lp-brand-soft),transparent)]" />
      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
        className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-glow"><Trophy size={28} /></motion.span>
      <p className="eyebrow relative mt-5">Incident resolved</p>
      <h2 className="relative mt-2 text-[1.6rem] font-bold tracking-[-0.03em]">What to remember</h2>
      <p className="relative mx-auto mt-3 max-w-2xl text-[15px] leading-[1.75] text-muted">{ch.takeaway}</p>
      <div className="relative mt-7 flex flex-wrap justify-center gap-3">
        <Link className="btn btn-primary" href="/challenges">More drills <ArrowRight size={16} /></Link>
        <button type="button" className="btn" onClick={onRestart}><RotateCcw size={15} /> Do it again</button>
      </div>
    </motion.section>
  );
}

/** The glossary beside the question: what each technology or idea in the current step is, in a few words. */
function Topics({ concepts, stepKeys }: { concepts: Concept[]; stepKeys: string[] }) {
  const [tab, setTab] = useState<"step" | "all">("step");
  const here = concepts.filter((c) => stepKeys.includes(c.key));
  const list = tab === "step" ? here : concepts;
  return (
    <div className="card !rounded-[22px] p-5">
      <h2 className="flex items-center gap-2 font-semibold"><BookOpen size={17} className="text-brand" /> Topics</h2>
      <div className="mt-3 flex rounded-xl bg-node p-1 text-[12.5px] font-medium" role="group" aria-label="Which topics to show">
        {([["step", "In this question"], ["all", `All so far (${concepts.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={clsx("relative flex-1 rounded-lg px-2 py-1.5", tab === k ? "text-fg" : "text-faint")}>
            {tab === k ? <motion.span layoutId="topic-tab" className="absolute inset-0 rounded-lg bg-surface shadow-soft" /> : null}<span className="relative">{l}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? <p className="mt-4 text-[13px] text-faint">Nothing new to explain in this question.</p> : (
        <dl className="mt-4 grid max-h-[65vh] gap-2.5 overflow-y-auto pr-1" data-lenis-prevent>
          <AnimatePresence initial={false}>
            {list.map((c) => (
              <motion.div layout key={c.key} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className={clsx("rounded-xl border p-3.5", stepKeys.includes(c.key) ? "border-brand/40 bg-brand-soft" : "border-line")}>
                <dt className="text-[13.5px] font-semibold">{c.name}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-muted">{c.summary}</dd>
                {c.used_here ? <dd className="mt-2 border-t border-line pt-2 text-[12.5px] leading-relaxed text-muted"><b className="text-fg">In this problem:</b> {c.used_here}</dd> : null}
              </motion.div>
            ))}
          </AnimatePresence>
        </dl>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <Play slug={slug} />;
}
