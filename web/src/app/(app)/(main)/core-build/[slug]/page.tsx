"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Cloud, Download, ExternalLink, Loader2, Maximize2, Minimize2 } from "lucide-react";
import clsx from "clsx";
import { get } from "@/lib/http";
import { currentTheme } from "@/lib/theme";

type Wb = { slug: string; stage: number; title: string; summary: string; companion: boolean; visited: string | null; files: { name: string; href: string; label: string }[] };

export default function Workbook({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [all, setAll] = useState<Wb[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [full, setFull] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null); // read after hydration, so server and client agree
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => { setTheme(currentTheme()); get<Wb[]>("/api/core-build/workbooks").then(setAll).catch(() => {}); }, []);
  // the frame can finish loading before React attaches onLoad, so also check its state, with a fallback
  useEffect(() => {
    setLoaded(false);
    const check = () => { try { if (frame.current?.contentDocument?.readyState === "complete" && frame.current.contentDocument.body?.childElementCount) setLoaded(true); } catch {} };
    const iv = setInterval(check, 250);
    const fallback = setTimeout(() => setLoaded(true), 6000);
    return () => { clearInterval(iv); clearTimeout(fallback); };
  }, [slug]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== "workbook-saved" || e.data.slug !== slug) return;
      setSaved(e.data.ok ? "saved" : "error");
      clearTimeout(t);
      t = setTimeout(() => setSaved("idle"), 2400);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [slug]);
  useEffect(() => {
    document.body.classList.toggle("lp-full", full);
    return () => document.body.classList.remove("lp-full");
  }, [full]);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const i = all.findIndex((w) => w.slug === slug);
  const me = all[i];
  const prev = i > 0 ? all[i - 1] : null, next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const src = useMemo(() => (theme ? `/api/core-build/workbooks/${slug}/page?theme=${theme}` : null), [slug, theme]);

  return (
    <main className={clsx("flex flex-col", full ? "fixed inset-0 z-[60] bg-canvas" : "h-[calc(100dvh-0px)] max-[900px]:h-[calc(100dvh-56px)]")}>
      <div className="glass z-10 flex flex-wrap items-center gap-2 border-x-0 border-t-0 !shadow-none px-3 py-2 sm:px-5">
        <Link href="/core-build" className="btn btn-ghost btn-sm" aria-label="All stages"><ArrowLeft size={15} /><span className="hidden sm:inline">Core Build</span></Link>
        <ChevronRight size={14} className="text-faint" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{me ? <><span className="text-brand">Stage {me.stage}</span> · {me.title}</> : " "}</p>
        </div>
        <AnimatePresence mode="wait">
          <motion.span key={saved} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={clsx("hidden items-center gap-1.5 text-[12px] md:flex", saved === "error" ? "text-bad" : "text-faint")}>
            {saved === "saved" ? <><Check size={13} className="text-ok" /> Saved to your account</> : saved === "error" ? "Could not save, will retry" : <><Cloud size={13} /> Progress syncs automatically</>}
          </motion.span>
        </AnimatePresence>
        {me?.files.map((f) => <a key={f.href} href={f.href} className="btn btn-ghost btn-sm" title={f.label}><Download size={14} /><span className="hidden lg:inline">{f.name}</span></a>)}
        <a href={src ?? undefined} target="_blank" rel="noopener" className="btn btn-ghost btn-sm" title="Open in a new tab"><ExternalLink size={14} /></a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFull(!full)} title={full ? "Exit full screen (Esc)" : "Full screen"}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        {prev ? <Link href={`/core-build/${prev.slug}`} className="btn btn-sm" title={`Stage ${prev.stage}: ${prev.title}`}><ArrowLeft size={14} /></Link> : null}
        {next ? <Link href={`/core-build/${next.slug}`} className="btn btn-sm" title={`Stage ${next.stage}: ${next.title}`}><span className="hidden sm:inline">Stage {next.stage}</span><ArrowRight size={14} /></Link> : null}
      </div>
      <div className="relative flex-1">
        {!loaded ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-faint"><Loader2 className="animate-spin text-brand" /><span className="text-[13px]">Opening the workbook…</span></div>
          </div>
        ) : null}
        {src ? <iframe ref={frame} key={slug} src={src} title={me?.title ?? "Workbook"} data-follow-theme onLoad={() => setLoaded(true)}
          className={clsx("absolute inset-0 h-full w-full border-0 transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")} /> : null}
      </div>
    </main>
  );
}
