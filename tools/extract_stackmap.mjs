// One-time extractor: splits the old single-file "Stack Map and Labs" page into
//   - seed data (JSON, loaded into PostgreSQL by the API)
//   - CSS for the Next.js app
//   - the interactive engine as a TypeScript module (no content inside it)
//
//   node tools/extract_stackmap.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "legacy-static/stack-map-and-labs.html");
const SEED = path.join(ROOT, "api/seed");
const WEB = path.join(ROOT, "web/src");
const L = fs.readFileSync(SRC, "utf8").split("\n"); // L[n-1] is file line n

const line = (n) => L[n - 1];
const find = (re, from = 1) => {
  for (let i = from; i <= L.length; i++) if (re.test(L[i - 1])) return i;
  throw new Error("marker not found: " + re);
};
const slice = (a, b) => L.slice(a - 1, b).join("\n"); // inclusive

const ARTIFACT_PATH = "https://claude.ai/artifact/AAy87d8ofDzb4ZydNhyzbn"; // the Stack Map itself
const ARTIFACT_PATH_LEARNING = "https://claude.ai/artifact/Hp2f9vg1CBaetjEPL8Qh1n"; // the Learning Path
const relink = (s) => s.split(ARTIFACT_PATH).join("/stack-map").split(ARTIFACT_PATH_LEARNING).join("/");

const styleOpen = find(/^<style>/), styleClose = find(/^<\/style>/, styleOpen);
const bodyOpen = find(/^<div id="view-map">/);
const scriptOpen = find(/^<script>/, bodyOpen), scriptClose = find(/^<\/script>/, scriptOpen);

/* ---------------- 1. CSS ---------------- */
fs.mkdirSync(path.join(WEB, "styles"), { recursive: true });
fs.writeFileSync(path.join(WEB, "styles/stackmap.css"), slice(styleOpen + 1, styleClose - 1) + "\n");

/* ---------------- 2. HTML shell (content, served by the API) ---------------- */
const shell = relink(slice(bodyOpen, scriptOpen - 1));

/* ---------------- 3. data consts (evaluated, not copied) ---------------- */
const iR = find(/^const R=\{/), iResList = find(/^function resList/), iNodes = find(/^const NODES=\{/);
const iOrder = find(/^const ORDER=/), iTabs = find(/^const TABS=\{\}/);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  slice(iR, iResList - 1) + "\n" + slice(iNodes, iOrder) + "\nglobalThis.__out={R,NODES,EDGES,ROUTES,PLANES,ORDER};",
  ctx
);
const D = JSON.parse(JSON.stringify(ctx.__out));

const iLab = find(/^const LAB=/);
const LAB = JSON.parse(line(iLab).replace(/^const LAB=/, "").replace(/;$/, ""));

/* ---------------- 4. split the lab data ---------------- */
// Explain panels are numbered across all labs (block.x). Work out which a lab uses so a lab can be sent on its own.
const xiOf = (node, out) => {
  if (Array.isArray(node)) return node.forEach((n) => xiOf(n, out));
  if (node && typeof node === "object") {
    if (node.t === "cmd" && node.x != null) out.add(node.x);
    Object.values(node).forEach((v) => xiOf(v, out));
  }
};
const itemKeys = (body) => {
  const keys = [];
  Object.values(body).forEach((tab) =>
    [...(tab.main || []), ...(tab.side || [])].forEach((b) => {
      if (b.t === "steps" || b.t === "ex") b.items.forEach((it) => keys.push(it.k));
    })
  );
  return keys;
};

const labs = LAB.order.map((id, ord) => {
  const l = LAB.labs[id];
  const { body, ...meta } = l;
  const used = new Set();
  xiOf(body, used);
  const assetId = (LAB.alias || {})[id] || (LAB.files[id] ? id : null); // Lab 0 has no project files
  return {
    id, ord, meta, items: itemKeys(body), asset_id: assetId,
    tabs: Object.keys(body).map((k, i) => ({ tab_key: k, ord: i, body: JSON.parse(relink(JSON.stringify(body[k]))) })),
    xis: [...used].sort((a, b) => a - b),
  };
});
const assets = Object.keys(LAB.files).map((id) => ({
  id, files: LAB.files[id], setup: LAB.setup[id], folder: LAB.folder[id], filesui: LAB.filesui[id],
}));
const explain = LAB.x.b.map((data, xi) => ({ xi, data }));

const seed = {
  pages: [{ key: "stackmap.shell", html: shell }],
  resources: Object.entries({ ...D.R, ...LAB.res }).map(([key, [title, descr, url]]) => ({ key, title, descr, url })),
  nodes: Object.entries(D.NODES).map(([id, data], ord) => ({ id, ord, data })),
  edges: D.EDGES.map((data, ord) => ({ id: data.id, ord, data })),
  routes: Object.entries(D.ROUTES).map(([id, data], ord) => ({ id, ord, data })),
  planes: Object.entries(D.PLANES).map(([id, data], ord) => ({ id, ord, data })),
  plane_order: D.ORDER,
  planned_labs: LAB.planned,
  explain_shared: { p: LAB.x.p, names: LAB.x.names },
  explain,
  labs, assets,
};
fs.mkdirSync(SEED, { recursive: true });
fs.writeFileSync(path.join(SEED, "stackmap.json"), JSON.stringify(seed));

/* ---------------- 5. the engine (code only) ---------------- */
const iAlias = find(/^Object\.entries\(LAB\.alias/), iAssign = find(/^Object\.assign\(R,LAB\.res\)/), iLabOrder = find(/^const LAB_ORDER/);
const iReg = find(/^LAB\.order\.forEach\(id=>\{/);
const iRegEnd = find(/^\}\);/, iReg);
const iWiring = find(/^\/\* ---------- wiring/);
const iHelpersEnd = iR - 1; // helpers sit between "use strict" and the resources block

const parts = [];
parts.push(slice(scriptOpen + 2, iHelpersEnd)); // after "use strict"
parts.push(slice(iResList, iResList)); // resList()
parts.push(slice(iTabs, iLab - 1)); // TABS, map rendering, simulators, lab-header comment
// iLab itself (the data) is dropped; iAlias..iLabOrder are replaced by initData()
parts.push(slice(iLabOrder + 1, iReg - 1));
parts.push(slice(iRegEnd + 1, iWiring - 1));
let code = parts.join("\n");

// the data consts are now module variables set by initData()
const header = `// @ts-nocheck
/* eslint-disable */
/* Interactive engine of the Stack Map and Labs page.
   Moved over from the single HTML file with its behaviour unchanged. Content is NOT in this file:
   the map, labs, resources and lab text arrive from the API (see data.ts) and are set by initData(). */
import { api } from "./api";

let R = {}, NODES = {}, EDGES = [], EMAP = {}, ROUTES = {}, PLANES = {}, ORDER = [], LAB = {}, LAB_ORDER = [];
const disposers = [];
const deferred = [];
function defer(t, ev, fn) { deferred.push([t, ev, fn]); }
function listen(t, ev, fn) { t.addEventListener(ev, fn); disposers.push(() => t.removeEventListener(ev, fn)); }
`;

code = code
  // progress and preferences live on the server now (a cache that is written through)
  .replace(/function store\(k,v\)\{[^\n]*\n/, "function store(k,v){return api.state.get_or_set(k,v)}\n")
  // the lab grid counts ticks per lab from a key list that arrives with the lab list (bodies load on demand)
  .replace(
    /function labCount\(id\)\{[\s\S]*?\n\}\n/,
    `function labCount(id){
  const done=labDone(id),keys=LAB.labs[id].items;let d=0;
  keys.forEach(k=>{if(done[k])d++});
  return [d,keys.length];
}\n`
  )
  .replace(/document\.addEventListener\(/g, "defer(document,")
  .replace(/window\.addEventListener\(/g, "defer(window,");

const footer = `

function onHashAsync(){
  const [h,t]=location.hash.slice(1).split(".");
  const P=PLANES[h];
  if(!P){showMap();return}
  if(P.lab&&!LAB.loaded[P.lab]){
    ensureLab(P.lab).then(()=>{if(location.hash.slice(1).split(".")[0]===h)openPlane(h,t)},()=>{});
    return;
  }
  openPlane(h,t);
}
async function ensureLab(id){
  if(LAB.loaded[id])return;
  const d=await api.get("/api/stackmap/labs/"+id);
  const L=LAB.labs[id];
  L.body=d.body;
  LAB.files[id]=d.files;LAB.setup[id]=d.setup;LAB.folder[id]=d.folder;LAB.filesui[id]=d.filesui;
  Object.entries(d.explain).forEach(([xi,v])=>{LAB.x.b[xi]=v});
  LAB.loaded[id]=true;
}

/* ---------- entry points used by the React page ---------- */
export function initData(d){
  R=d.resources;NODES=d.nodes;EDGES=d.edges;EMAP=Object.fromEntries(EDGES.map(e=>[e.id,e]));
  ROUTES=d.routes;PLANES=d.planes;ORDER=d.plane_order;
  LAB={order:d.lab_order,labs:d.labs,planned:d.planned_labs,x:{p:d.explain_shared.p,names:d.explain_shared.names,b:{}},
    files:{},setup:{},folder:{},filesui:{},loaded:{}};
  LAB_ORDER=LAB.order.map(id=>"lab-"+id);
  LAB.order.forEach(id=>{
    const L=LAB.labs[id];
    PLANES["lab-"+id]={name:L.name,short:L.short,blurb:L.blurb,lede:L.lede,tabs:L.tabs,res:L.res,lab:id};
    TABS["lab-"+id]=Object.fromEntries(L.tabs.filter(t=>t[0]!=="res").map(([k])=>[k,el=>labTab(id,k,el)]));
  });
}
export function start(){
  deferred.forEach(([t,e,f])=>listen(t,e,f));
  buildMap();buildViews();buildLabs();applyMap();renderPanel();
  $("#map").addEventListener("click",ev=>{const g=ev.target.closest(".n");if(g)selectNode(g.dataset.n,true)});
  $("#map").addEventListener("keydown",ev=>{const g=ev.target.closest(".n");if(g&&(ev.key==="Enter"||ev.key===" ")){ev.preventDefault();selectNode(g.dataset.n,true)}});
  listen(document,"keydown",ev=>{if(ev.key==="Escape"&&state.sel&&!$("#view-map").hidden){state.sel=null;applyMap();renderPanel()}});
  listen(document,"click",ev=>{
    const p=ev.target.closest("[data-plane]");if(p){goPlane(p.dataset.plane);return}
    const s=ev.target.closest("[data-sel]");if(s&&!$("#view-map").hidden){selectNode(s.dataset.sel,false);return}
    const r=ev.target.closest("[data-route]");if(r&&r.closest("#view-map")){setRoute(r.dataset.route);return}
    if(ev.target.closest("[data-tomap]")){$("#mapcard").scrollIntoView({behavior:RM?"auto":"smooth",block:"start"})}
  });
  $("#backmap").addEventListener("click",()=>{if(history.length>1&&location.hash){location.hash=""}else showMap()});
  $("#ptabs").addEventListener("click",ev=>{const b=ev.target.closest("[data-tab]");if(b)showTab(b.dataset.tab)});
  $("#ptabs").addEventListener("keydown",ev=>{
    if(ev.key!=="ArrowRight"&&ev.key!=="ArrowLeft")return;
    const bs=$$("#ptabs button");const i=bs.findIndex(b=>b.getAttribute("aria-selected")==="true");
    const j=(i+(ev.key==="ArrowRight"?1:-1)+bs.length)%bs.length;bs[j].focus();showTab(bs[j].dataset.tab);
  });
  listen(window,"hashchange",onHashAsync);
  onHashAsync();
}
export function stop(){stopTab();disposers.splice(0).forEach(f=>f())}
`;

// the original wiring is replaced by start(); keep only the document-level handlers it registered earlier
code = code.replace(/\n\/\* ---------- wiring[\s\S]*$/, "");
code = code.replace(/\bfunction onHash\(\)\{[^\n]*\n/, "");

fs.mkdirSync(path.join(WEB, "legacy"), { recursive: true });
fs.writeFileSync(path.join(WEB, "legacy/stackmap.ts"), header + code + footer);
console.log("seed", (fs.statSync(path.join(SEED, "stackmap.json")).size / 1024).toFixed(0) + " KB",
  "engine", (fs.statSync(path.join(WEB, "legacy/stackmap.ts")).size / 1024).toFixed(0) + " KB",
  "labs", labs.length, "explain", explain.length);
