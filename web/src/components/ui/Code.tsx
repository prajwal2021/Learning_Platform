"use client";
import { useMemo, useState } from "react";
import { highlight } from "sugar-high";
import { Check, Copy } from "lucide-react";

/** A code snippet with syntax colours (sugar-high works for most C-like languages and Python) and a copy button. */
export default function Code({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlight(code), [code]);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="flex items-center gap-2 font-mono text-[11.5px] text-faint">
          <span className="flex gap-1"><i className="h-2.5 w-2.5 rounded-full bg-bad/60" /><i className="h-2.5 w-2.5 rounded-full bg-warn/60" /><i className="h-2.5 w-2.5 rounded-full bg-ok/60" /></span>
          {lang || "code"}
        </span>
        <button type="button" onClick={copy} className="btn btn-ghost btn-sm !py-1 !text-[12px]">{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
      </div>
      <pre className="code-block" tabIndex={0}><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  );
}
