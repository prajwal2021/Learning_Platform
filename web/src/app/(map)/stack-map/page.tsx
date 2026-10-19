"use client";
import { useEffect, useRef, useState } from "react";
import LegacyPage from "@/components/LegacyPage";
import { get } from "@/lib/http";
import { api } from "@/legacy/api";

type Engine = typeof import("@/legacy/stackmap");

export default function StackMap() {
  const [html, setHtml] = useState<string | null>(null);
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    let live = true;
    // The engine touches `document` while it loads, so it is only ever imported in the browser.
    Promise.all([get("/api/stackmap/bootstrap"), api.state.load(), import("@/legacy/stackmap")])
      .then(([data, , mod]) => {
        if (!live) return;
        engine.current = mod;
        mod.initData(data);
        setHtml(data.html);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (html === null || !engine.current) return;
    const mod = engine.current;
    mod.start();
    return () => mod.stop();
  }, [html]);

  return (
    <LegacyPage ready={html !== null}>
      {html === null ? <div aria-busy="true" /> : <div dangerouslySetInnerHTML={{ __html: html }} />}
    </LegacyPage>
  );
}
