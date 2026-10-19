"use client";
import { useEffect } from "react";
import AppShell from "@/components/shell/AppShell";

/** A legacy interactive page (its own markup, CSS and script) inside the platform's shell.
 *  The page's links to "/" meant the Learning Path, which now lives at /path. */
export default function LegacyPage({ children, ready }: { children: React.ReactNode; ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    const fix = () => document.querySelectorAll<HTMLAnchorElement>('a[href="/"]').forEach((a) => {
      if (!a.closest("[data-shell]")) a.setAttribute("href", "/path");
    });
    fix();
    const mo = new MutationObserver(fix);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ready]);
  return <AppShell>{children}</AppShell>;
}
