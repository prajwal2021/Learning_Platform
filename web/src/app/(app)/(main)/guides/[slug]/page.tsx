"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import { ChevronRight, Clock, List, Search } from "lucide-react";
import clsx from "clsx";
import { get } from "@/lib/http";
import { Empty, Skeleton } from "@/components/ui/fx";

type Guide = {
  slug: string; eyebrow: string; title: string; subtitle: string; source: string; html: string;
  toc: { level: number; id: string; text: string }[];
};

export default function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [g, setG] = useState<Guide | null>(null);
  const [missing, setMissing] = useState(false);
  const [active, setActive] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const docRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });

  useEffect(() => {
    get<Guide>(`/api/guides/${slug}`).then(setG).catch((e) => e.status === 404 && setMissing(true));
  }, [slug]);

  // after the text is in the page, honour a #section in the address, and follow the reader through the headings
  useEffect(() => {
    if (!g) return;
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    const heads = g.toc.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "0px 0px -70% 0px" });
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [g]);

  const minutes = useMemo(() => (g ? Math.max(1, Math.round(g.html.replace(/<[^>]+>/g, " ").split(/\s+/).length / 230)) : 0), [g]);
  const toc = useMemo(() => {
    if (!g) return [];
    const base = g.toc.filter((t) => t.level === 1 || g.toc.length < 40);
    const f = filter.trim().toLowerCase();
    return f ? g.toc.filter((t) => t.text.toLowerCase().includes(f)) : base;
  }, [g, filter]);

  if (missing) return <main className="mx-auto max-w-3xl px-6 py-20"><Empty title="That guide does not exist"><Link href="/guides" className="text-brand">Back to the guides</Link></Empty></main>;
  if (!g) return <main className="mx-auto max-w-5xl px-6 py-12"><Skeleton className="mb-6 h-32" /><Skeleton className="h-[600px]" /></main>;

  return (
    <>
      <motion.div className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-brand via-brand-2 to-pink" style={{ scaleX: progress }} />
      <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
        <nav className="mb-6 flex items-center gap-1.5 text-[13px] text-faint">
          <Link href="/guides" className="hover:text-fg">Guides</Link><ChevronRight size={14} /><span className="truncate text-muted">{g.title}</span>
        </nav>
        <header className="card relative mb-10 overflow-hidden !rounded-[28px] p-8 sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_360px_at_90%_0%,var(--lp-brand-soft),transparent_70%)]" />
          <p className="eyebrow relative">{g.eyebrow}</p>
          <h1 className="relative mt-3 max-w-4xl text-[clamp(2rem,4.6vw,3.5rem)] font-bold leading-[1.04] tracking-[-0.045em]">{g.title}</h1>
          <p className="relative mt-4 max-w-2xl text-[1.1rem] leading-relaxed text-muted">{g.subtitle}</p>
          <p className="relative mt-6 flex flex-wrap gap-2">
            <span className="chip !cursor-default"><Clock size={13} /> About {minutes} min read</span>
            {g.toc.length ? <span className="chip !cursor-default"><List size={13} /> {g.toc.filter((t) => t.level === 1).length || g.toc.length} sections</span> : null}
          </p>
        </header>

        <div className={clsx("grid items-start gap-10", g.toc.length > 1 && "lg:grid-cols-[270px_minmax(0,1fr)]")}>
          {g.toc.length > 1 ? (
            <aside className="lg:sticky lg:top-6">
              <button type="button" className="btn mb-3 w-full lg:hidden" onClick={() => setTocOpen(!tocOpen)}><List size={15} /> Contents</button>
              <nav aria-label="Contents" className={clsx("card max-h-[calc(100vh-3rem)] overflow-y-auto !rounded-2xl p-3", !tocOpen && "hidden lg:block")} data-lenis-prevent>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                  <input className="input !py-1.5 !pl-8 text-[13px]" placeholder="Find a section" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
                <ol className="grid gap-0.5">
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`} onClick={() => setTocOpen(false)} className={clsx("relative block rounded-lg px-3 py-1.5 text-[13px] leading-snug transition-colors",
                        t.level === 2 && "pl-6 text-[12.5px]", active === t.id ? "bg-brand-soft font-medium text-fg" : "text-muted hover:bg-node hover:text-fg")}>
                        {active === t.id ? <motion.span layoutId="toc-dot" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand" /> : null}
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>
          ) : null}
          <div className="card min-w-0 !rounded-[24px] px-6 py-8 sm:px-12 sm:py-12">
            <article ref={docRef} className="prose-doc mx-auto max-w-[780px]" dangerouslySetInnerHTML={{ __html: g.html }} />
            <p className="mx-auto mt-12 max-w-[780px] border-t border-line pt-5 text-[12.5px] text-faint">From the file “{g.source}”.</p>
          </div>
        </div>
      </main>
    </>
  );
}
