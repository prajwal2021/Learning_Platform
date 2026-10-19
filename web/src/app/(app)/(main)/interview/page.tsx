"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BrainCircuit, Search, Sparkles, TriangleAlert } from "lucide-react";
import { get } from "@/lib/http";
import type { TopicCard } from "@/lib/interview";
import { Counter, Empty, PageHeader, Ring, Skeleton, Spotlight } from "@/components/ui/fx";

const CAT_HUE: Record<string, string> = {
  Languages: "var(--lp-brand)", Frontend: "var(--lp-brand-2)", Backend: "var(--lp-brand-3)", Databases: "var(--lp-amber)",
  "DevOps and cloud": "var(--lp-pink)", "Data and AI": "#a78bfa", Mobile: "#22d3ee", "Computer science": "#f97316",
};
type Sort = "default" | "name" | "progress" | "size";

function Interview() {
  const params = useSearchParams();
  const [topics, setTopics] = useState<TopicCard[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(params.get("category") || "All");
  const [sort, setSort] = useState<Sort>("default");

  useEffect(() => { get<TopicCard[]>("/api/interview/topics").then(setTopics).catch(() => setTopics([])); }, []);

  const total = (t: TopicCard) => t.counts.basic + t.counts.intermediate + t.counts.advanced;
  const categories = useMemo(() => ["All", ...Array.from(new Set((topics ?? []).map((t) => t.category)))], [topics]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (topics ?? []).filter((t) => (cat === "All" || t.category === cat) && t.name.toLowerCase().includes(s));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "progress") list.sort((a, b) => b.known / total(b) - a.known / total(a));
    if (sort === "size") list.sort((a, b) => total(b) - total(a));
    return list;
  }, [topics, q, cat, sort]);
  const groups = sort === "default"
    ? categories.slice(1).map((c) => [c, shown.filter((t) => t.category === c)] as const).filter(([, l]) => l.length)
    : [["Results", shown] as const];
  const all = (topics ?? []).reduce((n, t) => n + total(t), 0);
  const known = (topics ?? []).reduce((n, t) => n + t.known, 0);

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
      <PageHeader eyebrow="Interview prep" icon={<BrainCircuit size={13} />}
        title={<>Walk into the interview <span className="text-gradient">already knowing</span>.</>}
        lede="Model answers for the technologies you are likely to be asked about, in three levels each. Every answer comes with how it shows up in real work, a snippet where it helps, and the follow-up an interviewer tends to ask next.">
        <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
          <TriangleAlert size={14} /> Written with AI and not yet reviewed line by line. Use <b>Report a problem</b> on any answer that looks wrong.
        </div>
      </PageHeader>

      {topics === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-[150px]" />)}</div>
      ) : (
        <>
          <section className="mb-8 grid gap-[var(--lp-gap)] sm:grid-cols-3">
            {[["Technologies", topics.length], ["Questions", all], ["You know", known]].map(([l, v], i) => (
              <div key={l as string} className="card relative overflow-hidden p-[var(--lp-pad)]">
                <p className="text-[12.5px] text-muted">{l}</p>
                <p className="mt-1.5 text-[2rem] font-bold leading-none tracking-[-0.04em]"><Counter value={v as number} /></p>
                {i === 2 ? <div className="bar mt-3"><i style={{ width: `${all ? (known / all) * 100 : 0}%` }} /></div> : null}
              </div>
            ))}
          </section>

          <div className="glass sticky top-3 z-20 mb-8 flex flex-col gap-3 rounded-2xl p-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:max-w-sm">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input type="search" className="input !pl-10" placeholder="Search technologies, e.g. react" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search technologies" />
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="Category">
              {categories.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
            </div>
            <select className="input !w-auto !py-2 text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="default">By category</option><option value="name">A to Z</option><option value="progress">Most progress</option><option value="size">Most questions</option>
            </select>
          </div>

          {groups.length === 0 ? <Empty title="Nothing matches" icon={<Search size={20} />}>Try a shorter search, or another category.</Empty> : (
            <AnimatePresence mode="popLayout">
              {groups.map(([name, list]) => (
                <motion.section key={name} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-10">
                  {sort === "default" ? (
                    <h2 className="mb-4 flex items-center gap-2.5 text-[1.05rem] font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_HUE[name] ?? "var(--lp-brand)", boxShadow: `0 0 12px ${CAT_HUE[name] ?? "var(--lp-brand)"}` }} />
                      {name} <span className="text-[13px] font-normal text-faint">{list.length}</span>
                    </h2>
                  ) : null}
                  <ul className="grid gap-[var(--lp-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {list.map((t, i) => {
                      const n = total(t), hue = CAT_HUE[t.category] ?? "var(--lp-brand)";
                      return (
                        <motion.li key={t.slug} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
                          <Link href={`/interview/${t.slug}`} className="block h-full">
                            <Spotlight className="card group h-full p-5 transition-transform hover:-translate-y-0.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-[1.02rem] font-semibold">{t.name}</p>
                                  <p className="mt-0.5 text-[12px] text-faint">{t.category}</p>
                                </div>
                                <Ring value={n ? t.known / n : 0} size={46} stroke={4}>
                                  <span className="text-[11px] font-bold" style={{ color: hue }}>{n ? Math.round((t.known / n) * 100) : 0}%</span>
                                </Ring>
                              </div>
                              <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
                                {(["basic", "intermediate", "advanced"] as const).map((lv) => (
                                  <div key={lv} className="rounded-lg bg-node px-1 py-1.5">
                                    <p className="text-[14px] font-semibold">{t.counts[lv]}</p>
                                    <p className="text-[10.5px] capitalize text-faint">{lv === "intermediate" ? "mid" : lv}</p>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-3 flex items-center justify-between text-[12px] text-faint">
                                <span>{t.known ? `${t.known} of ${n} known` : `${n} questions`}</span>
                                <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                              </p>
                            </Spotlight>
                          </Link>
                        </motion.li>
                      );
                    })}
                  </ul>
                </motion.section>
              ))}
            </AnimatePresence>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-faint"><Sparkles size={13} /> Tip: press <kbd className="kbd">⌘K</kbd> to search inside every question.</p>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <Suspense><Interview /></Suspense>;
}
