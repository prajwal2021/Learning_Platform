"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  BookOpen, BrainCircuit, CornerDownLeft, FlaskConical, GitBranch, Hammer, HelpCircle, LogOut, Monitor, Moon, Presentation,
  Search, Siren, Sun,
} from "lucide-react";
import { get } from "@/lib/http";
import type { ThemePref } from "@/lib/theme";
import type { SearchHit } from "@/lib/types";
import { NAV } from "./AppShell";
import s from "./shell.module.css";

const ICON: Record<string, React.ComponentType> = {
  topic: BrainCircuit, question: HelpCircle, challenge: Siren, lab: FlaskConical, workbook: Hammer, lesson: Presentation,
  guide: BookOpen, unit: GitBranch,
};
const GROUP: Record<string, string> = {
  topic: "Interview topics", question: "Interview questions", challenge: "Incident drills", lab: "Labs", workbook: "Core Build",
  lesson: "Core Build", guide: "Guides", unit: "Learning Path",
};
// pages that live in another root layout need a full load
const HARD = /^\/(path|stack-map|field-view)(\/|#|$)/;

export default function CommandPalette({ open, onOpenChange, onTheme, onSignOut }: {
  open: boolean; onOpenChange: (v: boolean) => void; onTheme: (t: ThemePref) => void; onSignOut: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) { setQ(""); setHits([]); }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      get<SearchHit[]>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => { if (n === seq.current) setHits(r); })
        .catch(() => {})
        .finally(() => { if (n === seq.current) setBusy(false); });
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  function go(href: string) {
    onOpenChange(false);
    if (HARD.test(href) || HARD.test(location.pathname)) location.assign(href);
    else router.push(href);
  }

  const groups = hits.reduce<Record<string, SearchHit[]>>((m, h) => {
    (m[GROUP[h.type] ?? "Results"] ||= []).push(h);
    return m;
  }, {});

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Search everything" contentClassName={s.palette}
      overlayClassName={s.paletteOverlay} shouldFilter={false} loop>
      <Search className={s.paletteIcon} />
      <Command.Input value={q} onValueChange={setQ} placeholder="Search topics, questions, labs, workbooks, drills…" />
      <Command.List>
        {q.trim().length >= 2 && !busy && hits.length === 0 ? <Command.Empty>Nothing matches “{q.trim()}”.</Command.Empty> : null}
        {Object.entries(groups).map(([g, list]) => (
          <Command.Group key={g} heading={g}>
            {list.map((h, i) => {
              const Icon = ICON[h.type] ?? Search;
              return (
                <Command.Item key={h.href + i} value={h.href + i} onSelect={() => go(h.href)}>
                  <span className={s.hitIcon}><Icon /></span>
                  <span style={{ minWidth: 0 }}><p className={s.hitTitle}>{h.title}</p><p className={s.hitSub}>{h.subtitle}</p></span>
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
        {q.trim().length < 2 ? (
          <>
            <Command.Group heading="Go to">
              {NAV.flatMap((g) => g.items).map((it) => (
                <Command.Item key={it.key} value={"nav-" + it.key} onSelect={() => go(it.href)}>
                  <span className={s.hitIcon}><it.icon /></span>
                  <span><p className={s.hitTitle}>{it.label}</p></span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Actions">
              <Command.Item value="theme-light" onSelect={() => { onTheme("light"); onOpenChange(false); }}><span className={s.hitIcon}><Sun /></span><p className={s.hitTitle}>Light theme</p></Command.Item>
              <Command.Item value="theme-dark" onSelect={() => { onTheme("dark"); onOpenChange(false); }}><span className={s.hitIcon}><Moon /></span><p className={s.hitTitle}>Dark theme</p></Command.Item>
              <Command.Item value="theme-system" onSelect={() => { onTheme("system"); onOpenChange(false); }}><span className={s.hitIcon}><Monitor /></span><p className={s.hitTitle}>Match the system theme</p></Command.Item>
              <Command.Item value="signout" onSelect={onSignOut}><span className={s.hitIcon}><LogOut /></span><p className={s.hitTitle}>Sign out</p></Command.Item>
            </Command.Group>
          </>
        ) : null}
      </Command.List>
      <div className={s.paletteFoot}>
        <span><CornerDownLeft size={12} style={{ verticalAlign: -2 }} /> open</span>
        <span>↑ ↓ move</span>
        <span>esc close</span>
        <span style={{ marginLeft: "auto" }}>{busy ? "Searching…" : `${hits.length || ""}`}</span>
      </div>
    </Command.Dialog>
  );
}
