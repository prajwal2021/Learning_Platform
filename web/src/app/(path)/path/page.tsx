"use client";
import { useEffect, useState } from "react";
import LegacyPage from "@/components/LegacyPage";
import { get, put } from "@/lib/http";
import { start } from "@/legacy/path";

export default function LearningPath() {
  const [html, setHtml] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    Promise.all([get("/api/path"), get("/api/state/path")])
      .then(([page, state]) => {
        if (!live) return;
        setDone(state.done || {});
        setHtml(page.html);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // once the markup is in the document, attach the page's behaviour to it
  useEffect(() => {
    if (html === null) return;
    start(done, (d: Record<string, boolean>) => put("/api/state/path/done", { value: d }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  return (
    <LegacyPage ready={html !== null}>
      {html === null ? <div className="lp" aria-busy="true" /> : <div dangerouslySetInnerHTML={{ __html: html }} />}
    </LegacyPage>
  );
}
