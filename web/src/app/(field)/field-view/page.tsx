"use client";
import { useEffect, useRef, useState } from "react";
import LegacyPage from "@/components/LegacyPage";
import { get } from "@/lib/http";

type Field = { html: string; scripts: string[] };

export default function FieldView() {
  const [f, setF] = useState<Field | null>(null);
  const ran = useRef(false);

  useEffect(() => { get<Field>("/api/field").then(setF).catch(() => {}); }, []);

  // The page's scripts expect their markup to exist and to run in order, so run them once the markup is in.
  useEffect(() => {
    if (!f || ran.current) return;
    ran.current = true;
    const added: HTMLScriptElement[] = [];
    for (const code of f.scripts) {
      const el = document.createElement("script");
      el.textContent = code;
      document.body.appendChild(el);
      added.push(el);
    }
    return () => added.forEach((el) => el.remove());
  }, [f]);

  return (
    <LegacyPage ready={!!f}>
      {f ? <div dangerouslySetInnerHTML={{ __html: f.html }} /> : <div aria-busy="true" />}
    </LegacyPage>
  );
}
