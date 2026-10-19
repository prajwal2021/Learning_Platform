"use client";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Background, BackgroundVariant, BaseEdge, Controls, getBezierPath, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, useViewport,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight, Boxes, CheckCircle2, Circle, CircleDashed, Crosshair, FlaskConical, GitBranch, Hammer, Loader, Lock, Workflow, X } from "lucide-react";
import clsx from "clsx";
import { get } from "@/lib/http";
import { Skeleton } from "@/components/ui/fx";

type Status = "done" | "in_progress" | "available" | "planned";
type RNode = {
  id: string; lane: "core" | "path" | "labs" | "system"; order: number; kicker: string; label: string; blurb: string; status: Status;
  progress: [number, number]; href: string | null; time?: string; children?: { label: string; href: string; kind: string; visited: boolean }[];
};
type REdge = { id: string; source: string; target: string; kind: "next" | "uses" | "covers" };
type Graph = { lanes: { id: string; label: string; blurb: string }[]; nodes: RNode[]; edges: REdge[] };

const LANE = {
  core: { y: 0, color: "var(--lp-brand)", icon: Hammer },
  path: { y: 330, color: "var(--lp-brand-2)", icon: GitBranch },
  labs: { y: 660, color: "var(--lp-pink)", icon: FlaskConical },
  system: { y: 1080, color: "var(--lp-amber)", icon: Boxes },
} as const;
const STATUS: Record<Status, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  done: { label: "Done", icon: CheckCircle2, tone: "var(--lp-brand-3)" },
  in_progress: { label: "In progress", icon: Loader, tone: "var(--lp-brand)" },
  available: { label: "Ready to start", icon: Circle, tone: "var(--lp-muted)" },
  planned: { label: "Planned", icon: CircleDashed, tone: "var(--lp-faint)" },
};
const W = 236, COL = 270;
// the minimap draws SVG fill attributes, which cannot read CSS variables
const MINI = { core: "#8b7dff", path: "#38bdf8", labs: "#f472b6", system: "#fbbf24" } as const;

/* ------------------------------------------------------------------ layout */
function layout(g: Graph) {
  const pos = new Map<string, { x: number; y: number }>();
  const units = g.nodes.filter((n) => n.lane === "path").sort((a, b) => a.order - b.order);
  const width = units.length * COL;
  units.forEach((n, i) => pos.set(n.id, { x: i * COL, y: LANE.path.y }));
  const stages = g.nodes.filter((n) => n.lane === "core").sort((a, b) => a.order - b.order);
  stages.forEach((n, i) => pos.set(n.id, { x: (i * (width - W)) / Math.max(1, stages.length - 1), y: LANE.core.y }));
  // labs sit under the unit that uses them first, in two staggered rows so neighbours never overlap
  const firstUnit = new Map<string, number>();
  g.edges.filter((e) => e.kind === "uses").forEach((e) => {
    const ui = units.findIndex((u) => u.id === e.source);
    if (!firstUnit.has(e.target) || ui < firstUnit.get(e.target)!) firstUnit.set(e.target, ui);
  });
  const labs = g.nodes.filter((n) => n.lane === "labs").sort((a, b) => (firstUnit.get(a.id) ?? 99) - (firstUnit.get(b.id) ?? 99) || a.order - b.order);
  const step = Math.max(W / 2 + 14, (width - W) / Math.max(1, labs.length - 1));
  labs.forEach((n, i) => pos.set(n.id, { x: i * step, y: LANE.labs.y + (i % 2) * 150 }));
  const comps = g.nodes.filter((n) => n.lane === "system").sort((a, b) => a.order - b.order);
  comps.forEach((n, i) => pos.set(n.id, { x: (i * (Math.max(width, labs.length * step) - W)) / Math.max(1, comps.length - 1), y: LANE.system.y }));
  return { pos, width: Math.max(width, labs.length * step) };
}

/* ------------------------------------------------------------------ node */
type NodeData = RNode & { dim: boolean; hot: boolean };
const RoadNode = memo(function RoadNode({ data, selected }: NodeProps<Node<NodeData>>) {
  const lane = LANE[data.lane];
  const st = STATUS[data.status];
  const [d, t] = data.progress;
  const p = t ? d / t : data.status === "done" ? 1 : 0;
  const r = 15, c = 2 * Math.PI * r;
  return (
    <div className={clsx("group relative w-[236px] rounded-[18px] border p-3.5 transition-all duration-300",
      data.dim ? "opacity-[0.18] saturate-0" : "opacity-100",
      data.status === "planned" ? "border-dashed border-line-strong bg-surface/70" : "border-line-strong bg-surface",
      (selected || data.hot) && "!opacity-100 scale-[1.04]")}
      style={{ boxShadow: selected || data.hot ? `0 0 0 1.5px ${lane.color}, 0 18px 50px -14px ${lane.color}` : data.status === "in_progress" ? `0 0 0 1px ${lane.color}, 0 10px 34px -16px ${lane.color}` : "var(--lp-shadow)" }}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle type="target" id="l" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle type="source" id="r" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-transparent" />
      {data.status === "in_progress" ? <span className="absolute -right-1 -top-1 flex h-3 w-3"><span className="absolute h-full w-full animate-ping rounded-full opacity-60" style={{ background: lane.color }} /><span className="relative h-3 w-3 rounded-full" style={{ background: lane.color }} /></span> : null}
      <div className="flex items-start gap-3">
        <div className="relative grid h-10 w-10 flex-none place-items-center">
          <svg width="40" height="40" className="absolute -rotate-90">
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--lp-node)" strokeWidth="3.5" />
            <circle cx="20" cy="20" r={r} fill="none" stroke={data.status === "done" ? "var(--lp-brand-3)" : lane.color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset 1s" }} />
          </svg>
          {data.status === "planned" ? <Lock size={13} className="text-faint" /> : data.status === "done" ? <CheckCircle2 size={15} className="text-ok" /> : <lane.icon size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: lane.color }}>{data.kicker}</p>
          <p className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-fg">{data.label}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: st.tone }}><st.icon size={11} /> {st.label}{t ? ` · ${d}/${t}` : ""}</p>
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ edges */
function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style }: EdgeProps<Edge<{ kind: REdge["kind"]; hot: boolean; dim: boolean; color: string }>>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  const k = data?.kind, hot = data?.hot, dim = data?.dim, color = data?.color ?? "var(--lp-line-strong)";
  return (
    <>
      <BaseEdge id={id} path={path} style={{ ...style, stroke: hot ? color : k === "covers" ? "var(--lp-line)" : "var(--lp-line-strong)", strokeWidth: hot ? 2.6 : k === "next" ? 2 : 1.2, opacity: dim ? 0.08 : 1, transition: "opacity .3s, stroke .3s" }} />
      {(hot || k === "next") && !dim ? (
        <path d={path} fill="none" stroke={color} strokeWidth={hot ? 2.6 : 2} strokeDasharray="4 12" strokeLinecap="round" style={{ animation: "dash 1.1s linear infinite", filter: `drop-shadow(0 0 4px ${color})` }} />
      ) : null}
    </>
  );
}

const nodeTypes = { road: RoadNode };
const edgeTypes = { flow: FlowEdge };

/* ------------------------------------------------------------------ page */
function Roadmap() {
  const [g, setG] = useState<Graph | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [lanes, setLanes] = useState<Record<string, boolean>>({ core: true, path: true, labs: true, system: true });
  const [statusF, setStatusF] = useState<Status | "all">("all");
  const rf = useReactFlow();

  useEffect(() => { get<Graph>("/api/roadmap").then(setG).catch(() => {}); }, []);

  const { pos, width } = useMemo(() => (g ? layout(g) : { pos: new Map(), width: 0 }), [g]);
  const byId = useMemo(() => new Map((g?.nodes ?? []).map((n) => [n.id, n])), [g]);

  // what lights up: the focused node, everything it leads to and everything that leads to it
  const focus = hover ?? sel;
  const lit = useMemo(() => {
    if (!g || !focus) return null;
    const out = new Set([focus]);
    const walk = (id: string, dir: "down" | "up", depth: number) => {
      if (depth > 3) return;
      g.edges.forEach((e) => {
        const a = dir === "down" ? e.source : e.target, b = dir === "down" ? e.target : e.source;
        if (a === id && !out.has(b) && !(e.kind === "next" && depth > 0)) { out.add(b); walk(b, dir, depth + 1); }
      });
    };
    walk(focus, "down", 0); walk(focus, "up", 0);
    return out;
  }, [g, focus]);

  const nodes: Node<NodeData>[] = useMemo(() => (g?.nodes ?? [])
    .filter((n) => lanes[n.lane] && (statusF === "all" || n.status === statusF))
    .map((n) => ({ id: n.id, type: "road", position: pos.get(n.id) ?? { x: 0, y: 0 }, data: { ...n, dim: !!lit && !lit.has(n.id), hot: !!lit && lit.has(n.id) && n.id !== focus }, selected: sel === n.id })),
    [g, pos, lanes, statusF, lit, focus, sel]);
  const shown = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges: Edge[] = useMemo(() => (g?.edges ?? []).filter((e) => shown.has(e.source) && shown.has(e.target)).map((e) => {
    const sameLane = byId.get(e.source)?.lane === byId.get(e.target)?.lane;
    const hot = !!lit && lit.has(e.source) && lit.has(e.target);
    return { id: e.id, source: e.source, target: e.target, type: "flow", sourceHandle: sameLane ? "r" : undefined, targetHandle: sameLane ? "l" : undefined,
      data: { kind: e.kind, hot, dim: !!lit && !hot, color: LANE[byId.get(e.source)?.lane ?? "core"].color } };
  }), [g, shown, lit, byId]);

  const selected = sel ? byId.get(sel) : null;
  const next = useMemo(() => g?.nodes.find((n) => n.lane === "path" && n.status === "in_progress") ?? g?.nodes.find((n) => n.lane === "path" && n.status === "available"), [g]);
  const flyTo = useCallback((id: string) => {
    const p = pos.get(id);
    if (!p) return;
    setSel(id);
    rf.setCenter(p.x + W / 2, p.y + 50, { zoom: 1.15, duration: 900 });
  }, [pos, rf]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { done: 0, in_progress: 0, available: 0, planned: 0 };
    g?.nodes.forEach((n) => c[n.status]++);
    return c;
  }, [g]);

  if (!g) return <main className="p-8"><Skeleton className="h-[80vh]" /></main>;

  return (
    <main className="relative h-dvh max-[900px]:h-[calc(100dvh-56px)]">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView
        fitViewOptions={{ padding: 0.08, nodes: g.nodes.filter((n) => (n.lane === "path" || n.lane === "core") && (pos.get(n.id)?.x ?? 0) < COL * 5.5).map((n) => ({ id: n.id })) }}
        minZoom={0.12} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => setSel(n.id === sel ? null : n.id)} onNodeMouseEnter={(_, n) => setHover(n.id)} onNodeMouseLeave={() => setHover(null)}
        onPaneClick={() => setSel(null)} className="!bg-transparent">
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="var(--lp-line-strong)" />
        {/* lane labels, drawn in the flow's own coordinates */}
        <LaneLabels lanes={g.lanes.filter((l) => lanes[l.id])} width={width} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={3} maskColor="color-mix(in oklab, var(--lp-bg) 70%, transparent)"
          nodeColor={(n) => (n.data as NodeData).status === "done" ? "#34d399" : MINI[(n.data as NodeData).lane]} nodeBorderRadius={6} className="!hidden md:!block" />
      </ReactFlow>

      {/* toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-4 sm:p-6">
        <div className="glass pointer-events-auto flex flex-wrap items-center gap-3 self-start rounded-2xl px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-glow"><Workflow size={18} /></span>
          <div className="mr-2">
            <h1 className="text-[1.05rem] font-bold leading-tight tracking-[-0.02em]">Your roadmap</h1>
            <p className="text-[12px] text-faint">{g.nodes.length} milestones · {counts.done} done · {counts.in_progress} in progress</p>
          </div>
          <span className="hidden h-8 w-px bg-line sm:block" />
          <div className="flex flex-wrap gap-1.5">
            {g.lanes.map((l) => {
              const L = LANE[l.id as keyof typeof LANE];
              return (
                <button key={l.id} className="chip" data-on={lanes[l.id]} onClick={() => setLanes({ ...lanes, [l.id]: !lanes[l.id] })} title={l.blurb}>
                  <span className="h-2 w-2 rounded-full" style={{ background: L.color, boxShadow: `0 0 8px ${L.color}` }} /> {l.label}
                </button>
              );
            })}
          </div>
          <select className="input !w-auto !rounded-full !py-1.5 text-[12.5px]" value={statusF} onChange={(e) => setStatusF(e.target.value as Status | "all")} aria-label="Status">
            <option value="all">Every status</option>
            {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label} ({counts[s]})</option>)}
          </select>
          {next ? <button className="btn btn-primary btn-sm" onClick={() => flyTo(next.id)}><Crosshair size={14} /> Focus my next step</button> : null}
        </div>
        <div className="glass pointer-events-auto hidden gap-4 self-start rounded-xl px-3.5 py-2 text-[11.5px] text-faint md:flex">
          <span className="flex items-center gap-1.5"><i className="h-[2px] w-5 bg-line-strong" /> next in order</span>
          <span className="flex items-center gap-1.5"><i className="h-[2px] w-5 bg-line-strong opacity-60" /> unit uses lab</span>
          <span className="flex items-center gap-1.5"><i className="h-[1px] w-5 bg-line" /> lab practises component</span>
          <span>Hover a milestone to trace its chain · click for details</span>
        </div>
      </div>

      {/* detail panel */}
      <AnimatePresence>
        {selected ? (
          <motion.aside key={selected.id} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="glass absolute bottom-4 right-4 top-4 z-10 flex w-[min(380px,calc(100%-2rem))] flex-col overflow-hidden rounded-[22px] sm:bottom-6 sm:right-6 sm:top-6">
            <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${LANE[selected.lane].color}, transparent)` }} />
            <div className="flex items-start gap-3 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: LANE[selected.lane].color }}>{selected.kicker} · {g.lanes.find((l) => l.id === selected.lane)?.label}</p>
                <h2 className="mt-1.5 text-[1.25rem] font-bold leading-tight tracking-[-0.02em]">{selected.label}</h2>
              </div>
              <button className="btn btn-ghost btn-sm !p-1.5" onClick={() => setSel(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5" data-lenis-prevent>
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-node p-3">
                {(() => { const S = STATUS[selected.status]; return <S.icon size={18} className="flex-none" />; })()}
                <div className="flex-1">
                  <p className="text-[13px] font-medium">{STATUS[selected.status].label}</p>
                  {selected.progress[1] ? <div className="bar mt-1.5"><i style={{ width: `${(selected.progress[0] / selected.progress[1]) * 100}%` }} /></div> : null}
                </div>
                {selected.progress[1] ? <span className="text-[12px] text-faint">{selected.progress[0]}/{selected.progress[1]}</span> : null}
              </div>
              {selected.blurb ? <p className="text-[14px] leading-relaxed text-muted">{selected.blurb}</p> : null}
              {selected.time ? <p className="mt-3 text-[12.5px] text-faint">Time: {selected.time}</p> : null}
              {selected.children?.length ? (
                <div className="mt-5">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-faint">In this stage</p>
                  <ul className="grid gap-1.5">
                    {selected.children.map((c) => (
                      <li key={c.href}><Link href={c.href} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 text-[13.5px] hover:bg-node">
                        {c.visited ? <CheckCircle2 size={15} className="text-ok" /> : <Circle size={15} className="text-faint" />}<span className="flex-1">{c.label}</span><ArrowRight size={14} className="text-faint" />
                      </Link></li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Connections g={g} id={selected.id} byId={byId} onPick={flyTo} />
            </div>
            {selected.href ? (
              <div className="border-t border-line p-4">
                {/^\/(path|stack-map|field-view)/.test(selected.href)
                  ? <a href={selected.href} className="btn btn-primary w-full">Open <ArrowRight size={15} /></a>
                  : <Link href={selected.href} className="btn btn-primary w-full">Open <ArrowRight size={15} /></Link>}
              </div>
            ) : <p className="border-t border-line p-4 text-center text-[12.5px] text-faint">Planned. It appears here as soon as it is built.</p>}
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function Connections({ g, id, byId, onPick }: { g: Graph; id: string; byId: Map<string, RNode>; onPick: (id: string) => void }) {
  const ins = g.edges.filter((e) => e.target === id && e.kind !== "next").map((e) => byId.get(e.source)!).filter(Boolean);
  const outs = g.edges.filter((e) => e.source === id && e.kind !== "next").map((e) => byId.get(e.target)!).filter(Boolean);
  if (!ins.length && !outs.length) return null;
  const Row = ({ n }: { n: RNode }) => (
    <button onClick={() => onPick(n.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-node">
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: LANE[n.lane].color }} />
      <span className="flex-1 truncate"><span className="text-faint">{n.kicker}</span> {n.label}</span>
      {n.status === "done" ? <CheckCircle2 size={13} className="text-ok" /> : null}
    </button>
  );
  return (
    <div className="mt-5 grid gap-4">
      {ins.length ? <div><p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-faint">Builds on</p>{ins.map((n) => <Row key={n.id} n={n} />)}</div> : null}
      {outs.length ? <div><p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-faint">Leads to</p>{outs.map((n) => <Row key={n.id} n={n} />)}</div> : null}
    </div>
  );
}

function LaneLabels({ lanes, width }: { lanes: Graph["lanes"]; width: number }) {
  const vp = useViewport();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {lanes.map((l) => {
        const L = LANE[l.id as keyof typeof LANE];
        const top = (L.y - 58) * vp.zoom + vp.y;
        return (
          <div key={l.id} className="absolute flex items-center gap-2 whitespace-nowrap" style={{ left: Math.max(16, vp.x - 4), top, transform: `scale(${Math.min(1, Math.max(0.7, vp.zoom))})`, transformOrigin: "left center" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: L.color, boxShadow: `0 0 12px ${L.color}` }} />
            <span className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: L.color }}>{l.label}</span>
            <span className="text-[12px] text-faint">{l.blurb}</span>
            <span className="ml-2 h-px" style={{ width: Math.max(0, width * vp.zoom - 420), background: `linear-gradient(90deg, ${L.color}, transparent)`, opacity: 0.35 }} />
          </div>
        );
      })}
    </div>
  );
}

export default function Page() {
  return <ReactFlowProvider><Roadmap /></ReactFlowProvider>;
}
