"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, BookOpenText, FileText, Map as MapIcon, Rows3 } from "lucide-react";
import { get } from "@/lib/http";
import { PageHeader, Skeleton, Tilt, stagger } from "@/components/ui/fx";

type Item = { slug: string; eyebrow: string; title: string; subtitle: string };
const ICONS = [FileText, Rows3, MapIcon];

export default function Guides() {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => { get<Item[]>("/api/guides").then(setItems).catch(() => setItems([])); }, []);
  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
      <PageHeader eyebrow="Library" icon={<BookOpenText size={13} />} title={<>The <span className="text-gradient">long reads</span>.</>}
        lede="Reference documents to keep open beside the labs: the Core Build Starter Guide, a comparison of job queue stacks, and the roadmap of every planned lab." />
      {items === null ? <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[300px]" />)}</div> : (
        <motion.ul variants={stagger.parent} initial="hidden" animate="show" className="grid gap-[var(--lp-gap)] md:grid-cols-2 xl:grid-cols-3">
          {items.map((g, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <motion.li key={g.slug} variants={stagger.child}>
                <Tilt className="h-full rounded-[24px]">
                  <Link href={`/guides/${g.slug}`} className="card group relative flex h-full min-h-[300px] flex-col overflow-hidden !rounded-[24px] p-7">
                    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-brand/30 to-brand-2/20 blur-3xl transition-opacity group-hover:opacity-100 opacity-60" />
                    <div className="relative mb-auto flex items-start justify-between">
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-glow"><Icon size={24} /></span>
                      <span className="chip !cursor-default">{g.eyebrow}</span>
                    </div>
                    <h2 className="relative mt-10 text-[1.4rem] font-bold leading-tight tracking-[-0.03em]">{g.title}</h2>
                    <p className="relative mt-2 text-[14px] leading-relaxed text-muted">{g.subtitle}</p>
                    <span className="relative mt-6 flex items-center gap-1.5 text-[13.5px] font-medium text-brand">Read <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></span>
                  </Link>
                </Tilt>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </main>
  );
}
