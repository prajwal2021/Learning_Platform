"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Toaster } from "sonner";
import {
  BookOpenText, Boxes, BrainCircuit, ChevronsLeft, ChevronsRight, Compass, GitBranch, Hammer, Home, Layers3, LogOut,
  Map as MapIcon, Menu as MenuIcon, Monitor, Moon, Search, Settings, Siren, Sun, Workflow,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { get, post } from "@/lib/http";
import { applyTheme, readPref, type ThemePref } from "@/lib/theme";
import type { Me } from "@/lib/types";
import CommandPalette from "./CommandPalette";
import s from "./shell.module.css";

/** Pages in another root layout (the legacy pages) are reached with a full page load. */
export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; key: string; hard?: boolean; badge?: string };
export const NAV: { group: string | null; items: NavItem[] }[] = [
  { group: null, items: [
    { href: "/", label: "Home", icon: Home, key: "home" },
    { href: "/roadmap", label: "Roadmap", icon: Workflow, key: "roadmap", badge: "New" },
  ] },
  { group: "Build", items: [
    { href: "/core-build", label: "Core Build", icon: Hammer, key: "core-build" },
    { href: "/path", label: "Learning Path", icon: GitBranch, key: "path", hard: true },
    { href: "/stack-map", label: "Stack Map & Labs", icon: Layers3, key: "stack-map", hard: true },
    { href: "/field-view", label: "Field View", icon: Compass, key: "field-view", hard: true },
  ] },
  { group: "Practice", items: [
    { href: "/interview", label: "Interview Prep", icon: BrainCircuit, key: "interview" },
    { href: "/challenges", label: "Incident Drills", icon: Siren, key: "challenges" },
  ] },
  { group: "Library", items: [
    { href: "/guides", label: "Guides", icon: BookOpenText, key: "guides" },
  ] },
];

const MeContext = createContext<{ me: Me | null; refresh: () => void }>({ me: null, refresh: () => {} });
export const useMe = () => useContext(MeContext);

function activeKey(path: string): string {
  if (path === "/") return "home";
  const seg = path.split("/")[1];
  return seg || "home";
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export function Avatar({ me, className }: { me: Me | null; className?: string }) {
  return (
    <span className={`${s.avatar} ${className ?? ""}`} aria-hidden="true">
      {me?.avatar_url ? <img src={me.avatar_url} alt="" referrerPolicy="no-referrer" /> : initials(me?.name ?? "")}
    </span>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const current = activeKey(path);
  const [me, setMe] = useState<Me | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<ThemePref>("dark");

  const refresh = useCallback(() => {
    get<Me>("/api/auth/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    setTheme(readPref());
    try { setCollapsed(localStorage.getItem("lp-sidebar") === "collapsed"); } catch {}
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault(); setPalette(true);
      }
    };
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => { if (readPref() === "system") applyTheme("system"); };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onSys);
    return () => { window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onSys); };
  }, [refresh]);

  useEffect(() => { setOpen(false); }, [path]);

  function toggleCollapse() {
    const v = !collapsed;
    setCollapsed(v);
    try { localStorage.setItem("lp-sidebar", v ? "collapsed" : "open"); } catch {}
  }
  function pickTheme(t: ThemePref) {
    setTheme(t);
    applyTheme(t);
  }
  async function signOut() {
    await post("/api/auth/logout").catch(() => {});
    location.assign("/login");
  }

  return (
    <MeContext.Provider value={{ me, refresh }}>
      <div className={s.root} data-collapsed={collapsed} data-open={open}>
        <aside className={s.sidebar} aria-label="Main" data-shell>
          <div className={s.brandRow}>
            <Link href="/" className={s.logo} aria-label={`${BRAND.name} home`}><Boxes /></Link>
            <div className={s.brandText}>
              <p className={s.brandName}>{BRAND.name}</p>
              <p className={s.brandSub}>Engineering academy</p>
            </div>
            <button type="button" className={s.collapseBtn} onClick={toggleCollapse} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}>
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </div>

          <button type="button" className={s.search} onClick={() => setPalette(true)} aria-label="Search everything">
            <Search />
            <span className={s.searchText}>Search everything…</span>
            <span className={s.searchText}><kbd className={s.kbd}>⌘K</kbd></span>
          </button>

          <nav className={s.nav}>
            <LayoutGroup id="sidebar">
              {NAV.map((g, gi) => (
                <div key={gi}>
                  {g.group ? <p className={s.group}>{g.group}</p> : null}
                  {g.items.map((it) => {
                    const on = it.key === current;
                    const inner = (
                      <>
                        {on ? <motion.span layoutId="nav-active" className={s.active} transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
                        <it.icon />
                        <span className={s.label}>{it.label}</span>
                        {it.badge ? <span className={s.badge}>{it.badge}</span> : null}
                      </>
                    );
                    return it.hard ? (
                      <a key={it.key} href={it.href} className={s.item} aria-current={on ? "page" : undefined} title={collapsed ? it.label : undefined}>{inner}</a>
                    ) : (
                      <Link key={it.key} href={it.href} className={s.item} aria-current={on ? "page" : undefined} title={collapsed ? it.label : undefined}>{inner}</Link>
                    );
                  })}
                </div>
              ))}
            </LayoutGroup>
          </nav>

          <div className={s.foot}>
            <div className={s.themeRow} role="group" aria-label="Theme">
              {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "Match the system"]] as const).map(([t, Icon, label]) => (
                <button key={t} type="button" className={s.themeBtn} aria-pressed={theme === t} onClick={() => pickTheme(t)} title={label} aria-label={label}>
                  <Icon />
                </button>
              ))}
            </div>
            <Menu.Root>
              <Menu.Trigger asChild>
                <button type="button" className={s.user} aria-label="Account menu">
                  <Avatar me={me} />
                  <span className={s.userText}>
                    <p className={s.userName}>{me?.name ?? " "}</p>
                    <p className={s.userMail}>{me?.email ?? (me ? "Signed in with an access code" : " ")}</p>
                  </span>
                </button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className={s.menu} side="top" align="start" sideOffset={8}>
                  <div className={s.menuHead}>
                    <p className={s.userName}>{me?.name}</p>
                    <p className={s.userMail}>{me?.email ?? "Access code"}</p>
                  </div>
                  <Menu.Item asChild className={s.menuItem}><Link href="/settings"><Settings /> Settings and appearance</Link></Menu.Item>
                  <Menu.Item asChild className={s.menuItem}><Link href="/roadmap"><MapIcon /> My roadmap</Link></Menu.Item>
                  <Menu.Separator className={s.menuSep} />
                  <Menu.Item className={s.menuItem} onSelect={signOut}><LogOut /> Sign out</Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </aside>

        <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />

        <div className={s.main}>
          <div className={s.topbar}>
            <button type="button" className={s.topBtn} onClick={() => setOpen(true)} aria-label="Open the menu"><MenuIcon /></button>
            <Link href="/" className={s.logo} aria-label={`${BRAND.name} home`}><Boxes /></Link>
            <p className={s.brandName}>{BRAND.name}</p>
            <span style={{ flex: 1 }} />
            <button type="button" className={s.topBtn} onClick={() => setPalette(true)} aria-label="Search"><Search /></button>
          </div>
          {children}
        </div>

        <CommandPalette open={palette} onOpenChange={setPalette} onTheme={pickTheme} onSignOut={signOut} />
        <Toaster position="bottom-right" theme={theme === "light" ? "light" : "dark"} richColors closeButton />
      </div>
    </MeContext.Provider>
  );
}
