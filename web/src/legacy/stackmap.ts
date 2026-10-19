// @ts-nocheck
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
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const RM=(()=>{try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return false}})();
function store(k,v){return api.state.get_or_set(k,v)}
const fmt=(n,d)=>Number(n).toLocaleString("en-US",{maximumFractionDigits:d==null?(Math.abs(n)<10?1:0):d});
function fmtBytes(b){const u=["B","KB","MB","GB","TB","PB","EB"];let i=0;while(Math.abs(b)>=1000&&i<u.length-1){b/=1000;i++}return fmt(b,b<10?1:0)+" "+u[i]}
function fmtCount(n){if(n>=1e9)return fmt(n/1e9,n<1e10?1:0)+"B";if(n>=1e6)return fmt(n/1e6,n<1e7?1:0)+"M";if(n>=1e3)return fmt(n/1e3,n<1e4?1:0)+"K";return fmt(n)}
function seg(name,opts,cur,label){return `<div class="seg" role="group" aria-label="${esc(label||name)}" data-seg="${name}">${opts.map(([v,t])=>`<button type="button" data-v="${v}" aria-pressed="${String(v)===String(cur)}">${t}</button>`).join("")}</div>`}
function onSeg(root,name,fn){const g=$(`[data-seg="${name}"]`,root);if(!g)return;g.addEventListener("click",ev=>{const b=ev.target.closest("button[data-v]");if(!b)return;$$("button",g).forEach(x=>x.setAttribute("aria-pressed",String(x===b)));fn(b.dataset.v)})}

/* ---------- resources ---------- */
function resList(keys){return `<ul class="reslist">${keys.map(k=>{const r=R[k];return r?`<li><a href="${r[2]}" target="_blank" rel="noopener">${esc(r[0])}</a><span>${esc(r[1])}</span></li>`:""}).join("")}</ul>`}
const TABS={};

/* ---------- map rendering ---------- */
const state={route:"all",sel:null};
function buildMap(){
  const mk=["muted","dash","on","static","api","chat"].map(k=>`<marker id="ar-${k}" class="mk mk-${k}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>`).join("");
  let s=`<defs>${mk}</defs>`;
  s+=`<g class="axis" aria-hidden="true"><line x1="8" y1="34" x2="8" y2="690"/><path d="M4,682 L8,692 L12,682"/><text transform="translate(14,36) rotate(90)">closer to the user</text><text transform="translate(14,676) rotate(90)" text-anchor="end">closer to the data</text></g>`;
  s+=`<g id="edges">`+EDGES.map(e=>`<g class="e${e.dash?" dash":""}${e.bi?" bi":""}" data-e="${e.id}"><path class="halo" d="${e.d}"/><path class="line" d="${e.d}"/></g>`).join("")+`</g>`;
  s+=`<g id="nodes">`+Object.entries(NODES).map(([id,n])=>{
    const w=n.w||100,h=n.h||42,x=n.x-w/2,y=n.y-h/2;
    let inner=`<rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>`;
    if(id==="shards"){
      inner+=`<text x="${n.x}" y="${y+17}">${esc(n.name)}</text>`;
      [70,140,210].forEach((cx,i)=>{inner+=`<rect class="mini" x="${cx-30}" y="${y+26}" width="60" height="36" rx="6"/><text class="minit" x="${cx}" y="${y+41}">Shard ${i+1}</text><circle class="pdot" cx="${cx-9}" cy="${y+52}" r="2.8"/><circle class="rdot" cx="${cx}" cy="${y+52}" r="2.6"/><circle class="rdot" cx="${cx+9}" cy="${y+52}" r="2.6"/>`});
    }else{
      inner+=`<text x="${n.x}" y="${n.y-2}">${esc(n.name)}</text><text class="sub" x="${n.x}" y="${n.y+12}">${esc(n.sub)}</text>`;
    }
    if(n.plane)inner+=`<circle class="ring" cx="${x+w}" cy="${y}" r="6"/><circle class="ringdot" cx="${x+w}" cy="${y}" r="2.4"/>`;
    return `<g class="n" data-n="${id}" tabindex="0" role="button" aria-label="${esc(n.name)}${n.plane?", has a deeper view":""}">${inner}</g>`;
  }).join("")+`</g>`;
  $("#map").innerHTML=s;
}
function neighbors(id){const s=new Set([id]);EDGES.forEach(e=>{if(e.from===id)s.add(e.to);if(e.to===id)s.add(e.from)});return s}
function applyMap(){
  const {route,sel}=state;
  const rs=route==="all"?null:new Set(ROUTES[route].edges);
  const ns=route==="all"?null:new Set(ROUTES[route].nodes);
  const nb=sel?neighbors(sel):null;
  $$("#map .e").forEach(g=>{
    const e=EMAP[g.dataset.e];
    g.classList.remove("on","dim","r-static","r-api","r-chat","flow");
    const touch=sel&&(e.from===sel||e.to===sel);
    if(rs){if(rs.has(e.id)){g.classList.add("r-"+route);if(!RM)g.classList.add("flow")}else g.classList.add("dim")}
    else if(sel){g.classList.add(touch?"on":"dim")}
  });
  $$("#map .n").forEach(g=>{
    const id=g.dataset.n;
    g.classList.toggle("sel",id===sel);
    g.setAttribute("aria-pressed",String(id===sel));
    g.classList.toggle("dim",ns?!ns.has(id):(sel?!nb.has(id):false));
  });
  $$("#routeseg button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.route===route)));
}
function routeTags(n){return n.routes.map(r=>`<button type="button" class="rtag chip" data-route="${r}"><i class="sw sw-${r}"></i>${ROUTES[r].name}</button>`).join("")}
function nodePanel(id){
  const n=NODES[id];
  const conns=EDGES.filter(e=>e.from===id||e.to===id).map(e=>{
    const o=e.from===id?e.to:e.from;const dir=e.bi?"↔":(e.from===id?"→":"←");
    return `<button type="button" class="chip" data-sel="${o}">${dir} ${esc(NODES[o].name)} <span class="muted">(${esc(e.label)})</span></button>`}).join("");
  return `<button type="button" class="btn tomap" data-tomap>↑ Back to the map</button>
  <p class="eyebrow">${esc(n.layer)} layer</p>
  <h3>${esc(n.name)}</h3>
  <p>${n.what}</p>
  ${n.plane?`<p><button type="button" class="btn primary" data-plane="${n.plane}">Open the ${esc(PLANES[n.plane].short)} view</button></p>`:""}
  <dl class="fields"><dt>Examples</dt><dd>${n.examples}</dd><dt>On routes</dt><dd>${routeTags(n)}</dd></dl>
  <h4>Connected to</h4><div class="chips">${conns}</div>
  ${nodeLabs(id)}
  <h4>Key ideas</h4><ul class="plain">${n.ideas.map(i=>`<li>${i}</li>`).join("")}</ul>
  <div class="callout"><b>In an interview:</b> ${n.interview}</div>
  <h4>Resources</h4>${resList(n.res)}`;
}
function routePanel(r){
  const o=ROUTES[r];
  return `<p class="eyebrow">Route, step by step</p><h3><i class="sw sw-${r}"></i>${o.name}</h3><p>${o.desc}</p>
  <ol class="steps">${o.steps.map(([id,t])=>`<li><button type="button" class="linkbtn" data-sel="${id}">${esc(NODES[id].name)}</button>: ${t}</li>`).join("")}</ol>
  <p class="note">Tap a component name to open its details. Choose <b>All</b> above the map to clear the highlight.</p>`;
}
function startPanel(){
  return `<p class="eyebrow">Start here</p><h3>How to read this map</h3>
  <p>The map follows a request from the user's device at the top to stored data at the bottom. Solid arrows carry the request itself. Dashed arrows are lookups or side calls, such as checking a cache.</p>
  <h4>Three routes through the stack</h4>
  <div class="chips">${Object.keys(ROUTES).map(r=>`<button type="button" class="chip" data-route="${r}"><i class="sw sw-${r}"></i>${ROUTES[r].name}</button>`).join("")}</div>
  <ul class="plain">
   <li><b>Page load:</b> images, scripts, and video come from the CDN. App servers are not involved.</li>
   <li><b>API request:</b> a normal call such as loading a profile, through the rate limiter, app servers, cache, and database.</li>
   <li><b>Chat message:</b> a WebSocket frame routed through a queue to the other user, or to a push notification if they are offline.</li>
  </ul>
  <h4>Suggested study order</h4>
  <ol class="steps">${ORDER.map(p=>`<li><button type="button" class="linkbtn" data-plane="${p}">${PLANES[p].name}</button>: ${esc(PLANES[p].blurb)}</li>`).join("")}</ol>
  ${startLabs()}
  <h4>General resources</h4>${resList(["neet","primer","bbg","ddia","latency"])}`;
}
function renderPanel(){
  const el=$("#panel");
  el.innerHTML=state.sel?nodePanel(state.sel):(state.route!=="all"?routePanel(state.route):startPanel());
  el.scrollTop=0;
}
function selectNode(id,fromMap){
  state.sel=(fromMap&&state.sel===id)?null:id;
  applyMap();renderPanel();
  if(fromMap&&state.sel&&matchMedia("(max-width: 900px)").matches){$("#panelcard").scrollIntoView({behavior:RM?"auto":"smooth",block:"start"})}
}
function setRoute(r){state.route=r;state.sel=null;applyMap();renderPanel()}
function buildViews(){
  $("#vgrid").innerHTML=ORDER.map(p=>{const P=PLANES[p];return `<button type="button" class="vcard" data-plane="${p}"><b>${esc(P.name)}</b><span>${esc(P.blurb)}</span><span class="tabsline">Tabs: ${P.tabs.filter(t=>t[0]!=="res").map(t=>t[1]).join(", ")}</span><span class="go">Open view →</span></button>`}).join("");
}

/* ---------- deep view framework ---------- */
let cleanup=null,curPlane=null,mapScroll=0;
function stopTab(){if(typeof cleanup==="function"){try{cleanup()}catch(e){}}cleanup=null}
function openPlane(id,want){
  const P=PLANES[id];if(!P)return;
  if(!$("#view-map").hidden)mapScroll=window.scrollY;
  stopTab();curPlane=id;
  $("#view-map").hidden=true;$("#view-plane").hidden=false;
  $("#crumbname").textContent=P.name;$("#ptitle").textContent=P.name;$("#plede").textContent=P.lede;
  $("#peyebrow").textContent=P.lab?LAB.labs[P.lab].kicker+" · Hands-on lab":"Deeper view";
  $("#pswitch").innerHTML=(P.lab?LAB_ORDER:ORDER).map(p=>`<button type="button" class="chip" data-plane="${p}" aria-current="${p===id}">${esc(PLANES[p].name)}</button>`).join("");
  const saved=want||store("tab."+id);const tab=P.tabs.some(t=>t[0]===saved)?saved:P.tabs[0][0];
  $("#ptabs").innerHTML=P.tabs.map(([k,l])=>`<button type="button" role="tab" id="tab-${k}" data-tab="${k}" aria-selected="${k===tab}" tabindex="${k===tab?0:-1}">${esc(l)}</button>`).join("");
  showTab(tab,true);
  document.title=P.name+" · Stack Map and Labs";
  window.scrollTo(0,0);
}
function showTab(tab,first){
  const P=PLANES[curPlane];stopTab();
  $$("#ptabs button").forEach(b=>{const on=b.dataset.tab===tab;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1});
  const body=$("#pbody");body.setAttribute("aria-labelledby","tab-"+tab);body.innerHTML="";
  store("tab."+curPlane,tab);
  if(tab==="res"){body.innerHTML=`<div class="box prose"><h3>${P.lab?"Resources for this lab":"Resources for "+esc(P.name.toLowerCase())}</h3>${resList(P.res)}</div>`;return}
  const fn=TABS[curPlane]&&TABS[curPlane][tab];
  if(fn){try{cleanup=fn(body)||null}catch(err){body.innerHTML=`<div class="box"><p>This section could not load: ${esc(err.message)}</p></div>`;console.error(err)}}
  if(!first){const t=$("#ptabs");if(t.getBoundingClientRect().top<0)t.scrollIntoView({block:"start"})}
}
function showMap(){
  stopTab();curPlane=null;
  $("#view-plane").hidden=true;$("#view-map").hidden=false;
  document.title="Stack Map and Labs";
  window.scrollTo(0,mapScroll||0);
}
function goPlane(id){if(location.hash==="#"+id)openPlane(id);else location.hash=id}

/* ---------- caching ---------- */
TABS.caching={
layers(el){
  const MIN=1e-5,MAX=1e3,span=Math.log10(MAX)-Math.log10(MIN);
  const pos=v=>Math.max(0,Math.min(100,(Math.log10(v)-Math.log10(MIN))/span*100));
  const G=[
   ["From the user's device",[
    {n:"Browser cache",c:1,v:0.5,l:"under 1 ms",scope:"One user on one device.",fresh:"<code>Cache-Control: max-age</code>. After it expires the browser revalidates with an ETag and may get <code>304 Not Modified</code>.",use:"Static files and some API responses."},
    {n:"CDN edge",c:1,v:20,l:"about 20 ms",scope:"Every user near that edge location.",fresh:"TTL from Cache-Control, versioned filenames, or an explicit purge.",use:"Images, video, JS, CSS, and some public GET responses."},
    {n:"Origin, same region",c:0,v:50,l:"about 50 ms",scope:"Not a cache. The request travels all the way to your servers.",fresh:"Always current.",use:"Anything the edge could not answer."},
    {n:"Origin, other continent",c:0,v:150,l:"about 150 ms",scope:"Not a cache. A round trip from California to the Netherlands takes about 150 ms.",fresh:"Always current.",use:"This is the delay a CDN or a second region removes."}]],
   ["From an app server inside the data center",[
    {n:"In-process cache",c:1,v:1e-4,l:"about 100 ns",scope:"One app server. Each server holds its own copy.",fresh:"Short TTL. Each server refreshes on its own schedule, so servers can briefly disagree.",use:"Config, feature flags, rate limit rules, and a few very frequent keys."},
    {n:"Redis or Memcached",c:1,v:0.5,l:"about 0.5 ms",scope:"All app servers share one copy.",fresh:"TTL plus delete on write.",use:"Query results, sessions, counters, rendered page fragments."},
    {n:"Database, data in memory",c:1,v:1,l:"about 1 ms",scope:"The database's own buffer cache (Postgres <code>shared_buffers</code>, MySQL InnoDB buffer pool).",fresh:"Managed by the database.",use:"Recently used rows and index pages. You size it; you do not write code for it."},
    {n:"Database, data on disk",c:0,v:5,l:"1 to 10 ms",scope:"Rows that are not in memory are read from SSD.",fresh:"Always current.",use:"The cost every layer above is trying to avoid."}]]
  ];
  const ticks=[[1e-5,"10 ns"],[1e-3,"1 µs"],[1e-1,"100 µs"],[10,"10 ms"],[1e3,"1 s"]];
  const axis=`<div class="brow axis" aria-hidden="true"><span></span><span class="bt">${ticks.map(([v,t])=>`<span style="left:${pos(v)}%">${t}</span>`).join("")}</span><span></span></div>`;
  const row=it=>`<details class="lrow"><summary><div class="brow"><span class="bl">${it.n}</span><span class="bt"><span class="bf" style="width:${pos(it.v)}%;background:${it.c?"var(--teal)":"var(--dash)"}"></span></span><span class="bv">${it.l}</span></div></summary><div><dl class="fields"><dt>Scope</dt><dd>${it.scope}</dd><dt>Freshness</dt><dd>${it.fresh}</dd><dt>Use it for</dt><dd>${it.use}</dd></dl></div></details>`;
  el.innerHTML=`<div class="cols">
   <div class="box">
    <h3>Where the data comes from, and how long it takes</h3>
    <p class="note">Typical access times on a log scale: each gridline is 100 times the one before it. Teal bars are caches; grey bars are the uncached path. Tap a row for details.</p>
    ${G.map(([g,items])=>`<p class="grp">${g}</p>${items.map(row).join("")}`).join("")}
    ${axis}
   </div>
   <div class="stack">
    <div class="box prose"><h3>How the layers work together</h3>
     <ul class="plain">
      <li>A request is answered by the first layer that has the data. Every layer that answers saves all the layers below it from doing work.</li>
      <li>Static files are cached in the browser and the CDN. Dynamic data is cached in Redis or Memcached in front of the database.</li>
      <li>An in-process cache is the fastest, but every app server keeps its own copy. Use it for small data that rarely changes.</li>
      <li>The database's buffer cache works automatically. You choose its size, not what goes in it.</li>
     </ul>
     <h4>Every cache needs a freshness rule</h4>
     <ul class="plain">
      <li><b>TTL:</b> the entry expires after a set time, so data is at most that old.</li>
      <li><b>Delete on write:</b> when the data changes, the app deletes the cached copy.</li>
      <li><b>Versioned keys:</b> a new version gets a new key or URL (<code>app.3f9c1.js</code>), so old copies are never read again.</li>
     </ul>
     <div class="callout"><b>In an interview:</b> for each cache, say what it stores, its TTL, how it is invalidated, and how much memory it needs.</div>
    </div>
   </div>
  </div>`;
},
patterns(el){
  const P={
   aside:{name:"Cache-aside",desc:"The app talks to both stores. On a read miss it loads from the database and fills the cache. On a write it updates the database and deletes the cached copy. This is the most common pattern and the default answer in interviews.",
    good:"Only data that is actually read gets cached. If the cache is down, reads still work, just slower.",
    cost:"The first read of each key is a miss. Data can be stale until the TTL expires or the key is deleted.",
    hit:[["app","cache","<b>GET user:42</b>"],["cache","app","Found. Returned without touching the database."]],
    miss:[["app","cache","<b>GET user:42</b>"],["cache","app","Not found."],["app","db","<b>SELECT * FROM users WHERE id = 42</b>"],["db","app","Row returned."],["app","cache","<b>SET user:42 {json} EX 300</b> keeps it for 5 minutes."]],
    write:[["app","db","<b>UPDATE users SET name = 'Ana' WHERE id = 42</b>"],["db","app","Committed."],["app","cache","<b>DEL user:42</b> so the next read loads the new value."]]},
   rt:{name:"Read-through",desc:"The app only talks to the cache. On a miss, the cache (or a caching library wrapped around it) loads the value from the database itself, stores it, and returns it.",
    good:"Loading logic lives in one place instead of in every caller.",
    cost:"Needs a cache layer or library that can load from the database. The first read of each key is still a miss.",
    hit:[["app","cache","<b>GET user:42</b>"],["cache","app","Found. Returned without touching the database."]],
    miss:[["app","cache","<b>GET user:42</b>"],["cache","db","Miss. The cache loads it: <b>SELECT * FROM users WHERE id = 42</b>"],["db","cache","Row returned."],["cache","app","Stored with a TTL and returned."]],
    write:[["app","db","<b>UPDATE users SET name = 'Ana' WHERE id = 42</b>"],["db","app","Committed."],["app","cache","<b>DEL user:42</b>, or let the TTL expire."]]},
   wt:{name:"Write-through",desc:"Every write goes through the cache, and the cache writes to the database before confirming. Reads come from the cache, usually with read-through on a miss.",
    good:"Keys that were written are always current in the cache.",
    cost:"Each write waits on two stores. Data that is written but never read still takes cache memory.",
    hit:[["app","cache","<b>GET user:42</b>"],["cache","app","Found. Returned without touching the database."]],
    miss:[["app","cache","<b>GET user:42</b>"],["cache","db","Miss. The cache loads it from the database."],["db","cache","Row returned."],["cache","app","Stored and returned."]],
    write:[["app","cache","<b>SET user:42</b> with the new value"],["cache","db","Writes it to the database in the same request."],["db","cache","Committed."],["cache","app","OK, after both stores have the value."]]},
   wb:{name:"Write-behind",desc:"Writes go to the cache and are confirmed right away. The cache flushes them to the database later, often in batches. Also called write-back.",
    good:"Fast writes, and batching reduces load on the database.",
    cost:"Writes still waiting in the cache are lost if it fails before flushing. Anything reading the database directly sees old data until the flush.",
    hit:[["app","cache","<b>GET user:42</b>"],["cache","app","Found. Returned without touching the database."]],
    miss:[["app","cache","<b>GET user:42</b>"],["cache","db","Miss. The cache loads it from the database."],["db","cache","Row returned."],["cache","app","Stored and returned."]],
    write:[["app","cache","<b>SET user:42</b> with the new value"],["cache","app","OK right away."],["cache","db","Later: queued writes are flushed as one batch."]]}
  };
  const PT={app:{cache:[140,88],db:[140,112]},cache:{app:[270,50],db:[330,72]},db:{app:[270,150],cache:[330,128]}};
  let pat=store("pat")||"aside",act="miss",step=-1,timer=null,raf=null;
  if(!P[pat])pat="aside";
  el.innerHTML=`<div class="cols">
   <div class="box">
    <div class="ctlrow"><span class="lbl">Pattern</span>${seg("pat",[["aside","Cache-aside"],["rt","Read-through"],["wt","Write-through"],["wb","Write-behind"]],pat,"Pattern")}</div>
    <div class="ctlrow"><span class="lbl">Operation</span>${seg("act",[["hit","Read, cache hit"],["miss","Read, cache miss"],["write","Write"]],act,"Operation")}</div>
    <svg class="fig" viewBox="0 0 420 200" role="img" aria-label="App server, cache, and database with the current step highlighted">
     <line class="fline" data-ed="app-cache" x1="140" y1="88" x2="270" y2="50"/>
     <line class="fline" data-ed="app-db" x1="140" y1="112" x2="270" y2="150"/>
     <line class="fline" data-ed="cache-db" x1="330" y1="72" x2="330" y2="128"/>
     <rect class="fnode" data-nd="app" x="20" y="76" width="120" height="48" rx="10"/><text x="80" y="104" text-anchor="middle">App server</text>
     <rect class="fnode" data-nd="cache" x="270" y="26" width="120" height="46" rx="10"/><text x="330" y="54" text-anchor="middle">Cache</text>
     <rect class="fnode" data-nd="db" x="270" y="128" width="120" height="46" rx="10"/><text x="330" y="156" text-anchor="middle">Database</text>
     <circle class="dot" id="pdot" r="6" cx="-20" cy="-20"/>
    </svg>
    <p class="stepcap" id="pcap" aria-live="polite"></p>
    <div class="btnrow"><button type="button" class="btn primary" id="pplay">Play</button><button type="button" class="btn" id="pnext">Next step</button><button type="button" class="btn" id="preset">Reset</button></div>
   </div>
   <div class="stack"><div class="box" id="pnote"></div><div class="box"><h4 class="m0">Steps</h4><ol class="steps" id="psteps"></ol></div></div>
  </div>`;
  const steps=()=>P[pat][act];
  function stopAnim(){if(timer){clearInterval(timer);timer=null}if(raf){cancelAnimationFrame(raf);raf=null}$("#pplay",el).textContent="Play"}
  function draw(){
    const S=steps();
    $$(".fline",el).forEach(l=>l.classList.remove("hot"));$$(".fnode",el).forEach(n=>n.classList.remove("act"));
    $$("#psteps li",el).forEach((li,i)=>{li.classList.toggle("cur",i===step);li.classList.toggle("done",i<step)});
    const dot=$("#pdot",el);
    if(step<0){$("#pcap",el).innerHTML=`Press <b>Play</b> or <b>Next step</b> to follow the request.`;dot.setAttribute("cx",-20);return}
    const [a,b,t]=S[step];
    $(`[data-ed="${[a,b].sort().join("-")}"]`,el).classList.add("hot");
    $(`[data-nd="${a}"]`,el).classList.add("act");$(`[data-nd="${b}"]`,el).classList.add("act");
    $("#pcap",el).innerHTML=`Step ${step+1} of ${S.length}: ${t}`;
    const [x1,y1]=PT[a][b],[x2,y2]=PT[b][a];
    if(RM){dot.setAttribute("cx",x2);dot.setAttribute("cy",y2);return}
    const t0=performance.now();if(raf)cancelAnimationFrame(raf);
    const go=now=>{const k=Math.min(1,(now-t0)/650);dot.setAttribute("cx",x1+(x2-x1)*k);dot.setAttribute("cy",y1+(y2-y1)*k);if(k<1)raf=requestAnimationFrame(go)};
    raf=requestAnimationFrame(go);
  }
  function list(){
    const o=P[pat];
    $("#pnote",el).innerHTML=`<h3>${o.name}</h3><p>${o.desc}</p><dl class="fields"><dt>Benefit</dt><dd>${o.good}</dd><dt>Cost</dt><dd>${o.cost}</dd></dl>`;
    $("#psteps",el).innerHTML=steps().map(s=>`<li>${s[2]}</li>`).join("");
  }
  function next(){const S=steps();step=step>=S.length-1?0:step+1;draw()}
  function play(){
    if(timer){stopAnim();return}
    if(step>=steps().length-1)step=-1;
    next();$("#pplay",el).textContent="Pause";
    timer=setInterval(()=>{if(step>=steps().length-1){stopAnim();return}next()},1300);
  }
  onSeg(el,"pat",v=>{pat=v;store("pat",v);stopAnim();step=-1;list();draw();play()});
  onSeg(el,"act",v=>{act=v;stopAnim();step=-1;list();draw();play()});
  $("#pplay",el).onclick=play;
  $("#pnext",el).onclick=()=>{stopAnim();next()};
  $("#preset",el).onclick=()=>{stopAnim();step=-1;draw()};
  list();draw();
  return stopAnim;
},
eviction(el){
  const CAP=4,KEYS=["A","B","C","D","E","F"];
  let policy=store("evict")==="lfu"?"lfu":"lru",slots=[],tick=0,hits=0,misses=0,log=[];
  const victim=()=>policy==="lru"?slots.reduce((a,b)=>b.last<a.last?b:a):slots.reduce((a,b)=>(b.count<a.count||(b.count===a.count&&b.last<a.last))?b:a);
  function get(k){
    tick++;const s=slots.find(x=>x.k===k);
    if(s){hits++;s.last=tick;s.count++;log.unshift(`<span class="pill ok">hit</span> GET ${k}`)}
    else{misses++;let ev="";if(slots.length>=CAP){const v=victim();slots=slots.filter(x=>x!==v);ev=` Evicted <b>${v.k}</b>, the ${policy==="lru"?"least recently used":"least frequently used"} key.`}
      slots.push({k,last:tick,count:1});log.unshift(`<span class="pill bad">miss</span> GET ${k}: loaded from the database.${ev}`)}
    log=log.slice(0,6);
  }
  function reset(){slots=[];tick=0;hits=0;misses=0;log=[];["A","B","C","A","D"].forEach(get)}
  el.innerHTML=`<div class="cols">
   <div class="box">
    <h3>Try it: a cache with room for 4 keys</h3>
    <div class="ctlrow"><span class="lbl">Policy</span>${seg("pol",[["lru","LRU, least recently used"],["lfu","LFU, least frequently used"]],policy,"Eviction policy")}</div>
    <div class="slots" id="slots"></div>
    <div class="ctlrow"><span class="lbl">Request a key</span><div class="keys">${KEYS.map(k=>`<button type="button" class="btn" data-k="${k}">${k}</button>`).join("")}</div></div>
    <div class="mgrid"><div class="m"><small>Hits</small><b id="eh"></b></div><div class="m"><small>Misses</small><b id="em"></b></div><div class="m"><small>Hit rate</small><b id="er"></b></div></div>
    <ul class="evlog" id="elog" aria-live="polite"></ul>
    <div class="btnrow"><button type="button" class="btn" id="ereset">Reset</button></div>
    <p class="note">The cache starts after the requests A, B, C, A, D. Try E: with LRU, B is evicted because it was used longest ago. Switch to LFU, request A twice, then request F: A stays because it is used most often.</p>
   </div>
   <div class="stack">
    <div class="box prose"><h3>When the cache is full</h3>
     <dl class="fields"><dt>LRU</dt><dd>Drops the key used longest ago. The usual default (Redis <code>allkeys-lru</code>, Memcached).</dd>
     <dt>LFU</dt><dd>Drops the key used least often. Better when the same few keys stay popular for a long time (Redis <code>allkeys-lfu</code>).</dd>
     <dt>TTL</dt><dd>Each key expires after a set time even if there is room, which caps how stale data can be.</dd></dl>
     <h4>Cache stampede</h4><p>When a popular key expires, many requests miss at the same moment and all query the database. Fixes: add random jitter to TTLs so keys do not expire together, let one request rebuild the value while the others wait or get the old value, or refresh popular keys before they expire.</p>
     <h4>Hot keys</h4><p>One key read far more than any other (a celebrity's profile) can overload the single cache node that holds it. Fixes: keep a copy in each app server's in-process cache for a few seconds, or store several copies under different keys (<code>profile:42#1</code> to <code>profile:42#5</code>) and read one at random.</p>
     <h4>Invalidation on writes</h4><p>Update the database, then delete the cache key. Deleting is safer than writing the new value into the cache, because two writers racing can leave the older value cached.</p>
    </div>
   </div>
  </div>`;
  function render(){
    const order=[...slots].sort((a,b)=>policy==="lru"?b.last-a.last:(b.count-a.count||b.last-a.last));
    const v=slots.length>=CAP?victim():null;
    let h=order.map(s=>`<div class="slot${s===v?" next":""}${s.last===tick?" fresh":""}"><b>${s.k}</b><small>used ${s.count}×<br>last at request ${s.last}</small>${s===v?`<small class="bad">next to go</small>`:""}</div>`).join("");
    for(let i=slots.length;i<CAP;i++)h+=`<div class="slot empty"><small>empty</small></div>`;
    $("#slots",el).innerHTML=h;
    $("#eh",el).textContent=hits;$("#em",el).textContent=misses;$("#er",el).textContent=(hits+misses)?Math.round(hits/(hits+misses)*100)+"%":"0%";
    $("#elog",el).innerHTML=log.map(l=>`<li>${l}</li>`).join("");
  }
  $(".keys",el).addEventListener("click",ev=>{const b=ev.target.closest("[data-k]");if(b){get(b.dataset.k);render()}});
  onSeg(el,"pol",v=>{policy=v;store("evict",v);render()});
  $("#ereset",el).onclick=()=>{reset();render()};
  reset();render();
},
sandbox(el){
  const USERS=["Alice","Bob","Cara"],NP=8,WT=[...Array(NP)].map((_,i)=>1/(i+1)),WSUM=WT.reduce((a,b)=>a+b,0);
  const LAT={browser:1,edge:20,origin:60,proxy:1,app:2,inproc:0.1,cache:0.5,db:5};
  const TTLS={browser:[10,60,300],cdn:[30,300,3600],proxy:[10,30,120],inproc:[5,10,60],cache:[60,300,3600]};
  const LN={browser:"browser cache",cdn:"CDN edge",proxy:"reverse proxy",inproc:"in-process cache",cache:"shared cache",db:"database"};
  const PATN={aside:"Cache-aside",rt:"Read-through",wt:"Write-through",wb:"Write-behind"};
  const D={browser:{on:true,ttl:60},cdn:{on:true,ttl:300},proxy:{on:false,ttl:30},inproc:{on:true,ttl:10},cache:{on:true,ttl:300,pattern:"aside",engine:"redis"}};
  const S=JSON.parse(JSON.stringify(D));
  const sv=store("sbx");if(sv&&typeof sv==="object")for(const k in D)if(sv[k])Object.assign(S[k],sv[k]);
  for(const k in TTLS)if(!TTLS[k].includes(S[k].ttl))S[k].ttl=D[k].ttl;
  if(!PATN[S.cache.pattern])S.cache.pattern="aside";
  if(!["redis","memcached"].includes(S.cache.engine))S.cache.engine="redis";
  let down=false,codeSel=store("sbxCode")||"cache";
  let clock=0,base=performance.now(),db,latest,C,st,rr,pend,log,last,flash=[],tick=null,burst=[];
  const now=()=>clock+(performance.now()-base)/1000;
  const mmss=t=>{const s=Math.floor(t);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
  function init(){
    db={};latest={};for(let k=1;k<=NP;k++){db[k]={v:1,price:10+k*5};latest[k]={v:1,price:10+k*5}}
    C={browser:{Alice:new Map(),Bob:new Map(),Cara:new Map()},cdn:new Map(),proxy:new Map(),inproc:[new Map(),new Map()],cache:new Map()};
    st={browser:[0,0],cdn:[0,0],proxy:[0,0],inproc:[0,0],cache:[0,0],db:0,req:0,lat:0,stale:0};
    rr=0;pend=[];log=[];last=null;clock=0;base=performance.now();
  }
  const save=()=>store("sbx",S);
  const pick=()=>{let r=Math.random()*WSUM;for(let i=0;i<NP;i++){r-=WT[i];if(r<=0)return i+1}return NP};
  function request(user,k){
    const t=now(),steps=[];let ms=0,val=null,by=null,srv=-1;
    const look=(name,map,lat)=>{ms+=lat;const e=map.get(k),fresh=e&&e.exp>t;st[name][1]++;if(fresh){st[name][0]++;steps.push([name,"hit"]);return e}steps.push([name,e?"expired":"miss"]);return null};
    if(S.browser.on){const e=look("browser",C.browser[user],LAT.browser);if(e){val=e;by="browser"}}
    if(!val){ms+=LAT.edge;if(S.cdn.on){const e=look("cdn",C.cdn,0);if(e){val=e;by="cdn"}}}
    if(!val){ms+=LAT.origin;if(S.proxy.on){const e=look("proxy",C.proxy,LAT.proxy);if(e){val=e;by="proxy"}}}
    if(!val){
      srv=rr;rr=(rr+1)%2;ms+=LAT.app;steps.push(["app",String(srv+1)]);
      if(S.inproc.on){const e=look("inproc",C.inproc[srv],LAT.inproc);if(e){val=e;by="inproc"}}
      if(!val){
        if(S.cache.on){if(down){ms+=LAT.cache;steps.push(["cache","down"])}else{const e=look("cache",C.cache,LAT.cache);if(e){val=e;by="cache"}}}
        if(!val){ms+=LAT.db;st.db++;steps.push(["db","read"]);val={v:db[k].v,price:db[k].price};by="db";
          if(S.cache.on&&!down){ms+=LAT.cache;C.cache.set(k,{v:val.v,price:val.price,exp:t+S.cache.ttl})}}
        if(S.inproc.on)C.inproc[srv].set(k,{v:val.v,price:val.price,exp:t+S.inproc.ttl});
      }
    }
    const reachedApp=srv>=0;
    if(S.proxy.on&&reachedApp)C.proxy.set(k,{v:val.v,price:val.price,exp:t+S.proxy.ttl});
    if(S.cdn.on&&(reachedApp||by==="proxy"))C.cdn.set(k,{v:val.v,price:val.price,exp:t+S.cdn.ttl});
    if(S.browser.on&&by!=="browser")C.browser[user].set(k,{v:val.v,price:val.price,exp:t+S.browser.ttl});
    const stale=val.v<latest[k].v;
    st.req++;st.lat+=ms;if(stale)st.stale++;
    const r={kind:"get",t,user,k,by,ms,v:val.v,price:val.price,stale,cur:latest[k].v,steps,srv};
    log.unshift(r);log=log.slice(0,14);last=r;
    flash=steps.map(s=>s[0]==="app"?"inproc":s[0]).filter((x,i,a)=>a.indexOf(x)===i);
    return r;
  }
  function write(k){
    const t=now();latest[k]={v:latest[k].v+1,price:latest[k].price+1};const nv={...latest[k]},notes=[],P=S.cache.pattern;
    if(!S.cache.on){db[k]=nv;notes.push("Saved to the database.")}
    else if(P==="aside"||P==="rt"){db[k]=nv;if(down)notes.push("Saved to the database, but the cache delete failed because the cache is unreachable. The old value stays cached until its TTL expires.");else{C.cache.delete(k);notes.push("Saved to the database and deleted the cache key.")}}
    else if(P==="wt"){db[k]=nv;if(down)notes.push("Saved to the database; the cache could not be updated.");else{C.cache.set(k,{...nv,exp:t+S.cache.ttl});notes.push("Saved to the database and wrote the new value into the cache.")}}
    else{if(down){db[k]=nv;notes.push("The cache is unreachable, so the app wrote to the database directly.")}else{C.cache.set(k,{...nv,exp:t+S.cache.ttl});pend.push({k,val:nv,at:t+5});notes.push("Written to the cache only. The database gets it in 5 seconds.")}}
    const up=[];if(S.browser.on)up.push("browsers");if(S.cdn.on)up.push("the CDN");if(S.proxy.on)up.push("the proxy");if(S.inproc.on)up.push("in-process caches");
    if(up.length)notes.push(`Copies in ${up.length>1?up.slice(0,-1).join(", ")+(up.length>2?",":"")+" and "+up[up.length-1]:up[0]} are not touched and serve the old price until their TTLs expire.`);
    const r={kind:"put",t,k,v:nv.v,price:nv.price,notes};log.unshift(r);log=log.slice(0,14);last=r;flash=["db"];
    return r;
  }
  function event(text){log.unshift({kind:"ev",t:now(),text});log=log.slice(0,14)}
  function flush(){const t=now();const due=pend.filter(p=>p.at<=t);if(!due.length)return false;pend=pend.filter(p=>p.at>t);due.forEach(p=>{if(p.val.v>db[p.k].v)db[p.k]=p.val;event(`Write-behind flush: product ${p.k} v${p.val.v} saved to the database.`)});return true}
  el.innerHTML=`<div class="sbx">
   <div class="box">
    <div class="ctlrow">
     <label class="lbl" for="sbuser">User</label><select id="sbuser">${USERS.map(u=>`<option>${u}</option>`).join("")}<option value="any">Random</option></select>
     <label class="lbl" for="sbprod">Product</label><select id="sbprod">${[...Array(NP)].map((_,i)=>`<option value="${i+1}">${i+1}</option>`).join("")}<option value="any">Random</option></select>
    </div>
    <div class="btnrow"><button type="button" class="btn primary" id="sbget">GET /products/1</button><button type="button" class="btn" id="sbburst">Send 25 random requests</button><button type="button" class="btn" id="sbput">Update the price</button></div>
    <div class="btnrow"><span class="clock" id="sbclock">Clock 00:00</span><button type="button" class="btn" id="sbskip">Skip ahead 30 s</button><button type="button" class="btn" id="sbpurge">Purge the CDN</button><button type="button" class="btn" id="sbrestart">Restart app servers</button><button type="button" class="btn" id="sbreset">Reset</button></div>
    <div class="mgrid" id="sbm"></div>
    <div class="sbresp" id="sbresp" aria-live="polite"></div>
   </div>
   <div class="cols mt">
    <div class="stack">
     <div class="box"><h3>The stack</h3><p class="note">Each card is one cache. Tap <b>Setup</b> on a card to see the code or configuration it needs. Faded entries have expired; amber entries are older than the current price.</p>
      <div id="sbstack">
       <div class="sbl" data-l="browser"><div class="sbh"><label><input type="checkbox" data-on="browser"> <b>Browser caches</b></label><span class="ttl">max-age <select data-ttl="browser">${TTLS.browser.map(v=>`<option value="${v}">${v} s</option>`).join("")}</select></span><span class="sp"></span><button type="button" class="linkbtn" data-code="browser">Setup</button></div><div class="sbstat" data-st="browser"></div><div class="sbc" data-c="browser"></div></div>
       <div class="sbconn">about 20 ms to the nearest CDN edge</div>
       <div class="sbl" data-l="cdn"><div class="sbh"><label><input type="checkbox" data-on="cdn"> <b>CDN edge</b></label><span class="ttl">s-maxage <select data-ttl="cdn">${TTLS.cdn.map(v=>`<option value="${v}">${v} s</option>`).join("")}</select></span><span class="sp"></span><button type="button" class="linkbtn" data-code="cdn">Setup</button></div><div class="sbstat" data-st="cdn"></div><div class="sbc" data-c="cdn"></div></div>
       <div class="sbconn">about 60 ms more to your origin data center</div>
       <div class="sbl" data-l="proxy"><div class="sbh"><label><input type="checkbox" data-on="proxy"> <b>Reverse proxy (NGINX)</b></label><span class="ttl">TTL <select data-ttl="proxy">${TTLS.proxy.map(v=>`<option value="${v}">${v} s</option>`).join("")}</select></span><span class="sp"></span><button type="button" class="linkbtn" data-code="proxy">Setup</button></div><div class="sbstat" data-st="proxy"></div><div class="sbc" data-c="proxy"></div></div>
       <div class="sbconn">load balancer sends requests to app servers in turn (round robin)</div>
       <div class="sbl" data-l="inproc"><div class="sbh"><label><input type="checkbox" data-on="inproc"> <b>App servers: in-process caches</b></label><span class="ttl">TTL <select data-ttl="inproc">${TTLS.inproc.map(v=>`<option value="${v}">${v} s</option>`).join("")}</select></span><span class="sp"></span><button type="button" class="linkbtn" data-code="inproc">Setup</button></div><div class="sbstat" data-st="inproc"></div><div class="sbsplit"><div><span class="who">Server 1</span><div class="sbc" data-c="inproc0"></div></div><div><span class="who">Server 2</span><div class="sbc" data-c="inproc1"></div></div></div></div>
       <div class="sbconn">about 0.5 ms network round trip</div>
       <div class="sbl" data-l="cache"><div class="sbh"><label><input type="checkbox" data-on="cache"> <b>Shared cache</b></label><span class="ttl">TTL <select data-ttl="cache">${TTLS.cache.map(v=>`<option value="${v}">${v} s</option>`).join("")}</select></span><span class="sp"></span><button type="button" class="linkbtn" data-code="cache">Setup</button></div>
        <div class="ctlrow">${seg("eng",[["redis","Redis"],["memcached","Memcached"]],S.cache.engine,"Cache engine")}<label class="lbl"><input type="checkbox" id="sbdown"> unreachable</label></div>
        <div class="ctlrow">${seg("pat2",Object.entries(PATN),S.cache.pattern,"Cache pattern")}</div>
        <div class="sbstat" data-st="cache"></div><div class="sbc" data-c="cache"></div><div class="sbc" data-c="pend"></div></div>
       <div class="sbconn">about 5 ms per query</div>
       <div class="sbl" data-l="db"><div class="sbh"><b>Database (the source of truth)</b><span class="sp"></span><button type="button" class="linkbtn" data-code="db">Setup</button></div><div class="sbstat" data-st="db"></div><div class="sbc" data-c="db"></div></div>
      </div>
     </div>
     <div class="box"><h4 class="m0">Request log</h4><ul class="sblog" id="sblog"></ul></div>
    </div>
    <div class="stack">
     <div class="box" id="sbcode"></div>
     <div class="box prose"><h3>Things to try</h3><ol class="steps">
      <li>Request product 1 as Alice twice. The second answer comes from her browser in about 1 ms.</li>
      <li>Request product 1 as Bob. His browser has nothing, but the CDN does: about 21 ms.</li>
      <li>Update the price of product 1, then request it as Alice and Bob. Both get the old price from their own browser caches. Ask as Cara: the CDN still serves the old price. Purge the CDN and ask as Cara again. If an app server's in-process copy has not expired, you can get the old price for a few more seconds.</li>
      <li>Turn off the browser and CDN caches and send 25 random requests. Watch the in-process and shared cache hit rates, and notice the two app servers holding different copies.</li>
      <li>Switch the pattern to write-behind, update a price, and mark the cache unreachable within 5 seconds. The write is lost.</li>
      <li>Turn every cache off and send 25 requests. Every one reaches the database, at about 87 ms each.</li>
     </ol><p class="note">Times are a simple model: about 20 ms to a nearby edge, 60 ms more to the origin, 2 ms of app work, 0.5 ms for the shared cache, and 5 ms per database query.</p></div>
    </div>
   </div>
  </div>`;
  const cc=()=>(!S.browser.on&&!S.cdn.on)?"no-store":"public, max-age="+(S.browser.on?S.browser.ttl:0)+(S.cdn.on?", s-maxage="+S.cdn.ttl:"");
  function codeFor(sel){
    const T=S.cache.ttl,P=S.cache.pattern,mem=S.cache.engine==="memcached";
    if(sel==="browser")return {h:"Browser cache",sub:"Set by the response headers your server sends. There is nothing to install.",b:[
     ["Express route (Node.js)",`app.get("/products/:id", async (req, res) => {
  const product = await getProduct(req.params.id);
  res.set("Cache-Control", "${cc()}");
  res.json(product);
});`],
     ["What the browser receives",`HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: ${cc()}
ETag: "v3"`],
     ["Static files with a hash in the name",`Cache-Control: public, max-age=31536000, immutable`]],
     n:["<code>max-age</code> is how long a browser keeps the response. <code>s-maxage</code> overrides it for shared caches such as a CDN or proxy.","You cannot purge a user's browser. Keep max-age short for data that changes, and put a version in file names for static files.","With an ETag, an expired copy is revalidated: the browser sends <code>If-None-Match</code> and gets <code>304 Not Modified</code> with no body if nothing changed.","Use <code>private</code> instead of <code>public</code> for responses that belong to one user, so shared caches never store them."]};
    if(sel==="cdn")return {h:"CDN edge",sub:"A managed service you configure. The origin's headers decide what it keeps, within the limits you set.",b:[
     ["AWS CDK (TypeScript): CloudFront in front of the origin",`import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const policy = new cloudfront.CachePolicy(this, "ProductCache", {
  defaultTtl: cdk.Duration.seconds(${S.cdn.ttl}),
  minTtl: cdk.Duration.seconds(0),
  maxTtl: cdk.Duration.days(1),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
});

new cloudfront.Distribution(this, "Api", {
  defaultBehavior: {
    origin: new origins.HttpOrigin("origin.example.com"),
    cachePolicy: policy,
  },
});`],
     ["Purge one path after an update",`aws cloudfront create-invalidation \\
  --distribution-id E1ABCDEF2GHIJK \\
  --paths "/products/3"`]],
     n:["CloudFront uses the origin's <code>s-maxage</code> or <code>max-age</code>, kept between minTtl and maxTtl. defaultTtl applies when the origin sends no caching headers.","The cache key decides what counts as the same response. Adding query strings, headers, or cookies to the key lowers the hit rate.","Point a DNS name such as <code>cdn.example.com</code> at the distribution.","Invalidations take a few minutes and are billed past a free monthly amount, so most sites rely on short TTLs or versioned URLs instead."]};
    if(sel==="proxy")return {h:"Reverse proxy cache (NGINX)",sub:"Runs in your data center in front of the app servers.",b:[
     ["nginx.conf",`proxy_cache_path /var/cache/nginx levels=1:2
                 keys_zone=api_cache:10m max_size=1g inactive=10m;

upstream app_servers {
  server app1:3000;
  server app2:3000;
}

server {
  listen 80;

  location /products/ {
    proxy_pass http://app_servers;
    proxy_cache api_cache;
    proxy_cache_valid 200 ${S.proxy.ttl}s;
    proxy_cache_lock on;
    proxy_cache_use_stale error timeout updating;
    add_header X-Cache-Status $upstream_cache_status;
  }
}`],
     ["Check it",`curl -I http://localhost:8080/products/3
X-Cache-Status: MISS
curl -I http://localhost:8080/products/3
X-Cache-Status: HIT`]],
     n:["<code>proxy_cache_path</code> stores responses on disk; <code>keys_zone</code> keeps the keys in memory (1 MB holds about 8,000 keys).","If the app sends <code>Cache-Control</code> or <code>Expires</code>, NGINX uses those instead of <code>proxy_cache_valid</code> unless you add <code>proxy_ignore_headers Cache-Control Expires;</code>.","<code>proxy_cache_lock</code> lets one request fill a missing entry while the others wait, which prevents a stampede.","<code>proxy_cache_use_stale</code> keeps serving the old copy if the app servers are down or slow."]};
    if(sel==="inproc")return {h:"In-process cache",sub:"A library inside each app server process. No extra system to run.",b:[
     ["Node.js with lru-cache",`import { LRUCache } from "lru-cache";

const local = new LRUCache({
  max: 10000,          // most entries to keep
  ttl: ${S.inproc.ttl*1000},          // milliseconds
});

async function getProduct(id) {
  const key = "product:" + id;
  const hit = local.get(key);
  if (hit) return hit;
  const product = await getFromSharedCacheOrDb(id);
  local.set(key, product);
  return product;
}`],
     ["Python with cachetools",`from cachetools import TTLCache

local = TTLCache(maxsize=10_000, ttl=${S.inproc.ttl})

def get_product(product_id):
    key = f"product:{product_id}"
    if key in local:
        return local[key]
    product = get_from_shared_cache_or_db(product_id)
    local[key] = product
    return product`]],
     n:["Each app server process has its own copy, so the same key can hold different values on different servers. Update a price in the sandbox and request it a few times to see this.","Nothing invalidates the other servers' copies, so keep the TTL to seconds. Some systems broadcast deletes over Redis pub/sub.","<code>max</code> bounds memory; when full, the least recently used entry is dropped.","A restart or deploy empties it."]};
    if(sel==="cache"){
      const run=mem?`docker run -d --name memcached -p 11211:11211 memcached:1.6 -m 256`:`docker run -d --name redis -p 6379:6379 redis:7 \\
  redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

redis-cli GET product:3
redis-cli TTL product:3
redis-cli INFO stats | grep keyspace`;
      const head=mem?`import memjs from "memjs";
import pg from "pg";

const mc = memjs.Client.create(process.env.MEMCACHED_SERVERS);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TTL = ${T};`:`import Redis from "ioredis";
import pg from "pg";

const redis = new Redis(process.env.REDIS_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TTL = ${T};`;
      const loadDb=`async function loadFromDb(id) {
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE id = $1", [id]);
  return rows[0];
}`;
      let read,writeC,extra=null;
      if(mem){
        read=P==="rt"?`async function cached(key, load) {
  const { value } = await mc.get(key);
  if (value) return JSON.parse(value.toString());
  const fresh = await load();
  await mc.set(key, JSON.stringify(fresh), { expires: TTL });
  return fresh;
}

const getProduct = (id) =>
  cached("product:" + id, () => loadFromDb(id));`:`async function getProduct(id) {
  const key = "product:" + id;
  try {
    const { value } = await mc.get(key);
    if (value) return JSON.parse(value.toString());
  } catch (err) {
    // cache unreachable: fall through to the database
  }
  const product = await loadFromDb(id);
  mc.set(key, JSON.stringify(product), { expires: TTL }).catch(() => {});
  return product;
}`;
        writeC=(P==="wt"||P==="wb")?`async function updatePrice(id, price) {
  const { rows } = await pool.query(
    "UPDATE products SET price = $1, version = version + 1 WHERE id = $2 RETURNING *",
    [price, id]);
  await mc.set("product:" + id, JSON.stringify(rows[0]), { expires: TTL });
}`:`async function updatePrice(id, price) {
  await pool.query(
    "UPDATE products SET price = $1, version = version + 1 WHERE id = $2",
    [price, id]);
  await mc.delete("product:" + id);
}`;
      }else{
        read=P==="aside"?`async function getProduct(id) {
  const key = "product:" + id;
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  } catch (err) {
    // cache unreachable: fall through to the database
  }
  const product = await loadFromDb(id);
  redis.set(key, JSON.stringify(product), "EX", TTL).catch(() => {});
  return product;
}`:`// Callers only talk to the cache; it loads from the database on a miss
async function cached(key, load) {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const fresh = await load();
  await redis.set(key, JSON.stringify(fresh), "EX", TTL);
  return fresh;
}

const getProduct = (id) =>
  cached("product:" + id, () => loadFromDb(id));`;
        if(P==="aside"||P==="rt")writeC=`async function updatePrice(id, price) {
  await pool.query(
    "UPDATE products SET price = $1, version = version + 1 WHERE id = $2",
    [price, id]);
  await redis.del("product:" + id);
}`;
        else if(P==="wt")writeC=`async function updatePrice(id, price) {
  const { rows } = await pool.query(
    "UPDATE products SET price = $1, version = version + 1 WHERE id = $2 RETURNING *",
    [price, id]);
  await redis.set("product:" + id, JSON.stringify(rows[0]), "EX", TTL);
}`;
        else{writeC=`async function updatePrice(id, price) {
  const product = { ...(await getProduct(id)), price };
  await redis.multi()
    .set("product:" + id, JSON.stringify(product), "EX", TTL)
    .rpush("pending_writes", JSON.stringify(product))
    .exec();
}`;extra=["Worker that flushes queued writes",`setInterval(async () => {
  const items = await redis.lrange("pending_writes", 0, 99);
  for (const item of items) {
    const p = JSON.parse(item);
    await pool.query(
      "UPDATE products SET price = $1 WHERE id = $2", [p.price, p.id]);
  }
  if (items.length) await redis.ltrim("pending_writes", items.length, -1);
}, 5000);`]}
      }
      const b=[["Run it locally",run],["Setup",head+"\n\n"+loadDb],["Read path: "+PATN[P],read],["Write path",writeC]];if(extra)b.push(extra);
      const n=[`TTL is ${T} seconds. Entries also leave early when memory is full, using the eviction policy (LRU here).`];
      if(P==="aside")n.push("Cache-aside: the app checks the cache, loads from the database on a miss, and deletes the key on writes. If the cache is down, reads still work through the database.");
      if(P==="rt")n.push("Read-through: callers ask the cache wrapper, and the wrapper loads from the database on a miss. Writes still go to the database and delete the key.");
      if(P==="wt")n.push("Write-through: every write updates the database and then the cache in the same request, so the cache holds the new value right away.");
      if(P==="wb")n.push(mem?"Memcached has no lists or persistence, so a write-behind queue needs Redis, Kafka, or SQS. The code shows write-through as the Memcached equivalent.":"Write-behind: writes land in Redis and a queue. A worker saves them to the database later, so a Redis failure before the flush loses those writes.");
      n.push(mem?"Memcached servers do not talk to each other. List several in <code>MEMCACHED_SERVERS</code> and the client spreads keys across them.":"For more memory or throughput, Redis Cluster spreads keys across nodes by hash slot.");
      return {h:mem?"Shared cache: Memcached":"Shared cache: Redis",sub:"A separate system that every app server connects to over the network.",b,n};
    }
    if(sel==="db")return {h:"Database buffer cache (PostgreSQL)",sub:"Built into the database. You size it; no application code is involved.",b:[
     ["postgresql.conf",`shared_buffers = 4GB          # about 25% of the server's RAM
effective_cache_size = 12GB   # memory the OS has for caching files`],
     ["Check the hit rate",`SELECT round(sum(blks_hit) * 100.0
       / nullif(sum(blks_hit) + sum(blks_read), 0), 2) AS hit_pct
FROM pg_stat_database;`]],
     n:["PostgreSQL keeps recently used table and index pages in <code>shared_buffers</code>, and the operating system caches files on top of that.","Teams often aim for a hit rate above 99%. A lower rate means the data being used does not fit in memory.","MySQL's equivalent is <code>innodb_buffer_pool_size</code>, often set to 50 to 75% of RAM on a dedicated server."]};
    return {h:"Run the whole stack locally",sub:"Docker Compose starts every server-side cache in this sandbox on your computer.",b:[
     ["docker-compose.yml",`services:
  nginx:
    image: nginx:1.27
    ports: ["8080:80"]
    volumes: ["./nginx.conf:/etc/nginx/conf.d/default.conf:ro"]
    depends_on: [app1, app2]

  app1: &app
    build: ./app
    environment:
      REDIS_URL: redis://redis:6379
      MEMCACHED_SERVERS: memcached:11211
      DATABASE_URL: postgres://postgres:postgres@db:5432/shop
    depends_on: [redis, memcached, db]
  app2: *app

  redis:
    image: redis:7
    command: ["redis-server", "--maxmemory", "256mb",
              "--maxmemory-policy", "allkeys-lru"]

  memcached:
    image: memcached:1.6
    command: ["memcached", "-m", "256"]

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: shop`],
     ["Try it",`docker compose up -d
curl -I http://localhost:8080/products/3
docker compose exec redis redis-cli MONITOR
docker compose exec redis redis-cli INFO stats`]],
     n:["<code>nginx.conf</code> is the file in the Reverse proxy tab. The <code>app</code> folder is an Express app using the code in the In-process and Shared cache tabs.","<code>MONITOR</code> prints every command Redis receives, so you can watch GET and SET calls as you send requests.","The browser and CDN layers are not part of this setup: browsers cache by themselves when they see the headers, and a CDN is a hosted service."]};
  }
  function renderCode(){
    const o=codeFor(codeSel),opts=[["browser","Browser"],["cdn","CDN"],["proxy","Proxy"],["inproc","In-process"],["cache","Shared cache"],["db","Database"],["stack","Full stack"]];
    $("#sbcode",el).innerHTML=`<div class="ctlrow">${seg("code",opts,codeSel,"Setup code for")}</div><h3>${o.h}</h3><p class="note">${o.sub}</p>${o.b.map(([t,c])=>`<p class="grp">${esc(t)}</p><div class="codewrap"><pre class="code">${esc(c)}</pre><button type="button" class="btn copyb" data-copy>Copy</button></div>`).join("")}<ul class="plain small">${o.n.map(x=>`<li>${x}</li>`).join("")}</ul>`;
    onSeg($("#sbcode",el),"code",v=>{codeSel=v;store("sbxCode",v);renderCode()});
  }
  const chip=(k,e,t)=>{const ex=e.exp<=t,old=e.v<latest[k].v;return `<span class="ck${ex?" exp":""}${old&&!ex?" old":""}" title="product ${k}, version ${e.v}, $${e.price}">P${k} v${e.v} ${ex?"expired":Math.ceil(e.exp-t)+"s"}</span>`};
  const chips=(m,t)=>{const a=[...m.entries()].sort((x,y)=>x[0]-y[0]);return a.length?a.map(([k,e])=>chip(k,e,t)).join(""):`<span class="note">empty</span>`};
  const hr=([h,n])=>`<span>hits ${h} of ${n}${n?` (${Math.round(h/n*100)}%)`:""}</span><span class="hbar"><i style="width:${n?h/n*100:0}%"></i></span>`;
  function renderDyn(){
    const t=now();
    $("#sbclock",el).textContent="Clock "+mmss(t);
    ["browser","cdn","proxy","inproc","cache"].forEach(l=>{$(`[data-st="${l}"]`,el).innerHTML=hr(st[l]);$(`[data-l="${l}"]`,el).classList.toggle("off",!S[l].on)});
    $('[data-c="browser"]',el).innerHTML=USERS.map(u=>`<div class="sbrow"><span class="who">${u}</span>${chips(C.browser[u],t)}</div>`).join("");
    $('[data-c="cdn"]',el).innerHTML=chips(C.cdn,t);$('[data-c="proxy"]',el).innerHTML=chips(C.proxy,t);
    $('[data-c="inproc0"]',el).innerHTML=chips(C.inproc[0],t);$('[data-c="inproc1"]',el).innerHTML=chips(C.inproc[1],t);
    $('[data-c="cache"]',el).innerHTML=down?`<span class="pill bad">unreachable</span> ${chips(C.cache,t)}`:chips(C.cache,t);
    $('[data-c="pend"]',el).innerHTML=pend.length?`<span class="who">Queued for the database:</span>`+pend.map(p=>`<span class="ck old">P${p.k} v${p.val.v} in ${Math.max(0,Math.ceil(p.at-t))}s</span>`).join(""):"";
    $('[data-st="db"]',el).innerHTML=`<span>reads ${st.db}</span>`;
    $('[data-c="db"]',el).innerHTML=Object.keys(db).map(k=>`<span class="ck${db[k].v<latest[k].v?" old":""}">P${k} $${db[k].price} v${db[k].v}</span>`).join("");
    $$(".sbl",el).forEach(c=>{c.classList.remove("pass","ans")});
    if(last&&now()-last.t<1.6){flash.forEach(l=>{const c=$(`[data-l="${l}"]`,el);if(c)c.classList.add("pass")});const a=$(`[data-l="${last.kind==="put"?"db":last.by}"]`,el);if(a)a.classList.add("ans")}
  }
  const pname={browser:"Browser",cdn:"CDN",proxy:"Proxy",inproc:"In-process",cache:"Shared cache",db:"Database"};
  const pathHTML=r=>`<div class="pathc">${r.steps.map(([l,res])=>l==="app"?`<span>App server ${res}</span>`:res==="hit"?`<span class="h">${pname[l]} hit</span>`:res==="down"?`<span class="x">${pname[l]} unreachable</span>`:res==="read"?`<span class="h">Database read</span>`:`<span class="m">${pname[l]} ${res}</span>`).join("")}</div>`;
  function renderStatic(){
    const avg=st.req?st.lat/st.req:0,M=(l,v)=>`<div class="m"><small>${l}</small><b>${v}</b></div>`;
    $("#sbm",el).innerHTML=M("Requests",st.req)+M("Average time",fmt(avg,1)+" ms")+M("Database reads",st.db)+M("Stale answers",st.stale);
    const r=last;
    $("#sbresp",el).innerHTML=!r?`Send a request to see which layer answers it.`:r.kind==="put"?`<b>Product ${r.k}</b> now costs <b>$${r.price}</b> (v${r.v}). ${r.notes.join(" ")}`:
      `<b>${r.user}</b> asked for product ${r.k} and got <b>$${r.price} (v${r.v})</b> from the <b>${LN[r.by]}</b> in <b>${fmt(r.ms,1)} ms</b>. ${r.stale?`<span class="pill bad">stale</span> The current version is v${r.cur}.`:`<span class="pill ok">current</span>`}${pathHTML(r)}`;
    $("#sblog",el).innerHTML=log.map(x=>`<li><span class="tm">${mmss(x.t)}</span>${x.kind==="get"?`GET product ${x.k} by ${x.user}: ${LN[x.by]}, ${fmt(x.ms,1)} ms${x.stale?` <span class="pill bad">stale v${x.v}</span>`:""}`:x.kind==="put"?`<b>Price update</b> product ${x.k} to $${x.price} (v${x.v})`:esc(x.text)}</li>`).join("")||`<li class="note">No requests yet.</li>`;
    const p=$("#sbprod",el).value;$("#sbget",el).textContent=`GET /products/${p==="any"?"{random}":p}`;
  }
  const render=()=>{renderStatic();renderDyn()};
  function syncControls(){
    ["browser","cdn","proxy","inproc","cache"].forEach(l=>{$(`[data-on="${l}"]`,el).checked=S[l].on;$(`[data-ttl="${l}"]`,el).value=String(S[l].ttl)});
    $("#sbdown",el).checked=down;
  }
  const userSel=()=>{const u=$("#sbuser",el).value;return u==="any"?USERS[Math.floor(Math.random()*3)]:u};
  const prodSel=()=>{const p=$("#sbprod",el).value;return p==="any"?pick():Number(p)};
  function stopBurst(){burst.forEach(clearTimeout);burst=[]}
  $("#sbget",el).onclick=()=>{request(userSel(),prodSel());render()};
  $("#sbburst",el).onclick=()=>{stopBurst();for(let i=0;i<25;i++){const f=()=>{request(USERS[Math.floor(Math.random()*3)],pick());render()};if(RM)f();else burst.push(setTimeout(f,i*110))}};
  $("#sbput",el).onclick=()=>{write(prodSel());render()};
  $("#sbskip",el).onclick=()=>{clock+=30;flush();event("Skipped ahead 30 seconds.");render()};
  $("#sbpurge",el).onclick=()=>{C.cdn.clear();event("Purged every object from the CDN.");render()};
  $("#sbrestart",el).onclick=()=>{C.inproc=[new Map(),new Map()];event("Restarted both app servers; their in-process caches are empty.");render()};
  $("#sbreset",el).onclick=()=>{stopBurst();down=false;init();syncControls();render()};
  $("#sbprod",el).onchange=renderStatic;
  $("#sbdown",el).onchange=ev=>{down=ev.target.checked;if(down){const lost=pend.filter(p=>p.val.v>db[p.k].v);if(lost.length){lost.forEach(p=>{latest[p.k]={...db[p.k]}});C.cache.clear();event(`The cache went down with ${lost.length} queued write${lost.length>1?"s":""} not yet saved, and its memory was lost. ${lost.map(p=>"Product "+p.k+" v"+p.val.v).join(", ")}: gone; the database still has the old price.`)}else event("The shared cache is unreachable.");pend=[]}else event("The shared cache is reachable again. Anything it held while unreachable may be out of date.");render()};
  $("#sbstack",el).addEventListener("change",ev=>{const t=ev.target;if(t.dataset.on){S[t.dataset.on].on=t.checked;save();renderCode();render()}if(t.dataset.ttl){S[t.dataset.ttl].ttl=Number(t.value);save();renderCode();render()}});
  $("#sbstack",el).addEventListener("click",ev=>{const b=ev.target.closest("[data-code]");if(b){codeSel=b.dataset.code;store("sbxCode",codeSel);renderCode();if(matchMedia("(max-width: 880px)").matches)$("#sbcode",el).scrollIntoView({behavior:RM?"auto":"smooth",block:"start"})}});
  onSeg(el,"eng",v=>{S.cache.engine=v;save();codeSel="cache";renderCode()});
  onSeg(el,"pat2",v=>{S.cache.pattern=v;save();if(v!=="wb"&&pend.length){pend.forEach(p=>{if(p.val.v>db[p.k].v)db[p.k]=p.val});pend=[]}codeSel="cache";renderCode();render()});
  $("#sbcode",el).addEventListener("click",ev=>{const b=ev.target.closest("[data-copy]");if(!b)return;const pre=b.previousElementSibling;const done=()=>{b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1400)};
    try{navigator.clipboard.writeText(pre.textContent).then(done,()=>{const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent="Selected"})}catch(e){const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent="Selected"}});
  init();syncControls();renderCode();render();
  tick=setInterval(()=>{const t=now();for(const m of [C.cdn,C.proxy,C.cache,...C.inproc,...Object.values(C.browser)])for(const [k,e] of m)if(e.exp<t-20)m.delete(k);flush();if(!$("#sbresp",el))return;render()},1000);
  return ()=>{clearInterval(tick);stopBurst()};
},
compare(el){
  el.innerHTML=`<div class="stack">
   <div class="box"><h3>Redis vs Memcached</h3>
    <div class="tablewrap"><table><thead><tr><th></th><th>Redis</th><th>Memcached</th></tr></thead><tbody>
     <tr><th>Data types</th><td>Strings, hashes, lists, sets, sorted sets, streams, bitmaps</td><td>Strings (bytes) only</td></tr>
     <tr><th>Threads</th><td>Commands run on one main thread (optional I/O threads)</td><td>Multithreaded</td></tr>
     <tr><th>Persistence</th><td>Optional RDB snapshots and an append-only log (AOF)</td><td>None; data is gone after a restart</td></tr>
     <tr><th>Replication and failover</th><td>Replicas, Sentinel, Redis Cluster</td><td>None built in</td></tr>
     <tr><th>Scaling out</th><td>Redis Cluster spreads 16,384 hash slots across nodes</td><td>The client library spreads keys across servers with consistent hashing</td></tr>
     <tr><th>Atomic operations</th><td>INCR, EXPIRE, MULTI transactions, Lua scripts</td><td>incr, decr, add, CAS (check and set)</td></tr>
     <tr><th>Eviction</th><td>Configurable: allkeys-lru, allkeys-lfu, volatile-ttl, and others</td><td>LRU</td></tr>
     <tr><th>Largest value</th><td>512 MB</td><td>1 MB by default</td></tr>
     <tr><th>Rate limiter fit</th><td>All four algorithms</td><td>Fixed window counters; other algorithms need extra round trips</td></tr>
     <tr><th>Typical use</th><td>Cache, sessions, counters, leaderboards, queues, pub/sub</td><td>A large, simple object cache</td></tr>
    </tbody></table></div>
    <p class="note">Valkey is an open source fork of Redis with the same commands. Amazon ElastiCache and similar services run either engine for you.</p>
   </div>
   <div class="box"><h3>In-process cache vs distributed cache</h3>
    <div class="tablewrap"><table><thead><tr><th></th><th>In-process (inside each app server)</th><th>Distributed (Redis, Memcached)</th></tr></thead><tbody>
     <tr><th>Speed</th><td>About 100 ns, no network</td><td>About 0.5 ms network round trip</td></tr>
     <tr><th>Shared between servers</th><td>No, each server has its own copy</td><td>Yes, one copy for everyone</td></tr>
     <tr><th>After a deploy or restart</th><td>Empty</td><td>Still filled</td></tr>
     <tr><th>Size limit</th><td>Part of one server's RAM</td><td>Grows by adding nodes</td></tr>
     <tr><th>Consistency</th><td>Servers can disagree until the TTL expires</td><td>One value for everyone</td></tr>
     <tr><th>Examples</th><td>Caffeine (Java), cachetools (Python), an LRU map</td><td>Redis, Valkey, Memcached</td></tr>
     <tr><th>Good for</th><td>Small, rarely changing data and the most frequent keys</td><td>Most shared caching</td></tr>
    </tbody></table></div>
    <div class="callout">A common setup is a small in-process cache with a TTL of a few seconds, in front of Redis, in front of the database.</div>
   </div>
  </div>`;
}
};

/* ---------- rate limiting ---------- */
TABS.ratelimit={
sim(el){
  const LIMIT=5,WIN=10,RATE=LIMIT/WIN,SPAN=30;
  const ALG={
   fixed:{name:"Fixed window",how:"Time is cut into fixed 10-second windows (0 to 10 s, 10 to 20 s, and so on), each with one counter. Requests are allowed until the counter reaches 5, and the count starts over in the next window.",
    good:"One small counter per user: <code>INCR</code> plus <code>EXPIRE</code> in Redis.",
    cost:"Up to twice the limit can pass around a window boundary. Run the window edge test to see 10 requests allowed within about one second."},
   log:{name:"Sliding window log",how:"The timestamp of every allowed request is stored. On each new request, timestamps older than 10 seconds are removed, and the request is allowed if fewer than 5 remain.",
    good:"Exact: there are never more than 5 allowed requests in any 10-second span.",
    cost:"Memory grows with the limit, one entry per request. With high limits and many users this reaches gigabytes (see the memory tab)."},
   counter:{name:"Sliding window counter",how:"Keeps counts for the current and previous fixed windows and estimates the rolling count as current + previous × (the share of the previous window still inside the last 10 seconds). The request is allowed if the estimate plus this request is at most 5.",
    good:"Two counters per user and no burst at the window boundary. Cloudflare uses this approach.",
    cost:"It is an estimate: it assumes requests in the previous window were spread evenly."},
   token:{name:"Token bucket",how:"A bucket holds up to 5 tokens and refills at 0.5 tokens per second. Each request takes one token; with none left, the request is rejected. The refill is calculated when a request arrives, so no background job is needed.",
    good:"Allows short bursts up to the bucket size while holding the long-run rate. Two values per user. Used by Stripe and AWS API Gateway.",
    cost:"Two settings to choose (bucket size and refill rate), and a full bucket lets a whole burst through at once."}
  };
  let algo=store("rlAlgo");if(!ALG[algo])algo="fixed";
  let times=[1.0,2.6,4.0,4.12,4.24,4.36,4.48,4.6,8.2,10.6,11.1],pending=[],note="";
  let base=performance.now()-12000,paused=null,raf=null,lastDraw=0;
  const now=()=>paused!==null?paused:(performance.now()-base)/1000;
  function run(alg,T){
    const res=[];
    if(alg==="fixed"){const c={};for(const t of times){if(t>T)break;const w=Math.floor(t/WIN),n=c[w]||0,ok=n<LIMIT;if(ok)c[w]=n+1;res.push({t,ok})}
      const w=Math.floor(T/WIN);return {res,st:{w,used:c[w]||0,resetIn:(w+1)*WIN-T}}}
    if(alg==="log"){let lg=[];for(const t of times){if(t>T)break;lg=lg.filter(x=>x>t-WIN);const ok=lg.length<LIMIT;if(ok)lg.push(t);res.push({t,ok})}
      return {res,st:{log:lg.filter(x=>x>T-WIN)}}}
    if(alg==="counter"){const c={};for(const t of times){if(t>T)break;const w=Math.floor(t/WIN),f=(t-w*WIN)/WIN,est=(c[w]||0)+(c[w-1]||0)*(1-f),ok=est+1<=LIMIT+1e-9;if(ok)c[w]=(c[w]||0)+1;res.push({t,ok})}
      const w=Math.floor(T/WIN),f=(T-w*WIN)/WIN,curr=c[w]||0,prev=c[w-1]||0;return {res,st:{w,f,curr,prev,est:curr+prev*(1-f)}}}
    let tok=LIMIT,last=0;
    for(const t of times){if(t>T)break;tok=Math.min(LIMIT,tok+(t-last)*RATE);last=t;const ok=tok>=1-1e-9;if(ok)tok-=1;res.push({t,ok,after:tok})}
    return {res,st:{tok:Math.min(LIMIT,tok+(T-last)*RATE),stored:tok,last}};
  }
  el.innerHTML=`<div class="cols">
   <div class="box">
    <div class="ctlrow"><span class="lbl">Algorithm</span>${seg("alg",[["fixed","Fixed window"],["log","Sliding log"],["counter","Sliding counter"],["token","Token bucket"]],algo,"Algorithm")}</div>
    <p class="note">Rule: 5 requests per 10 seconds for user 42. The clock is running and each mark is one request: <span class="pill ok">● allowed</span> <span class="pill bad">✕ rejected with 429</span></p>
    <div class="svgwrap"><svg class="fig tl" id="tl" viewBox="0 0 640 136" role="img" aria-label="Timeline of requests over the last 30 seconds"></svg></div>
    <div class="btnrow">
     <button type="button" class="btn primary" id="r1">Send 1 request</button>
     <button type="button" class="btn" id="r5">Send a burst of 5</button>
     <button type="button" class="btn" id="redge">Window edge test</button>
     <button type="button" class="btn" id="rpause">Pause</button>
     <button type="button" class="btn" id="rclear">Clear</button>
    </div>
    <p class="stepcap" id="rnote" aria-live="polite"></p>
    <div class="mgrid"><div class="m"><small>Allowed</small><b id="rok">0</b></div><div class="m"><small>Rejected</small><b id="rno">0</b></div><div class="m"><small>Last request</small><b id="rlast">none</b></div></div>
   </div>
   <div class="stack">
    <div class="box"><h3 id="aname"></h3><p id="ahow"></p><dl class="fields"><dt>Benefit</dt><dd id="agood"></dd><dt>Cost</dt><dd id="acost"></dd></dl></div>
    <div class="box"><h4 class="m0">State right now</h4><p id="astate"></p><pre class="code" id="aredis"></pre><p class="note">Switching algorithms replays the same requests, so you can compare which ones each algorithm allows.</p></div>
   </div>
  </div>`;
  function info(){const a=ALG[algo];$("#aname",el).textContent=a.name;$("#ahow",el).innerHTML=a.how;$("#agood",el).innerHTML=a.good;$("#acost",el).innerHTML=a.cost}
  function tokAt(ev,s){let lo=0,hi=ev.length-1,k=-1;while(lo<=hi){const m=(lo+hi)>>1;if(ev[m].t<=s){k=m;lo=m+1}else hi=m-1}
    if(k<0)return LIMIT;return Math.min(LIMIT,ev[k].after+(s-ev[k].t)*RATE)}
  function draw(){
    const narrow=$("#tl",el).getBoundingClientRect().width<520,W=narrow?420:640,SP=narrow?20:SPAN;
    const T=now(),{res,st}=run(algo,T),t0=T-SP,X0=40,X1=W-18,x=t=>X0+(t-t0)/SP*(X1-X0);
    const H=algo==="token"?178:136;$("#tl",el).setAttribute("viewBox",`0 0 ${W} ${H}`);
    let s="";
    if(algo==="log"||algo==="counter")s+=`<rect class="win" x="${x(T-WIN)}" y="26" width="${x(T)-x(T-WIN)}" height="80" rx="4"/><text class="mu" x="${x(T-WIN)+5}" y="40">last 10 s</text>`;
    if(algo==="fixed"||algo==="counter"){
      const cnt={};res.forEach(r=>{if(r.ok){const w=Math.floor(r.t/WIN);cnt[w]=(cnt[w]||0)+1}});
      for(let w=Math.ceil(t0/WIN)*WIN;w<=T;w+=WIN)if(w>=0)s+=`<line class="gridd" x1="${x(w)}" y1="24" x2="${x(w)}" y2="108"/>`;
      for(let w=Math.floor(Math.max(0,t0)/WIN);w*WIN<=T;w++){const a=Math.max(t0,w*WIN),b=Math.min(T,(w+1)*WIN);if(x(b)-x(a)<44)continue;s+=`<text class="mu mono" x="${(x(a)+x(b))/2}" y="17" text-anchor="middle">${cnt[w]||0}/5</text>`}
    }
    let pt=-1e9,k=0;
    res.forEach(r=>{if(r.t<t0)return;k=(r.t-pt<0.35)?k+1:0;pt=r.t;const yy=68+[0,-13,13,-26,26][k%5],xx=x(r.t).toFixed(1);
      s+=r.ok?`<circle class="okdot" cx="${xx}" cy="${yy}" r="5"/>`:`<path class="baddot" d="M${xx-4},${yy-4} L${+xx+4},${yy+4} M${+xx+4},${yy-4} L${xx-4},${yy+4}"/>`});
    s+=`<line class="grid" x1="${X0}" y1="110" x2="${X1}" y2="110"/><line class="nowl" x1="${X1}" y1="10" x2="${X1}" y2="110"/>`;
    (narrow?[20,10,0]:[30,20,10,0]).forEach(d=>{const xx=x(T-d);s+=`<line class="grid" x1="${xx}" y1="110" x2="${xx}" y2="115"/><text class="mu" x="${xx}" y="128" text-anchor="${d===0?"end":d===SP?"start":"middle"}">${d===0?"now":d+" s ago"}</text>`});
    if(algo==="token"){
      const yT=v=>172-(v/LIMIT)*30,samp=[];
      for(let q=Math.max(0,t0);q<=T;q+=0.25)samp.push(q);
      res.forEach(r=>{if(r.t>=t0){samp.push(r.t-1e-6,r.t+1e-6)}});samp.push(T);samp.sort((a,b)=>a-b);
      const pts=samp.filter(q=>q>=0).map(q=>[x(q).toFixed(1),yT(tokAt(res,q)).toFixed(1)]);
      if(pts.length){s+=`<path class="tokarea" d="M${pts[0][0]},172 L${pts.map(p=>p.join(",")).join(" L")} L${pts[pts.length-1][0]},172 Z"/><path class="tokline" d="M${pts.map(p=>p.join(",")).join(" L")}"/>`}
      s+=`<line class="grid" x1="${X0}" y1="172" x2="${X1}" y2="172"/><text class="mu" x="${X0}" y="137">tokens in the bucket (0 to 5)</text><text class="mu mono" x="${X0-4}" y="146" text-anchor="end">5</text><text class="mu mono" x="${X0-4}" y="175" text-anchor="end">0</text>`;
    }
    $("#tl",el).innerHTML=s;
    const okN=res.filter(r=>r.ok).length;$("#rok",el).textContent=okN;$("#rno",el).textContent=res.length-okN;
    const L=res[res.length-1];$("#rlast",el).innerHTML=L?(L.ok?`<span class="ok">allowed</span>`:`<span class="bad">429</span>`):"none";
    let sh="",rd="";
    if(algo==="fixed"){sh=`Window ${st.w} covers ${st.w*WIN} s to ${(st.w+1)*WIN} s. <b>${st.used} of ${LIMIT}</b> used. The counter resets in ${st.resetIn.toFixed(1)} s.`;rd=`GET rl:user42:${st.w}\n→ ${st.used}   (TTL ${Math.ceil(st.resetIn)} s)`}
    else if(algo==="log"){sh=`Timestamps in the last 10 s: <b>${st.log.length} of ${LIMIT}</b>. The next request is ${st.log.length<LIMIT?"allowed":`rejected until ${(st.log[0]+WIN-T).toFixed(1)} s from now`}.`;rd=`ZRANGE rl:user42 0 -1 WITHSCORES\n→ [${st.log.map(t=>t.toFixed(1)).join(", ")}]   (seconds)`}
    else if(algo==="counter"){const w2=(1-st.f).toFixed(2);sh=`Current window ${st.curr}, previous window ${st.prev}, ${Math.round(st.f*100)}% of the way through the current window. Estimate = ${st.curr} + ${st.prev} × ${w2} = <b>${st.est.toFixed(2)}</b>. The next request is ${st.est+1<=LIMIT+1e-9?"allowed":"rejected"}.`;rd=`GET rl:user42:${st.w}\n→ ${st.curr}\nGET rl:user42:${st.w-1}\n→ ${st.prev}`}
    else{sh=`<b>${st.tok.toFixed(2)} of ${LIMIT}</b> tokens. ${st.tok>=1?"The next request is allowed.":`The next token arrives in ${((1-st.tok)/RATE).toFixed(1)} s.`}`;rd=`HGETALL rl:user42\n→ tokens ${st.stored.toFixed(2)}, ts ${st.last.toFixed(1)}\n(refill is added when the next request reads it)`}
    $("#astate",el).innerHTML=sh;$("#aredis",el).textContent=rd;
    $("#rnote",el).innerHTML=note;
  }
  function loop(ts){raf=requestAnimationFrame(loop);const T=now();let moved=false;while(pending.length&&pending[0]<=T){times.push(pending.shift());moved=true}if(!moved&&ts-lastDraw<90)return;lastDraw=ts;draw()}
  function add(list){pending.push(...list);pending.sort((a,b)=>a-b)}
  $("#r1",el).onclick=()=>{note="";times.push(now());draw()};
  $("#r5",el).onclick=()=>{note="";const T=now();times.push(T);add([1,2,3,4].map(i=>T+i*0.07))};
  $("#redge",el).onclick=()=>{const T=now();let B=Math.ceil((T+1.4)/WIN)*WIN;const L=[];for(let i=0;i<5;i++)L.push(B-0.7+i*0.08);for(let i=0;i<5;i++)L.push(B+0.15+i*0.08);add(L);
    if(paused!==null){paused=null;base=performance.now()-T*1000;$("#rpause",el).textContent="Pause"}
    note=`Scheduled 5 requests just before the boundary at ${B} s and 5 just after. Fixed window allows all 10; the other three algorithms reject the second group. Switch algorithms afterward to compare.`};
  $("#rpause",el).onclick=ev=>{if(paused===null){paused=now();ev.target.textContent="Resume"}else{base=performance.now()-paused*1000;paused=null;ev.target.textContent="Pause"}};
  $("#rclear",el).onclick=()=>{times=[];pending=[];note="";base=performance.now();if(paused!==null){paused=0}draw()};
  onSeg(el,"alg",v=>{algo=v;store("rlAlgo",v);info();draw()});
  info();draw();raf=requestAnimationFrame(loop);
  return ()=>{if(raf)cancelAnimationFrame(raf)};
},
where(el){
  el.innerHTML=`<div class="cols">
   <div class="stack">
    <div class="box prose"><h3>Where the rate limiter sits</h3>
     <ol class="steps">
      <li>The request reaches the load balancer, which passes it to an API gateway instance.</li>
      <li>The gateway identifies the caller (user ID from the auth token, API key, or IP address) and finds the matching rule, such as 100 requests per minute for the free plan.</li>
      <li>It updates that caller's counter in Redis with one atomic command or Lua script.</li>
      <li>Under the limit: the request continues to the app servers. Over the limit: the gateway returns 429 right away.</li>
     </ol>
     <h4>Rules and counters are stored separately</h4>
     <dl class="fields"><dt>Rules</dt><dd>Change rarely. Stored in a config file or database, loaded into each gateway's memory, and refreshed every few seconds or minutes. Reading them never touches Redis.</dd>
     <dt>Counters</dt><dd>Change on every request and must be shared by every gateway instance, so they live in Redis with a TTL.</dd></dl>
     <h4>Other places a limiter can run</h4>
     <ul class="plain">
      <li><b>Client:</b> useful to avoid wasted calls, but anyone can bypass it, so it is never the only limit.</li>
      <li><b>Middleware in each app server:</b> works for a single service, but every service repeats the logic.</li>
      <li><b>Sidecar or service mesh (Envoy):</b> each service gets the same limiter, calling a shared rate limit service.</li>
     </ul>
     <h4>Decisions to state in an interview</h4>
     <ul class="plain">
      <li><b>Key:</b> user ID for logged-in traffic, IP address for anonymous traffic such as login pages.</li>
      <li><b>Failure mode:</b> if Redis is unreachable, fail open (allow traffic) or fail closed (block it). Most public APIs fail open.</li>
      <li><b>Local vs global:</b> a counter in each gateway's memory is faster but each instance only sees its own traffic. A shared Redis counter enforces one global limit.</li>
      <li><b>Multiple regions:</b> each region usually keeps its own counters, because a cross-region call on every request is too slow.</li>
     </ul>
    </div>
   </div>
   <div class="stack">
    <div class="box"><h4 class="m0">Example rule file</h4><p class="note">The format used by the open source envoyproxy/ratelimit service.</p>
<pre class="code">domain: public_api
descriptors:
  - key: plan
    value: free
    rate_limit:
      unit: minute
      requests_per_unit: 100
  - key: plan
    value: pro
    rate_limit:
      unit: minute
      requests_per_unit: 1000
  - key: path
    value: /login
    rate_limit:
      unit: minute
      requests_per_unit: 5</pre></div>
    <div class="box"><h4 class="m0">What a rejected request gets back</h4>
<pre class="code">HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1791429792</pre>
     <p class="note"><code>Retry-After</code> is standard HTTP. The <code>X-RateLimit</code> headers are a common convention. Clients should wait at least <code>Retry-After</code> seconds, with exponential backoff if they are rejected again.</p></div>
   </div>
  </div>`;
},
memory(el){
  let users=Number(store("rlUsers"))||1e6,limit=500;
  el.innerHTML=`<div class="cols">
   <div class="box">
    <h3 id="mh"></h3>
    <div class="ctlrow"><span class="lbl">Users</span>${seg("mu",[[1e5,"100K"],[1e6,"1M"],[1e7,"10M"],[1e8,"100M"]],users,"Users")}</div>
    <div class="field"><span>Limit per user: <b id="mlv"></b> requests per hour (changes only the sliding log)</span><input type="range" id="ml" min="10" max="5000" step="10" value="${limit}" aria-label="Limit per user per hour"></div>
    <div class="bars" id="mbars"></div>
    <p class="note">Assumes 8-byte user IDs, 4-byte timestamps, 2-byte counters, and about 20 bytes of overhead for each stored entry. Real Redis overhead depends on its internal encoding, so these are interview estimates.</p>
   </div>
   <div class="stack">
    <div class="box"><h3>Timestamp sizes</h3>
     <div class="tablewrap"><table><thead><tr><th>Format</th><th class="num">Bytes</th><th>Example</th><th>Note</th></tr></thead><tbody>
      <tr><td>Unix seconds, 32-bit</td><td class="num">4</td><td><code>1791429780</code></td><td>Signed 32-bit seconds overflow on Jan 19, 2038</td></tr>
      <tr><td>Unix seconds or ms, 64-bit</td><td class="num">8</td><td><code>1791429780000</code></td><td>The usual choice in production</td></tr>
      <tr><td>Offset inside a 1-hour window</td><td class="num">2</td><td><code>2537</code></td><td>Seconds into the hour (0 to 3,599) fit in 2 bytes</td></tr>
      <tr><td>ISO 8601 text</td><td class="num">20</td><td><code>2026-10-08T03:23:00Z</code></td><td>Readable, 5 times the size of 32-bit</td></tr>
     </tbody></table></div>
     <p class="note">A Unix timestamp counts seconds since January 1, 1970 UTC. The window-offset trick works because a limiter only compares times inside the current window, so it never needs the full date.</p>
    </div>
    <div class="box prose"><h3>What the numbers show</h3>
     <ul class="plain"><li>Fixed window, token bucket, and sliding counter use the same amount of memory per user no matter what the limit is.</li>
     <li>The sliding log stores one entry per allowed request, so its memory grows with the limit. Move the slider to see it.</li>
     <li>The 60-bucket counter is a middle ground: one-minute buckets across an hour give a close rolling count with fixed memory.</li></ul>
    </div>
   </div>
  </div>`;
  function render(){
    $("#mh",el).textContent=`Memory for ${fmtCount(users)} users`;$("#mlv",el).textContent=fmt(limit);
    const rows=[["Fixed window","8 + 2 + 2 + 20",32],["Token bucket","8 + 4 + 4 + 20",36],["Sliding counter, 2 windows","8 + 2 × (2 + 2 + 20) + 20",76],["Sliding counter, 60 buckets","8 + 60 × (4 + 2 + 20) + 20",1588],["Sliding log",`8 + ${fmt(limit)} × (4 + 20) + 20`,28+limit*24]];
    const tot=rows.map(r=>r[2]*users),lo=Math.floor(Math.log10(Math.min(...tot))),hi=Math.ceil(Math.log10(Math.max(...tot))+1e-9),dec=Math.max(1,hi-lo);
    const p=v=>(Math.log10(v)-lo)/dec*100;
    let h=rows.map((r,i)=>`<div class="brow" style="--grid:${100/dec}%"><span class="bl">${r[0]}<small class="f">${r[1]} = ${fmt(r[2])} B each</small></span><span class="bt"><span class="bf" style="width:${p(tot[i])}%;background:${i===4?"var(--amber)":"var(--teal)"}"></span></span><span class="bv">${fmtBytes(tot[i])}</span></div>`).join("");
    const tk=[];for(let d=lo;d<=hi;d++)tk.push(`<span style="left:${(d-lo)/dec*100}%">${fmtBytes(Math.pow(10,d))}</span>`);
    h+=`<div class="brow axis" aria-hidden="true"><span></span><span class="bt">${tk.join("")}</span><span></span></div>`;
    $("#mbars",el).innerHTML=h;
  }
  onSeg(el,"mu",v=>{users=Number(v);store("rlUsers",users);render()});
  $("#ml",el).addEventListener("input",ev=>{limit=Number(ev.target.value);render()});
  render();
},
redis(el){
  el.innerHTML=`<div class="cols even">
   <div class="stack">
    <div class="box"><h3>Fixed window</h3><p>The window number is part of the key, so no timestamp is stored. The script makes the increment and the expiry one atomic step.</p>
<pre class="code">local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if n > tonumber(ARGV[1]) then return 0 end
return 1</pre>
     <p class="note">Called with <code>KEYS[1] = rl:user42:29857163</code> (Unix time ÷ 60, the window number), <code>ARGV[1] = 100</code> (limit), <code>ARGV[2] = 60</code> (window in seconds). Returns 1 to allow, 0 to reject.</p></div>
    <div class="box"><h3>Sliding window log</h3><p>A sorted set per user, with the timestamp as the score.</p>
<pre class="code">MULTI
ZREMRANGEBYSCORE rl:user42 0 (now_ms - 60000)
ZADD rl:user42 now_ms "now_ms:random"
ZCARD rl:user42
EXPIRE rl:user42 60
EXEC</pre>
     <p class="note">If <code>ZCARD</code> returns more than the limit, reject. The random suffix keeps two requests in the same millisecond from merging into one member. This version also records rejected requests; a Lua script can check the count before adding.</p></div>
   </div>
   <div class="stack">
    <div class="box"><h3>Sliding window counter</h3><p>Two fixed-window keys, read together.</p>
<pre class="code">curr = GET rl:user42:{w}
prev = GET rl:user42:{w - 1}
estimate = curr + prev × (1 - elapsed / window)
if estimate + 1 &lt;= limit:
    INCR rl:user42:{w}
    EXPIRE rl:user42:{w} (2 × window)
    allow
else:
    reject</pre></div>
    <div class="box"><h3>Token bucket</h3><p>A hash per user, updated by a Lua script so the read, refill, and write happen together.</p>
<pre class="code">local cap  = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now  = tonumber(ARGV[3])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or cap
local ts = tonumber(b[2]) or now
tokens = math.min(cap, tokens + (now - ts) * rate)
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(cap / rate) * 2)
return allowed</pre></div>
    <div class="box"><h3>With Memcached instead</h3><p>Memcached has atomic <code>incr</code> and <code>add</code> (set only if the key does not exist) with a TTL, which covers the fixed window: <code>add key 0 TTL</code>, then <code>incr key</code>. The other algorithms need a read, a calculation, and a conditional write with CAS, retrying when another server changed the value first. There are no sorted sets or scripts, and no replication, so losing a node resets its counters.</p></div>
   </div>
  </div>`;
}
};

/* ---------- sharding ---------- */
function h32(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)}h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return h>>>0}
TABS.sharding={
ring(el){
  const NK=200,KEYS=Array.from({length:NK},(_,i)=>{const k="user:"+(i+1);return {k,h:h32(k)}});
  let n=4,vn=Number(store("vn"))||10,moved=null,look="user:42";
  if(![1,10,100].includes(vn))vn=10;
  const build=(n,vn)=>{const r=[];for(let s=1;s<=n;s++)for(let v=0;v<vn;v++)r.push({pos:h32(`shard-${s}#${v}`),s,v});r.sort((a,b)=>a.pos-b.pos);return r};
  const ownerIdx=(r,h)=>{let lo=0,hi=r.length;while(lo<hi){const m=(lo+hi)>>1;if(r[m].pos<h)lo=m+1;else hi=m}return lo===r.length?0:lo};
  const assign=(n,vn)=>{const r=build(n,vn);return {r,own:KEYS.map(x=>r[ownerIdx(r,x.h)].s)}};
  const modA=n=>KEYS.map(x=>(x.h%n)+1);
  let cur=assign(n,vn);
  const C=180,RR=128,TAU=Math.PI*2,ang=p=>p/4294967296*TAU-Math.PI/2,pt=(a,r)=>[(C+r*Math.cos(a)).toFixed(1),(C+r*Math.sin(a)).toFixed(1)];
  el.innerHTML=`<div class="cols">
   <div class="box">
    <div class="ctlrow"><button type="button" class="btn" id="srem">Remove a shard</button><button type="button" class="btn primary" id="sadd">Add a shard</button></div>
    <div class="ctlrow"><span class="lbl">Virtual nodes per shard</span>${seg("vn",[[1,"1"],[10,"10"],[100,"100"]],vn,"Virtual nodes per shard")}</div>
    <div class="ringwrap"><svg class="fig ring" id="ring" viewBox="0 0 360 360" role="img" aria-label="Hash ring with shards as colored ticks and keys as dots"></svg></div>
    <div class="field"><span>Look up a key (type any text)</span><input type="text" id="slook" value="user:42" autocomplete="off" spellcheck="false"></div>
    <p class="stepcap" id="slookr" aria-live="polite"></p>
   </div>
   <div class="stack">
    <div class="box" id="smoved" aria-live="polite"></div>
    <div class="box"><h4 class="m0">Keys per shard</h4><div class="bars" id="sdist"></div><p class="note" id="sdnote"></p></div>
    <div class="box prose"><h3>How the ring works</h3><ol class="steps">
     <li>Each shard name is hashed many times (<code>shard-1#0</code>, <code>shard-1#1</code>, and so on) to get positions on a ring of 2<sup>32</sup> values. These positions are virtual nodes, drawn as colored ticks.</li>
     <li>Each key (<code>user:42</code>) is hashed to a position on the same ring, drawn as a dot.</li>
     <li>From the key, walk clockwise to the first virtual node. That node's shard owns the key.</li>
     <li>Adding a shard inserts new ticks. Only keys between a new tick and the tick before it change owner, about 1/N of all keys.</li>
     <li>More virtual nodes per shard even out each shard's share. Try 1, 10, and 100.</li>
    </ol></div>
   </div>
  </div>`;
  function draw(){
    const {r,own}=cur,sw=vn>=100?1:vn>=10?1.8:3.2,len=vn>=100?12:17;
    let s=`<defs><marker id="ringar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ringmk"/></marker></defs><circle class="ringbase" cx="${C}" cy="${C}" r="${RR}"/>`;
    r.forEach(p=>{const a=ang(p.pos),[x1,y1]=pt(a,RR+5),[x2,y2]=pt(a,RR+5+len);s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--s${p.s})" stroke-width="${sw}"/>`});
    KEYS.forEach((x,i)=>{const [cx,cy]=pt(ang(x.h),RR);s+=`<circle cx="${cx}" cy="${cy}" r="2.6" fill="var(--s${own[i]})"/>`});
    const lh=h32(look),o=r[ownerIdx(r,lh)],a1=ang(lh),a2r=ang(o.pos);let a2=a2r;if(a2<a1)a2+=TAU;
    const RI=RR-16,[ax,ay]=pt(a1,RI),[bx,by]=pt(a2,RI),large=(a2-a1)>Math.PI?1:0;
    if(a2-a1>0.02)s+=`<path class="lookarc" d="M${ax},${ay} A${RI},${RI} 0 ${large} 1 ${bx},${by}" marker-end="url(#ringar)"/>`;
    const [kx,ky]=pt(a1,RR),[o1x,o1y]=pt(a2r,RR+3),[o2x,o2y]=pt(a2r,RR+28);
    s+=`<line x1="${o1x}" y1="${o1y}" x2="${o2x}" y2="${o2y}" stroke="var(--s${o.s})" stroke-width="4" stroke-linecap="round"/><circle class="lookkey" cx="${kx}" cy="${ky}" r="6.5"/>`;
    s+=`<text class="ringc" x="${C}" y="${C-12}" text-anchor="middle">${esc(look.slice(0,18))}</text><text class="ringc2" x="${C}" y="${C+14}" text-anchor="middle" style="fill:var(--s${o.s})">owned by shard ${o.s}</text><text class="mu" x="${C}" y="${C+36}" text-anchor="middle">${n} shards, ${vn} virtual node${vn>1?"s":""} each</text>`;
    $("#ring",el).innerHTML=s;
    $("#slookr",el).innerHTML=`<b>${esc(look)}</b> hashes to ${fmt(lh)}, which is ${(lh/4294967296*100).toFixed(1)}% of the way around the ring. Walking clockwise, the first virtual node is <b>shard-${o.s}#${o.v}</b>, so shard ${o.s} owns it. With hash mod N instead: ${fmt(lh)} mod ${n} = ${lh%n}, which is shard ${lh%n+1}.`;
    const cnt=Array(n+1).fill(0);own.forEach(sv=>cnt[sv]++);const ideal=NK/n,mx=Math.max(...cnt.slice(1),ideal)*1.08;
    $("#sdist",el).innerHTML=cnt.slice(1).map((c,i)=>`<div class="brow" style="--grid:100%"><span class="bl"><i class="swd" style="background:var(--s${i+1})"></i>Shard ${i+1}</span><span class="bt"><span class="bf" style="width:${c/mx*100}%;background:var(--s${i+1})"></span><span class="ideal" style="left:${ideal/mx*100}%"></span></span><span class="bv">${c} (${Math.round(c/NK*100)}%)</span></div>`).join("");
    const big=Math.max(...cnt.slice(1));
    $("#sdnote",el).innerHTML=`The thin line marks an even share: ${fmt(ideal,1)} keys each. The largest shard holds ${big} keys, ${Math.round((big/ideal-1)*100)}% more than an even share.`;
    $("#smoved",el).innerHTML=moved?`<h4 class="m0">Going from ${moved.from} to ${moved.to} shards</h4><div class="mgrid"><div class="m"><small>Consistent hashing moved</small><b>${moved.mv} of ${NK}</b><span class="f">${Math.round(moved.mv/NK*100)}% of keys</span></div><div class="m"><small>Hash mod N would move</small><b>${moved.mvMod} of ${NK}</b><span class="f">${Math.round(moved.mvMod/NK*100)}% of keys</span></div><div class="m"><small>Smallest possible</small><b>about ${Math.round(NK/Math.max(moved.from,moved.to))}</b><span class="f">1/${Math.max(moved.from,moved.to)} of keys</span></div></div><p class="note">Every moved key is data that has to be copied to its new shard before the switch.</p>`
      :`<h4 class="m0">Keys moved</h4><p>Add or remove a shard to compare how many of the ${NK} keys change owner with consistent hashing and with hash mod N.</p>`;
    $("#srem",el).disabled=n<=2;$("#sadd",el).disabled=n>=8;
  }
  function change(nn){const pm=modA(n),nx=assign(nn,vn),nm=modA(nn);moved={from:n,to:nn,mv:nx.own.filter((s2,i)=>s2!==cur.own[i]).length,mvMod:nm.filter((s2,i)=>s2!==pm[i]).length};n=nn;cur=nx;draw()}
  $("#sadd",el).onclick=()=>{if(n<8)change(n+1)};
  $("#srem",el).onclick=()=>{if(n>2)change(n-1)};
  onSeg(el,"vn",v=>{vn=Number(v);store("vn",vn);cur=assign(n,vn);moved=null;draw()});
  $("#slook",el).addEventListener("input",ev=>{look=ev.target.value.trim()||"user:42";draw()});
  draw();
},
strategies(el){
  const S=[
   ["Range","Shard by ranges of the key: user IDs 1 to 1,000,000 on shard 1, the next million on shard 2, and so on. A small table records where each range lives.",
    "shard 1: user_id 1 to 1,000,000\nshard 2: user_id 1,000,001 to 2,000,000\nshard 3: user_id 2,000,001 and up",
    "Range queries stay on one shard (all orders from March). Splitting a range that grows too large is straightforward.",
    "Keys that increase over time (IDs, timestamps) send every new write to the last shard, so one shard takes all the write load.",
    "HBase, Google Bigtable, MongoDB ranged shard keys"],
   ["Hash mod N","Hash the key and take the remainder after dividing by the number of shards.",
    "shard = hash(\"user:42\") % 4\n      = 2810447713 % 4\n      = 1",
    "Even spread, and no lookup table.",
    "Changing N remaps most keys: going from 4 to 5 shards moves about 80% of them. A common fix is many logical shards (for example 1,024) mapped onto fewer servers, so you move whole logical shards instead of changing N.",
    "Many application-level sharding setups, often with logical shards"],
   ["Consistent hashing","Shards and keys are hashed onto the same ring, and each key belongs to the next shard clockwise. Try it in the first tab.",
    "ring positions: shard-1#0 … shard-4#99\nkey position:   hash(\"user:42\")\nowner:          first shard tick clockwise",
    "Adding or removing a shard moves only about 1/N of keys. Virtual nodes keep the spread even and let bigger machines take more ticks.",
    "Range queries scatter across shards. Every router needs the same ring layout, usually from ZooKeeper or etcd.",
    "Cassandra, DynamoDB, Riak, Memcached client libraries"],
   ["Directory","A lookup service maps each key, or group of keys such as a tenant, to a shard.",
    "tenant_id 17   → shard 3\ntenant_id 18   → shard 1\ntenant_id 9001 → shard 7 (large tenant)",
    "Any placement is possible. You can move one large customer to its own shard.",
    "Every query needs the lookup first, so the directory must be cached and highly available.",
    "Multi-tenant SaaS products"],
   ["Fixed hash slots","A middle ground: hash each key into a fixed number of slots, then assign slots to nodes. Resharding moves whole slots.",
    "slot = CRC16(\"user:42\") % 16384\nslots 0 to 5460       → node A\nslots 5461 to 10922   → node B\nslots 10923 to 16383  → node C",
    "Even spread like hashing, with explicit control over which node owns which slots.",
    "The slot table must be shared by every client.",
    "Redis Cluster, Couchbase"]
  ];
  el.innerHTML=`<div class="prose" style="max-width:52rem">${S.map(([n,how,ex,good,watch,used],i)=>`<details class="acc"${i===0?" open":""}><summary>${n}</summary><div><p>${how}</p><pre class="code">${esc(ex)}</pre><dl class="fields"><dt>Good</dt><dd>${good}</dd><dt>Watch out</dt><dd>${watch}</dd><dt>Used by</dt><dd>${used}</dd></dl></div></details>`).join("")}
   <div class="callout"><b>In an interview:</b> hash-based sharding (consistent hashing or fixed slots) is the usual answer. Mention range sharding if the main queries scan ranges, and a directory if customers vary a lot in size.</div></div>`;
},
keys(el){
  el.innerHTML=`<div class="cols">
   <div class="stack">
    <div class="box prose"><h3>What makes a good shard key</h3><ul class="plain">
     <li><b>Many distinct values:</b> user_id has millions; country has about 200, which limits you to about 200 shards and puts very uneven load on them.</li>
     <li><b>Even traffic:</b> no single value should get a large share of reads or writes.</li>
     <li><b>Present in most queries:</b> so a request goes to one shard instead of all of them.</li>
     <li><b>Never changes:</b> changing a row's key means moving it to another shard.</li></ul></div>
    <div class="box"><h3>Examples</h3><div class="tablewrap"><table><thead><tr><th>System</th><th>Good key</th><th>Why</th><th>Avoid</th></tr></thead><tbody>
     <tr><td>Chat messages</td><td>conversation_id, plus a time bucket</td><td>A chat's messages are read together</td><td>sender_id (one chat spread over many shards)</td></tr>
     <tr><td>Social posts</td><td>user_id</td><td>A profile page reads one user's posts</td><td>created_at (all new writes hit one shard)</td></tr>
     <tr><td>Orders</td><td>customer_id</td><td>Order history is per customer</td><td>country (few values, uneven)</td></tr>
     <tr><td>URL shortener</td><td>short code</td><td>Every lookup is by code</td><td>creation date</td></tr>
    </tbody></table></div></div>
   </div>
   <div class="stack">
    <div class="box prose"><h3>Problems to plan for</h3>
     <h4>Hot keys</h4><p>One account with millions of followers can overload its shard. Split it: write to <code>user_id#0</code> through <code>user_id#9</code> and read all ten, or cache it heavily.</p>
     <h4>Queries without the shard key</h4><p>"Find all messages containing a word" must ask every shard and merge the results (scatter-gather). Avoid it with a second table keyed differently, or a search index.</p>
     <h4>IDs</h4><p>Auto-increment IDs collide across shards. Use Snowflake IDs, UUIDs, or a separate ID range per shard.</p>
     <h4>Joins and transactions</h4><p>Joining or updating rows on two shards is slow and complicated. Keep data that is used together on the same shard.</p>
     <h4>Adding a shard</h4><ol class="steps"><li>Add the new shard to the ring in a joining state.</li><li>Copy the data for its key ranges while writes go to both old and new owners.</li><li>Switch reads to the new owner.</li><li>Delete the old copies.</li></ol>
    </div>
   </div>
  </div>`;
},
builtin(el){
  el.innerHTML=`<div class="box"><h3>How common databases partition data</h3><div class="tablewrap"><table><thead><tr><th>System</th><th>How it partitions</th><th>What you choose</th></tr></thead><tbody>
   <tr><td>Cassandra, ScyllaDB</td><td>Consistent hashing with virtual nodes (<code>num_tokens</code>)</td><td>The partition key in <code>PRIMARY KEY</code></td></tr>
   <tr><td>DynamoDB</td><td>Hash of the partition key; partitions split automatically as they grow</td><td>Partition key, optional sort key</td></tr>
   <tr><td>MongoDB</td><td>Ranged or hashed shard key; data split into chunks that a balancer moves; queries routed by <code>mongos</code></td><td>Shard key</td></tr>
   <tr><td>Redis Cluster</td><td>16,384 hash slots: <code>CRC16(key) mod 16384</code>, slots assigned to nodes</td><td>Hash tags such as <code>{user42}</code> keep related keys in one slot</td></tr>
   <tr><td>Memcached</td><td>Servers do not know about each other; the client library picks a server with consistent hashing (ketama)</td><td>The server list in the client</td></tr>
   <tr><td>Vitess (MySQL)</td><td>A vindex maps each row to a keyspace ID; shards own ranges of keyspace IDs</td><td>The primary vindex column</td></tr>
   <tr><td>Citus (Postgres)</td><td>Hash distribution into shards placed on worker nodes</td><td>The distribution column</td></tr>
   <tr><td>Plain Postgres or MySQL</td><td>Nothing built in across servers</td><td>You route in the app or a proxy</td></tr>
  </tbody></table></div><p class="note">With Cassandra and DynamoDB you never write a router: the database hashes the partition key for you. With plain Postgres or MySQL, the shard router on the map is your own code or a proxy such as Vitess or Citus.</p></div>`;
}
};

/* ---------- databases ---------- */
TABS.databases={
pick(el){
  const T={
   relational:{name:"Relational",ex:"PostgreSQL, MySQL, SQL Server",shape:"users                     orders\nid | name | email         id | user_id | total\n42 | Ana  | ana@ex.com    9  | 42      | 31.50",
    good:["Transactions: several changes succeed or fail together","Joins across tables and flexible queries","Constraints such as a unique email or a foreign key"],
    weak:["All writes go to one primary, so very high write volume needs sharding","Schema changes on very large tables need planning"],
    scale:"Read replicas for reads; sharding (Vitess, Citus) or a distributed SQL database for writes.",pick:"The default for core business data: users, orders, payments."},
   keyvalue:{name:"Key-value",ex:"Redis, DynamoDB, Memcached",shape:"session:8f2c  →  {\"user\":42,\"exp\":1791433380}\ncart:42       →  [\"sku-1\",\"sku-9\"]",
    good:["Fast reads and writes by key","Easy to spread across nodes by hashing the key"],
    weak:["Lookups only by key (DynamoDB adds secondary indexes)","No joins"],
    scale:"Keys are hashed across nodes; DynamoDB does this automatically.",pick:"Sessions, carts, caches, counters, leaderboards."},
   widecolumn:{name:"Wide-column",ex:"Cassandra, ScyllaDB, Bigtable, HBase",shape:"partition: conversation 123\n  message 1791429780001 | alice | \"hi\"\n  message 1791429781337 | bob   | \"hey\"\npartition: conversation 124\n  message 1791429790450 | cara  | \"lunch?\"",
    good:["High write throughput","Rows inside a partition are stored sorted, so time-ordered reads are fast","Partitions spread across nodes automatically"],
    weak:["Each table serves the queries it was designed for; a new query often needs a new table","No joins and limited transactions"],
    scale:"Add nodes; consistent hashing spreads the partitions.",pick:"Messages, activity feeds, time series, event logs."},
   document:{name:"Document",ex:"MongoDB, Firestore, Couchbase",shape:"{ \"_id\": \"sku-9\",\n  \"name\": \"Trail shoe\",\n  \"sizes\": [8, 9, 10],\n  \"specs\": { \"drop_mm\": 6, \"weight_g\": 280 } }",
    good:["Each record can have different fields","Nested data that is read together lives in one document","Secondary indexes and rich queries"],
    weak:["Limited joins, so data is often duplicated across documents","Multi-document transactions exist but cost more"],
    scale:"Built-in sharding by a shard key.",pick:"Product catalogs, content, profiles with varied attributes."},
   object:{name:"Object storage",ex:"Amazon S3, Google Cloud Storage, Azure Blob",shape:"uploads/user42/avatar.jpg     (412 KB)\nvideos/v_8812/1080p.mp4       (88 MB)",
    good:["Low cost per GB and very high durability","Files of any size, no capacity planning"],
    weak:["No queries: only put, get, list, and delete by key","Tens of milliseconds per request"],
    scale:"Managed for you.",pick:"Images, video, uploads, backups, logs. Metadata goes in a database."},
   search:{name:"Search index",ex:"Elasticsearch, OpenSearch",shape:"\"trail\" → [sku-9, sku-14, sku-301]\n\"shoe\"  → [sku-9, sku-77]",
    good:["Full-text search with ranking, typo tolerance, filters, and facets"],
    weak:["Not the source of truth; it is fed from the main database","New data becomes searchable after a short delay (about a second)"],
    scale:"Each index is split into shards with replicas.",pick:"Search boxes, autocomplete, log search."}
  };
  const SC=[["User accounts and payments","relational","A payment and the balance update must succeed or fail together, which needs transactions."],
   ["Chat messages at high volume","widecolumn","Heavy writes, read by conversation in time order: partition by conversation and sort by message ID."],
   ["Login sessions","keyvalue","Looked up by session ID on every request, with a short TTL."],
   ["Product catalog with different fields per category","document","A shoe and a laptop have different attributes, and each product is read as one record."],
   ["Profile photos and videos","object","Large files: bytes in object storage, metadata in a database, delivery through a CDN."],
   ["Search products by keyword","search","Full-text matching and ranking, kept in sync from the main database."],
   ["Game leaderboard","keyvalue","A Redis sorted set keeps players ordered by score, so reading the top 10 is one command."]];
  let typ="relational",sc=0;
  el.innerHTML=`<div class="stack">
   <div class="box"><h3>Which database for…</h3><div class="chips" id="dbsc">${SC.map((s,i)=>`<button type="button" class="chip" data-sc="${i}" aria-current="${i===sc}">${s[0]}</button>`).join("")}</div><div class="callout" id="dbwhy" aria-live="polite"></div></div>
   <div class="box"><div class="ctlrow">${seg("typ",Object.entries(T).map(([k,v])=>[k,v.name]),typ,"Database type")}</div><div id="dbtype"></div></div>
  </div>`;
  function render(){
    const t=T[typ];
    $("#dbtype",el).innerHTML=`<div class="cols even"><div><h3>${t.name}</h3><p class="note">${t.ex}</p><p class="grp">What the data looks like</p><pre class="code">${esc(t.shape)}</pre></div>
     <div><dl class="fields"><dt>Good at</dt><dd><ul class="plain">${t.good.map(g=>`<li>${g}</li>`).join("")}</ul></dd><dt>Watch out</dt><dd><ul class="plain">${t.weak.map(g=>`<li>${g}</li>`).join("")}</ul></dd><dt>Scaling</dt><dd>${t.scale}</dd><dt>Choose it for</dt><dd>${t.pick}</dd></dl></div></div>`;
    $$("[data-v]",$('[data-seg="typ"]',el)).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.v===typ)));
    $$("[data-sc]",el).forEach(b=>b.setAttribute("aria-current",String(Number(b.dataset.sc)===sc)));
    const s=SC[sc];$("#dbwhy",el).innerHTML=sc>=0?`<b>${s[0]}:</b> ${T[s[1]].name}. ${s[2]}`:`Pick a scenario above, or browse the types below.`;
  }
  $("#dbsc",el).addEventListener("click",ev=>{const b=ev.target.closest("[data-sc]");if(!b)return;sc=Number(b.dataset.sc);typ=SC[sc][1];render()});
  onSeg(el,"typ",v=>{typ=v;sc=-1;render()});
  render();
},
index(el){
  const ROWS=[[1,2,"09:00","morning"],[2,1,"09:01","standup at 10?"],[3,4,"09:03","did you push the fix"],[4,3,"09:04","lunch?"],[5,2,"09:06","sure"],[6,5,"09:07","invoice attached"],[7,4,"09:09","yes, merged"],[8,1,"09:10","moved to 10:30"],[9,3,"09:12","12:15 works"],[10,2,"09:13","thanks"],[11,4,"09:15","deploying now"],[12,5,"09:17","received"],[13,1,"09:18","ok"],[14,4,"09:20","deploy done"],[15,3,"09:22","see you there"],[16,2,"09:24","bye"]];
  const IDX=[...ROWS].sort((a,b)=>a[1]-b[1]||b[2].localeCompare(a[2]));
  let mode=store("idxmode")==="idx"?"idx":"scan",timers=[],read=0,checked=0;
  el.innerHTML=`<div class="cols">
   <div class="stack">
    <div class="box">
     <pre class="code">SELECT * FROM messages
WHERE conversation_id = 4
ORDER BY sent_at DESC
LIMIT 3;</pre>
     <div class="ctlrow">${seg("im",[["scan","No index"],["idx","Index on (conversation_id, sent_at)"]],mode,"Index")}</div>
     <div class="btnrow"><button type="button" class="btn primary" id="irun">Run the query</button></div>
     <div class="mgrid"><div class="m"><small>Table rows read</small><b id="iread">0</b></div><div class="m"><small>Index entries checked</small><b id="ichk">0</b></div><div class="m"><small>Result (row ids)</small><b id="ires">none yet</b></div></div>
     <p class="stepcap" id="icap" aria-live="polite"></p>
     <div id="iwrap"></div>
    </div>
   </div>
   <div class="stack"><div class="box prose"><h3>What the index changes</h3><ul class="plain">
    <li><b>No index:</b> the database reads every row, checks the condition, then sorts the matches. The work grows with the table: 100 million rows means 100 million rows read.</li>
    <li><b>With an index:</b> a separate copy of (conversation_id, sent_at) is kept sorted, each entry pointing to its row. The database jumps to the first entry for conversation 4 and reads the next entries in order, already sorted by time.</li>
    <li>Real indexes are B-trees. With 100 million rows a B-tree is about 4 levels deep, so finding the starting entry takes about 4 page reads.</li>
    <li>Column order matters. (conversation_id, sent_at) answers "conversation 4, newest first". An index on sent_at alone cannot find one conversation's messages.</li>
    <li>Each index adds work to every insert and update and takes disk space, so index the queries you actually run.</li>
    <li>The idea is the same in SQL and NoSQL. The next tab shows the syntax in five databases.</li></ul></div></div>
  </div>`;
  const rowsHTML=()=>`<p class="grp">Table: messages (in the order rows were written)</p><div class="tablewrap"><table class="dbt"><thead><tr><th>id</th><th>conversation_id</th><th>sent_at</th><th>body</th></tr></thead><tbody>${ROWS.map(r=>`<tr data-r="${r[0]}"><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${esc(r[3])}</td></tr>`).join("")}</tbody></table></div>`;
  const idxHTML=()=>`<p class="grp">Index: (conversation_id, sent_at DESC), kept sorted</p><div class="tablewrap"><table class="dbt"><thead><tr><th>#</th><th>conversation_id</th><th>sent_at</th><th>points to row</th></tr></thead><tbody>${IDX.map((r,i)=>`<tr data-i="${i}"><td>${i}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[0]}</td></tr>`).join("")}</tbody></table></div>`;
  function layout(){$("#iwrap",el).innerHTML=mode==="idx"?idxHTML()+rowsHTML():rowsHTML();read=0;checked=0;upd();$("#ires",el).textContent="none yet";$("#icap",el).textContent=mode==="idx"?"The index is sorted by conversation, then newest first. Press Run to search it.":"There is no index, so the only option is to read every row. Press Run."}
  function upd(){$("#iread",el).textContent=read;$("#ichk",el).textContent=checked}
  const R_=id=>$(`tr[data-r="${id}"]`,el),I_=i=>$(`tr[data-i="${i}"]`,el);
  function clear(){timers.forEach(clearTimeout);timers=[]}
  function seq(steps,delay){clear();if(RM){steps.forEach(f=>f());return}let t=0;steps.forEach(f=>{timers.push(setTimeout(f,t));t+=delay})}
  function run(){
    layout();const steps=[];
    if(mode==="scan"){
      ROWS.forEach((r,i)=>steps.push(()=>{if(i>0)R_(ROWS[i-1][0]).classList.remove("scan");const tr=R_(r[0]);tr.classList.add("scan");if(r[1]===4)tr.classList.add("match");read++;upd();$("#icap",el).textContent=`Reading row ${r[0]}: conversation ${r[1]}${r[1]===4?", a match":""}.`}));
      steps.push(()=>{R_(ROWS[ROWS.length-1][0]).classList.remove("scan");const m=ROWS.filter(r=>r[1]===4).sort((a,b)=>b[2].localeCompare(a[2])).slice(0,3);m.forEach(r=>R_(r[0]).classList.add("res"));$("#ires",el).textContent=m.map(r=>r[0]).join(", ");$("#icap",el).textContent=`Read all ${ROWS.length} rows, found 4 matches, sorted them by time, and kept the newest 3.`});
    }else{
      let lo=0,hi=IDX.length;const probes=[];while(lo<hi){const m=(lo+hi)>>1;probes.push(m);if(IDX[m][1]<4)lo=m+1;else hi=m}
      probes.forEach((p,k)=>steps.push(()=>{$$("tr.probe",el).forEach(t=>t.classList.remove("probe"));I_(p).classList.add("probe");checked++;upd();$("#icap",el).textContent=`Binary search step ${k+1}: entry ${p} is conversation ${IDX[p][1]}, so look ${IDX[p][1]<4?"later":"earlier"}.`}));
      [0,1,2].forEach(j=>steps.push(()=>{$$("tr.probe",el).forEach(t=>t.classList.remove("probe"));const i=lo+j;I_(i).classList.add("res");checked+=j===0?0:1;const rid=IDX[i][0];R_(rid).classList.add("res");read++;upd();$("#icap",el).textContent=`Entry ${i} points to row ${rid}. Fetch it.`}));
      steps.push(()=>{$("#ires",el).textContent=[0,1,2].map(j=>IDX[lo+j][0]).join(", ");$("#icap",el).textContent=`Found the first entry for conversation 4 in ${probes.length} steps, then read 3 entries in order. Only 3 table rows were read, already sorted by time.`});
    }
    seq(steps,mode==="scan"?260:600);
  }
  onSeg(el,"im",v=>{mode=v;store("idxmode",v);clear();layout()});
  $("#irun",el).onclick=run;
  layout();
  return clear;
},
query(el){
  const Q={
   sql:["SQL (Postgres, MySQL)",`CREATE TABLE messages (
  id              BIGINT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  sender_id       BIGINT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL,
  body            TEXT
);

CREATE INDEX idx_conv_time
  ON messages (conversation_id, sent_at, id);

SELECT * FROM messages
WHERE conversation_id = 123
  AND (sent_at, id) < (:last_sent_at, :last_id)
ORDER BY sent_at DESC, id DESC
LIMIT 50;`,["The equality column goes first in the index (conversation_id), then the sort column (sent_at).","<code>id</code> orders messages that share a timestamp.","Pages use a cursor (the last sent_at and id seen) instead of OFFSET, which would read and throw away every skipped row.","New indexes can be added at any time, and the query planner picks which to use."]],
   mongo:["MongoDB (document)",`db.messages.createIndex(
  { conversation_id: 1, sent_at: -1 }
)

db.messages
  .find({ conversation_id: 123,
          sent_at: { $lt: lastSentAt } })
  .sort({ sent_at: -1 })
  .limit(50)`,["B-tree indexes, the same as SQL, added at any time.","For compound indexes MongoDB recommends the ESR order: equality fields, then sort fields, then range fields.","1 means ascending and -1 descending."]],
   cass:["Cassandra (wide-column)",`CREATE TABLE messages_by_conversation (
  conversation_id bigint,
  bucket          int,
  message_id      bigint,
  sender_id       bigint,
  body            text,
  PRIMARY KEY ((conversation_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);

SELECT * FROM messages_by_conversation
WHERE conversation_id = 123 AND bucket = 202610
LIMIT 50;`,["The primary key is the index. You design the table around the query.","Partition key (conversation_id, bucket) decides which node stores the rows, using consistent hashing.","Clustering column message_id keeps rows sorted on disk, so the newest 50 is one sequential read.","The bucket (a month here) keeps a busy conversation from growing one partition without limit.","Every query must include the partition key. To find messages by sender, create a second table keyed by sender and write to both."]],
   ddb:["DynamoDB (key-value)",`Table: Messages
  Partition key: conversation_id     "123"
  Sort key:      sent_at#message_id  "2026-10-08T03:23:00Z#9812"

Query(
  KeyConditionExpression = "conversation_id = :c",
  ScanIndexForward       = false,
  Limit                  = 50
)`,["The partition key picks the partition; the sort key orders items inside it.","The sort key is a string, so the timestamp is written in a format where text order matches time order (ISO 8601 or zero-padded epoch).","<code>ScanIndexForward = false</code> reads newest first.","Other access patterns use a global secondary index: a copy with different keys, updated asynchronously, with extra write cost."]],
   redis:["Redis (sorted set)",`ZADD conv:123 1791429780000 msg:9812

ZRANGE conv:123 +inf -inf BYSCORE REV LIMIT 0 50

ZREMRANGEBYRANK conv:123 0 -201`,["The score is the timestamp, so members stay ordered by time.","The last command trims the set to the newest 200 messages.","Used as a cache of recent messages or a feed, with the database as the source of truth."]]
  };
  let q="sql";
  el.innerHTML=`<div class="box"><div class="ctlrow">${seg("q",Object.entries(Q).map(([k,v])=>[k,v[0].split(" (")[0]]),q,"Database")}</div><div id="qbody"></div>
   <div class="callout"><b>Summary:</b> in SQL and MongoDB you store the data first and add indexes as new queries appear. In Cassandra and DynamoDB you list the queries first, because the primary key layout is the index and each extra query needs another table or a secondary index.</div></div>`;
  const render=()=>{const v=Q[q];$("#qbody",el).innerHTML=`<div class="cols"><div><h3>${v[0]}</h3><p class="note">Query: the newest 50 messages in conversation 123.</p><pre class="code">${esc(v[1])}</pre></div><div><h4 class="m0">How it works</h4><ul class="plain">${v[2].map(x=>`<li>${x}</li>`).join("")}</ul></div></div>`};
  onSeg(el,"q",v=>{q=v;render()});render();
},
ids(el){
  const EPOCH=1288834974657n;let lastMs=0n,seqN=0n;
  el.innerHTML=`<div class="cols">
   <div class="stack">
    <div class="box"><h3>Snowflake ID: 64 bits that sort by time</h3>
     <div class="sfbar" aria-hidden="true"><span style="flex:1.6" class="b0">1</span><span style="flex:41" class="b1">41 bits: milliseconds since a custom epoch</span><span style="flex:10" class="b2">10: machine</span><span style="flex:12" class="b3">12: sequence</span></div>
     <ul class="plain small"><li><b>Timestamp (41 bits):</b> about 69 years of milliseconds.</li><li><b>Machine (10 bits):</b> up to 1,024 generators, so no coordination is needed.</li><li><b>Sequence (12 bits):</b> up to 4,096 IDs per millisecond per machine.</li></ul>
     <div class="btnrow"><button type="button" class="btn primary" id="sfgo">Generate an ID now</button></div>
     <div id="sfout" aria-live="polite"></div>
     <p class="note">Because the timestamp is in the highest bits, sorting by ID sorts by time. One 8-byte column serves as the primary key and the time order. This example uses Twitter's epoch (November 4, 2010) and machine 37.</p>
    </div>
    <div class="box"><h3>Paging by ID instead of OFFSET</h3>
<pre class="code">SELECT * FROM messages
WHERE conversation_id = 123
  AND id &lt; :last_seen_id
ORDER BY id DESC
LIMIT 50;</pre>
     <p class="note">With a time-sortable ID, the cursor is a single value. <code>OFFSET 10000</code> would read and discard 10,000 rows first.</p></div>
   </div>
   <div class="stack">
    <div class="box"><h3>Storing time</h3>
     <div class="tablewrap"><table><thead><tr><th>Format</th><th class="num">Bytes</th><th>Example</th></tr></thead><tbody>
      <tr><td>Unix seconds, 32-bit</td><td class="num">4</td><td><code>1791429780</code></td></tr>
      <tr><td>Unix seconds or ms, 64-bit</td><td class="num">8</td><td><code>1791429780000</code></td></tr>
      <tr><td>Database timestamp type</td><td class="num">8</td><td>Postgres <code>timestamptz</code></td></tr>
      <tr><td>ISO 8601 text</td><td class="num">20</td><td><code>2026-10-08T03:23:00Z</code></td></tr>
     </tbody></table></div>
     <ul class="plain">
      <li>Assign time on the server. Phone and browser clocks can be wrong, which would put messages out of order.</li>
      <li>Store UTC and convert to local time only when displaying it.</li>
      <li>Signed 32-bit seconds overflow on January 19, 2038, so new systems use 64-bit values.</li>
      <li>Other time-sortable ID formats: ULID and UUIDv7 (128 bits, no machine ID to assign).</li>
     </ul></div>
   </div>
  </div>`;
  $("#sfgo",el).onclick=()=>{
    const ms=BigInt(Date.now());if(ms===lastMs)seqN=(seqN+1n)&4095n;else{seqN=0n;lastMs=ms}
    const ts=ms-EPOCH,mach=37n,id=(ts<<22n)|(mach<<12n)|seqN,bin=id.toString(2).padStart(64,"0");
    $("#sfout",el).innerHTML=`<div class="m"><small>ID</small><b>${id.toString()}</b></div>
     <p class="sfbits"><span class="b0">${bin.slice(0,1)}</span><span class="b1">${bin.slice(1,42)}</span><span class="b2">${bin.slice(42,52)}</span><span class="b3">${bin.slice(52)}</span></p>
     <dl class="fields"><dt>Timestamp</dt><dd>${ts.toString()} ms after the epoch = ${new Date(Number(ms)).toISOString()}</dd><dt>Machine</dt><dd>37</dd><dt>Sequence</dt><dd>${seqN.toString()} (press again within the same millisecond and it counts up)</dd></dl>`;
  };
}
};

/* ---------- real-time ---------- */
TABS.realtime={
compare(el){
  let evs=[2.3,6.8,7.4,15.1],sends=[4.6,12.2];
  const A=[
   ["short","Short polling","The client asks every 3 seconds whether anything is new. Most answers are empty, and a new message waits for the next poll.","Simple and works everywhere.","Wasted requests, and up to one polling interval of delay."],
   ["long","Long polling","The client sends a request, and the server holds it open until there is data or 8 seconds pass. The client then sends the next request right away.","Fast delivery over plain HTTP.","Every delivered message costs a new request, and each waiting request holds server resources."],
   ["sse","Server-Sent Events","One HTTP response stays open and the server streams events down it. The client sends its own messages as separate requests.","Simple server push, with reconnect built into browsers.","Server to client only, text only."],
   ["ws","WebSocket","One connection, upgraded from HTTP, carries messages in both directions for as long as it stays open.","Lowest delay both ways and a few bytes of overhead per message.","Servers hold state, so scaling needs a registry, heartbeats, and reconnect handling."]
  ];
  const D=0.15,x=t=>46+t/20*346;
  function sim(k){
    const out={arr:[],holds:[],band:null,reqs:0,empty:0,delays:[]};
    const send=()=>sends.forEach(s=>{if(k==="ws"){out.arr.push([s,s+D,"up","send"])}else{out.arr.push([s,s+D,"up","send"]);out.arr.push([s+D,s+2*D,"down","sendr"]);out.reqs++}});
    if(k==="short"){let prev=-1;for(let p=0;p<=20;p+=3){out.reqs++;out.arr.push([p,p+D,"up","req"]);const got=evs.filter(e=>e>prev&&e<=p+D);prev=p+D;out.arr.push([p+D,p+2*D,"down",got.length?"data":"empty"]);if(!got.length)out.empty++;got.forEach(e=>out.delays.push(p+2*D-e))}send()}
    if(k==="long"){let t=0;const left=[...evs];while(t<20){out.reqs++;out.arr.push([t,t+D,"up","req"]);const ta=t+D;let resp,got;
      if(left.length&&left[0]<=ta){resp=ta}else if(left.length&&left[0]<=ta+8){resp=left[0]}else{resp=Math.min(ta+8,20.5)}
      got=[];while(left.length&&left[0]<=resp)got.push(left.shift());
      out.holds.push([ta,resp]);if(resp>20)break;out.arr.push([resp,resp+D,"down",got.length?"data":"empty"]);if(!got.length)out.empty++;got.forEach(e=>out.delays.push(resp+D-e));t=resp+D+0.05}send()}
    if(k==="sse"||k==="ws"){out.reqs++;out.arr.push([0,D,"up","req"]);out.arr.push([D,2*D,"down",k==="ws"?"up101":"data0"]);out.band=[2*D,20];evs.forEach(e=>{out.arr.push([e,e+D,"down","data"]);out.delays.push(D)});send()}
    out.avg=out.delays.length?out.delays.reduce((a,b)=>a+b,0)/out.delays.length:0;return out;
  }
  function lane(k){
    const o=sim(k);let s=`<text class="mu" x="4" y="26">Client</text><text class="mu" x="4" y="74">Server</text>`;
    if(o.band)s+=`<rect class="${k==="ws"?"wsband":"sseband"}" x="${x(o.band[0])}" y="24" width="${x(o.band[1])-x(o.band[0])}" height="46"/>`;
    s+=`<line class="grid" x1="46" y1="22" x2="392" y2="22"/><line class="grid" x1="46" y1="70" x2="392" y2="70"/>`;
    o.holds.forEach(([a,b])=>{s+=`<rect class="hold" x="${x(a)}" y="66" width="${Math.max(1,x(Math.min(b,20))-x(a))}" height="8" rx="2"/>`});
    evs.forEach(e=>{const xx=x(e);s+=`<path class="evm" d="M${xx},64 l5,6 l-5,6 l-5,-6 z"/>`});
    o.arr.forEach(([a,b,dir,c])=>{if(a>20)return;const y1=dir==="up"?24:68,y2=dir==="up"?68:24;s+=`<line class="ar ar-${c}" x1="${x(a)}" y1="${y1}" x2="${x(Math.min(b,20))}" y2="${y2}" marker-end="url(#rt-${c==="empty"||c==="req"?"mu":c==="send"||c==="sendr"?"tl":"am"})"/>`});
    [0,5,10,15,20].forEach(t=>{s+=`<text class="mu mono" x="${x(t)}" y="90" text-anchor="${t===0?"start":t===20?"end":"middle"}">${t} s</text>`});
    return {svg:s,o};
  }
  const defs=`<defs>${[["mu","var(--dash)"],["am","var(--amber)"],["tl","var(--teal)"]].map(([k,c])=>`<marker id="rt-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:${c}"/></marker>`).join("")}</defs>`;
  el.innerHTML=`<div class="box"><div class="ctlrow"><button type="button" class="btn" id="rtnew">New random messages</button><span class="note">Four messages arrive at the server (◆) and the user sends two of their own (teal) during 20 seconds.</span></div>
   <p class="note rtleg"><span class="lg lg-req"></span>request &nbsp; <span class="lg lg-data"></span>response with data &nbsp; <span class="lg lg-empty"></span>empty response &nbsp; <span class="lg lg-send"></span>user's own message &nbsp; <span class="lg lg-hold"></span>request held open</p></div>
   <div class="rtgrid" id="rtgrid"></div>
   <div class="box mt"><h3>Side by side</h3><div class="tablewrap"><table><thead><tr><th>Approach</th><th>Direction</th><th class="num">HTTP requests</th><th class="num">Empty responses</th><th class="num">Average delay</th><th>Typical use</th></tr></thead><tbody id="rttab"></tbody></table></div>
   <p class="note">Delays assume 0.15 s each way. Push notifications (APNs, FCM) cover the case none of these handle: the app is closed.</p></div>`;
  const USE={short:"Dashboards that refresh every minute",long:"Fallback when WebSockets are blocked",sse:"Notifications, live feeds, streaming AI responses",ws:"Chat, multiplayer games, collaborative editing"};
  const DIR={short:"Client asks",long:"Client asks, server waits",sse:"Server to client",ws:"Both ways"};
  function render(){
    const res=A.map(([k,n,how,good,cost])=>{const {svg,o}=lane(k);return {k,n,how,good,cost,svg,o}});
    $("#rtgrid",el).innerHTML=res.map(r=>`<div class="box"><h3>${r.n}</h3><p class="small">${r.how}</p><svg class="fig rtl" viewBox="0 0 400 94" role="img" aria-label="${r.n} timeline">${defs}${r.svg}</svg>
      <div class="mgrid"><div class="m"><small>HTTP requests</small><b>${r.o.reqs}</b></div><div class="m"><small>Empty responses</small><b>${r.o.empty}</b></div><div class="m"><small>Average delay</small><b>${r.o.avg.toFixed(2)} s</b></div></div>
      <dl class="fields"><dt>Benefit</dt><dd>${r.good}</dd><dt>Cost</dt><dd>${r.cost}</dd></dl></div>`).join("");
    $("#rttab",el).innerHTML=res.map(r=>`<tr><td>${r.n}</td><td>${DIR[r.k]}</td><td class="num">${r.o.reqs}</td><td class="num">${r.o.empty}</td><td class="num">${r.o.avg.toFixed(2)} s</td><td>${USE[r.k]}</td></tr>`).join("");
  }
  $("#rtnew",el).onclick=()=>{const pick=(n,gap)=>{let a;do{a=Array.from({length:n},()=>+(1+Math.random()*18).toFixed(1)).sort((p,q)=>p-q)}while(a.some((v,i)=>i&&v-a[i-1]<gap));return a};evs=pick(4,0.8);sends=pick(2,2);render()};
  render();
},
routing(el){
  const N={alice:[60,40,"Alice"],push:[200,40,"Push service"],bob:[340,40,"Bob"],gwa:[60,135,"Gateway A"],mq:[200,135,"Queue"],gwb:[340,135,"Gateway B"],svc:[200,215,"Message service"],db:[75,272,"Database"],reg:[325,272,"Redis registry"]};
  const E=[["alice","gwa"],["gwa","mq"],["mq","svc"],["svc","db"],["svc","reg"],["mq","gwb"],["gwb","bob"],["mq","push"],["push","bob"]];
  const S={online:[["alice","gwa","Alice's app sends <b>{to: \"bob\", text: \"hi\", clientMsgId}</b> over her open WebSocket."],
    ["gwa","mq","Gateway A publishes the message to the incoming topic, partitioned by conversation ID."],
    ["mq","svc","The message service consumes it and assigns a time-sortable message ID."],
    ["svc","db","It saves the message. If that clientMsgId was already saved (a client retry), it skips the duplicate."],
    ["svc","reg","It looks up where Bob is connected: <b>bob → gateway B</b>."],
    ["svc","mq","It publishes the message to gateway B's channel."],
    ["mq","gwb","Gateway B receives it."],
    ["gwb","bob","Gateway B pushes the frame down Bob's socket, and Bob's app replies with a delivered acknowledgment."]],
   offline:[["alice","gwa","Alice's app sends the message over her WebSocket."],
    ["gwa","mq","Gateway A publishes it to the incoming topic."],
    ["mq","svc","The message service consumes it and assigns a message ID."],
    ["svc","db","It saves the message, so it is not lost while Bob is away."],
    ["svc","reg","Registry lookup finds no entry for Bob: his heartbeat stopped and the entry expired."],
    ["svc","mq","It publishes a notification job instead."],
    ["mq","push","A notification worker sends a short preview to APNs or FCM with Bob's device token."],
    ["push","bob","Bob's phone shows the notification. When he opens the app it reconnects and asks for every message after the last ID it has."]]};
  let mode="online",step=-1,timer=null,raf=null;
  const key=(a,b)=>[a,b].sort().join("-");
  el.innerHTML=`<div class="cols">
   <div class="box">
    <div class="ctlrow"><span class="lbl">Bob is</span>${seg("bob",[["online","online"],["offline","offline"]],mode,"Bob's status")}</div>
    <svg class="fig" viewBox="0 0 400 300" role="img" aria-label="Chat message routing diagram">
     ${E.map(([a,b])=>`<line class="fline" data-ed="${key(a,b)}" x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}"/>`).join("")}
     <circle class="dot" id="rdot" r="7" cx="-20" cy="-20"/>
     ${Object.entries(N).map(([k,[cx,cy,l]])=>`<rect class="fnode" data-nd="${k}" x="${cx-56}" y="${cy-17}" width="112" height="34" rx="9"/><text x="${cx}" y="${cy+4}" text-anchor="middle">${l}</text>`).join("")}
    </svg>
    <p class="stepcap" id="rcap" aria-live="polite"></p>
    <div class="btnrow"><button type="button" class="btn" id="rback">Back</button><button type="button" class="btn primary" id="rplay">Play</button><button type="button" class="btn" id="rnext">Next step</button></div>
   </div>
   <div class="stack"><div class="box"><h4 class="m0">Steps</h4><ol class="steps" id="rsteps"></ol></div>
    <div class="box prose"><h3>Why it is built this way</h3><ul class="plain">
     <li>Gateways only hold connections. Saving and routing happen in the message service, so gateways stay simple.</li>
     <li>The registry answers "which gateway is Bob on?" Gateways write <code>user → gateway</code> on connect and refresh it with each heartbeat.</li>
     <li>The message is saved before delivery, so a crash after saving loses nothing; the client can fetch it on reconnect.</li>
     <li>The client-generated ID makes retries safe: the same message sent twice is stored once.</li>
     <li>In a group chat the service looks up every member and publishes once per gateway, not once per member.</li></ul></div></div>
  </div>`;
  const steps=()=>S[mode];
  function stop(){if(timer){clearInterval(timer);timer=null}if(raf){cancelAnimationFrame(raf);raf=null}$("#rplay",el).textContent="Play"}
  function draw(){
    $$(".fline",el).forEach(l=>l.classList.remove("hot"));$$(".fnode",el).forEach(n=>n.classList.remove("act"));
    $$("#rsteps li",el).forEach((li,i)=>{li.classList.toggle("cur",i===step);li.classList.toggle("done",i<step)});
    const dot=$("#rdot",el);
    if(step<0){$("#rcap",el).innerHTML="Press <b>Play</b> or <b>Next step</b> to follow the message.";dot.setAttribute("cx",-20);return}
    const [a,b,t]=steps()[step];
    $(`[data-ed="${key(a,b)}"]`,el).classList.add("hot");$(`[data-nd="${a}"]`,el).classList.add("act");$(`[data-nd="${b}"]`,el).classList.add("act");
    $("#rcap",el).innerHTML=`Step ${step+1} of ${steps().length}: ${t}`;
    const [x1,y1]=N[a],[x2,y2]=N[b];
    if(RM){dot.setAttribute("cx",x2);dot.setAttribute("cy",y2);return}
    const t0=performance.now();if(raf)cancelAnimationFrame(raf);
    const go=now=>{const k=Math.min(1,(now-t0)/700);dot.setAttribute("cx",x1+(x2-x1)*k);dot.setAttribute("cy",y1+(y2-y1)*k);if(k<1)raf=requestAnimationFrame(go)};raf=requestAnimationFrame(go);
  }
  function list(){$("#rsteps",el).innerHTML=steps().map(s=>`<li>${s[2]}</li>`).join("")}
  function next(){step=step>=steps().length-1?0:step+1;draw()}
  function play(){if(timer){stop();return}if(step>=steps().length-1)step=-1;next();$("#rplay",el).textContent="Pause";timer=setInterval(()=>{if(step>=steps().length-1){stop();return}next()},1500)}
  onSeg(el,"bob",v=>{mode=v;stop();step=-1;list();draw()});
  $("#rplay",el).onclick=play;$("#rnext",el).onclick=()=>{stop();next()};$("#rback",el).onclick=()=>{stop();step=Math.max(-1,step-1);draw()};
  list();draw();
  return stop;
},
lifecycle(el){
  el.innerHTML=`<div class="cols">
   <div class="stack">
    <div class="box prose"><h3>From connect to reconnect</h3><ol class="steps">
     <li><b>Open:</b> the client sends an HTTP request asking to upgrade, and the server answers <code>101 Switching Protocols</code>. The same TCP connection now carries WebSocket frames.</li>
     <li><b>Authenticate:</b> browsers cannot set custom headers on a WebSocket, so the token goes in a query parameter, a cookie, or the first message.</li>
     <li><b>Register:</b> the gateway writes <code>user → gateway</code> to Redis with a TTL of about a minute.</li>
     <li><b>Exchange frames:</b> each frame has a 2 to 14 byte header instead of full HTTP headers.</li>
     <li><b>Heartbeat:</b> a ping and pong about every 30 seconds proves the connection is alive, refreshes the registry TTL, and keeps proxies from closing an idle connection.</li>
     <li><b>Close or drop:</b> a close frame ends it cleanly. If heartbeats stop, the gateway drops the connection and the registry entry expires.</li>
     <li><b>Reconnect:</b> the client waits with exponential backoff plus jitter, reconnects (possibly to a different gateway), and sends the ID of the last message it received. The server sends everything newer.</li>
    </ol></div>
    <div class="box"><h4 class="m0">Client code</h4>
<pre class="code">const ws = new WebSocket("wss://chat.example.com/ws?token=JWT");
ws.onmessage = (e) =&gt; show(JSON.parse(e.data));
ws.onclose = () =&gt; reconnectWithBackoff(lastMessageId);
ws.send(JSON.stringify({
  to: "bob", text: "hi",
  clientMsgId: crypto.randomUUID()
}));</pre></div>
   </div>
   <div class="stack">
    <div class="box"><h4 class="m0">The handshake</h4>
<pre class="code">GET /ws HTTP/1.1
Host: chat.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=</pre>
     <p class="note">The load balancer must pass these Upgrade headers through. In NGINX that means <code>proxy_http_version 1.1</code> plus setting the Upgrade and Connection headers.</p></div>
    <div class="box"><h3>Why reconnects need jitter</h3><p class="small">When a gateway restarts, all of its clients disconnect at the same moment. Each row is one client and each dot is a reconnect attempt.</p>
     <svg class="fig" id="jit" viewBox="0 0 400 176" role="img" aria-label="Reconnect attempts with and without jitter"></svg>
     <div class="btnrow"><button type="button" class="btn" id="jitgo">Roll the jitter again</button></div>
     <p class="note">Without jitter, every client retries at 1, 3, 7, and 15 seconds, so the new gateway gets the whole crowd at once, each time. With full jitter each wait is a random time between 0 and the backoff limit, which spreads the load.</p></div>
   </div>
  </div>`;
  function jit(){
    const NC=8,x=t=>58+t/16*334;let s="";
    const panel=(y0,label,rand)=>{s+=`<text class="mu" x="4" y="${y0+4}">${label}</text>`;for(let c=0;c<NC;c++){const y=y0+12+c*8;s+=`<line class="grid" x1="58" y1="${y}" x2="392" y2="${y}"/>`;let t=0;for(let n=0;n<4;n++){const cap=Math.pow(2,n);t+=rand?Math.random()*cap:cap;if(t<=16)s+=`<circle class="${rand?"jd":"nd"}" cx="${x(t).toFixed(1)}" cy="${y}" r="3"/>`}}};
    panel(6,"No jitter",false);panel(90,"Full jitter",true);
    [0,4,8,12,16].forEach(t=>{s+=`<text class="mu mono" x="${x(t)}" y="174" text-anchor="${t===0?"start":t===16?"end":"middle"}">${t} s</text>`});
    $("#jit",el).innerHTML=s;
  }
  $("#jitgo",el).onclick=jit;jit();
},
capacity(el){
  let users=Number(store("wsUsers"))||1e7,per=5e4,kb=20,hb=30,msg=20;
  el.innerHTML=`<div class="cols">
   <div class="box">
    <h3>WebSocket capacity</h3>
    <div class="ctlrow"><span class="lbl">Concurrent users</span>${seg("u",[[1e5,"100K"],[1e6,"1M"],[1e7,"10M"],[5e7,"50M"]],users,"Concurrent users")}</div>
    <div class="ctlrow"><span class="lbl">Connections per server</span>${seg("p",[[1e4,"10K"],[5e4,"50K"],[1e5,"100K"],[5e5,"500K"]],per,"Connections per server")}</div>
    <div class="ctlrow"><span class="lbl">Memory per connection</span>${seg("k",[[10,"10 KB"],[20,"20 KB"],[50,"50 KB"]],kb,"Memory per connection")}</div>
    <div class="ctlrow"><span class="lbl">Heartbeat every</span>${seg("h",[[15,"15 s"],[30,"30 s"],[60,"60 s"]],hb,"Heartbeat interval")}</div>
    <div class="ctlrow"><span class="lbl">Messages per user per hour</span>${seg("g",[[5,"5"],[20,"20"],[60,"60"]],msg,"Messages per user per hour")}</div>
    <div class="mgrid" id="wsout"></div>
   </div>
   <div class="stack"><div class="box prose"><h3>Notes</h3><ul class="plain">
    <li>Plan WebSocket servers by open connections. A connection that sends nothing still uses memory and a file descriptor.</li>
    <li>Raise the operating system's open file limit (<code>ulimit -n</code>), since each connection uses one file descriptor.</li>
    <li>The limit of about 65,000 ports applies to one client IP connecting to one server address, because each of those connections needs its own source port. A server listening on port 443 can hold far more connections than that.</li>
    <li>Keep headroom (30% here) so one server can fail or be drained for a deploy without the others running out of room.</li>
    <li>Connections per server vary with language, hardware, and tuning; 50K to 100K is a common interview assumption.</li></ul></div></div>
  </div>`;
  function render(){
    const servers=Math.ceil(users/per),withH=Math.ceil(users/per*1.3),onEach=users/withH,memEach=onEach*kb*1000,total=users*kb*1000,hbps=users/hb,reg=users*100,mps=users*msg/3600;
    const M=(l,v,f)=>`<div class="m"><small>${l}</small><b>${v}</b><span class="f">${f}</span></div>`;
    $("#wsout",el).innerHTML=M("Gateway servers",fmt(withH),`${fmtCount(users)} ÷ ${fmtCount(per)} = ${fmt(servers)}, plus 30% headroom`)+M("Connections on each",fmtCount(Math.round(onEach)),`${fmtCount(users)} ÷ ${fmt(withH)}`)+M("Memory per server",fmtBytes(memEach),`${fmtCount(Math.round(onEach))} × ${kb} KB`)+M("Connection memory, total",fmtBytes(total),`${fmtCount(users)} × ${kb} KB`)+M("Heartbeats per second",fmtCount(Math.round(hbps)),`${fmtCount(users)} ÷ ${hb} s`)+M("Registry in Redis",fmtBytes(reg),`${fmtCount(users)} × about 100 B`)+M("Messages per second",fmtCount(Math.round(mps)),`${fmtCount(users)} × ${msg} ÷ 3,600`);
  }
  onSeg(el,"u",v=>{users=Number(v);store("wsUsers",users);render()});onSeg(el,"p",v=>{per=Number(v);render()});onSeg(el,"k",v=>{kb=Number(v);render()});onSeg(el,"h",v=>{hb=Number(v);render()});onSeg(el,"g",v=>{msg=Number(v);render()});
  render();
}
};

/* ---------- capacity ---------- */
TABS.capacity={
calc(el){
  const PRE={
   social:{label:"Social posts",dau:100e6,wpu:2,ratio:100,rec:300,media:0,years:5,repl:3,peak:2,cache:20},
   chat:{label:"Chat messages",dau:50e6,wpu:40,ratio:2,rec:200,media:0,years:5,repl:3,peak:3,cache:20},
   url:{label:"URL shortener",dau:10e6,wpu:0.3,ratio:100,rec:500,media:0,years:10,repl:3,peak:2,cache:20},
   photo:{label:"Photo sharing",dau:50e6,wpu:0.5,ratio:50,rec:500,media:2e6,years:10,repl:3,peak:2,cache:20}
  };
  const F=[["dau","Daily active users"],["wpu","Writes per user per day"],["ratio","Reads per write"],["rec","Bytes per record"],["media","Media bytes per write (0 if none)"],["years","Years of data kept"],["repl","Copies of each record (replication)"],["peak","Peak traffic ÷ average"],["cache","Share of daily reads to cache (%)"]];
  let preset=store("capPreset");if(!PRE[preset])preset="social";
  let v={...PRE[preset]};
  el.innerHTML=`<div class="cols">
   <div class="box">
    <h3>Assumptions</h3>
    <div class="chips" id="cpre">${Object.entries(PRE).map(([k,p])=>`<button type="button" class="chip" data-pre="${k}" aria-current="${k===preset}">${p.label}</button>`).join("")}</div>
    <div class="fgrid">${F.map(([k,l])=>`<label class="field"><span>${l}</span><input type="number" id="c-${k}" min="0" step="any" inputmode="decimal"></label>`).join("")}</div>
    <p class="note">Rounded rules used here: one day is 86,400 seconds, storage uses 1 KB = 1,000 bytes, and peak traffic is a multiple of the average.</p>
   </div>
   <div class="stack">
    <div class="box"><h3>Results</h3><div class="mgrid" id="cout"></div></div>
    <div class="box prose"><h3>What these numbers point to</h3><ul class="plain" id="cimp"></ul><p class="note">The thresholds are rough planning figures. Real limits depend on hardware, query shape, and data size.</p></div>
   </div>
  </div>`;
  function fill(){F.forEach(([k])=>{$("#c-"+k,el).value=v[k]})}
  function render(){
    const w=v.dau*v.wpu,wq=w/86400,wp=wq*v.peak,rq=wq*v.ratio,rp=rq*v.peak,rd=w*v.ratio;
    const dbDay=w*v.rec,dbTot=dbDay*365*v.years*v.repl,mDay=w*v.media,mTot=mDay*365*v.years;
    const cacheUp=rd*v.rec*v.cache/100,cacheNew=dbDay*v.cache/100,bwIn=wq*(v.rec+v.media),bwApi=rq*v.rec,bwMedia=rq*v.media;
    const M=(l,val,f)=>`<div class="m"><small>${l}</small><b>${val}</b><span class="f">${f}</span></div>`;
    let h=M("Writes per day",fmtCount(w),`${fmtCount(v.dau)} × ${fmt(v.wpu,2)}`)+
      M("Write QPS, average",fmt(wq)+"/s",`${fmtCount(w)} ÷ 86,400`)+M("Write QPS, peak",fmt(wp)+"/s",`${fmt(wq)} × ${fmt(v.peak,1)}`)+
      M("Read QPS, average",fmt(rq)+"/s",`${fmt(wq)} × ${fmt(v.ratio)}`)+M("Read QPS, peak",fmt(rp)+"/s",`${fmt(rq)} × ${fmt(v.peak,1)}`)+
      M("Database growth per day",fmtBytes(dbDay),`${fmtCount(w)} × ${fmt(v.rec)} B`)+M("Database total",fmtBytes(dbTot),`${fmtBytes(dbDay)} × 365 × ${fmt(v.years)} × ${fmt(v.repl)} copies`);
    if(v.media>0)h+=M("Media in object storage",fmtBytes(mTot),`${fmtCount(w)} × ${fmtBytes(v.media)} × 365 × ${fmt(v.years)}`);
    h+=M("Cache, upper bound",fmtBytes(cacheUp),`${fmtCount(rd)} reads/day × ${fmt(v.rec)} B × ${fmt(v.cache)}%`)+M("Cache, newest data only",fmtBytes(cacheNew),`${fmtBytes(dbDay)} written per day × ${fmt(v.cache)}%`)+
      M("Incoming bandwidth",fmtBytes(bwIn)+"/s",`${fmt(wq)}/s × ${fmtBytes(v.rec+v.media)}`)+M("API read bandwidth",fmtBytes(bwApi)+"/s",`${fmt(rq)}/s × ${fmt(v.rec)} B`);
    if(v.media>0)h+=M("Media delivery, mostly from the CDN",fmtBytes(bwMedia)+"/s",`${fmt(rq)}/s × ${fmtBytes(v.media)}`);
    $("#cout",el).innerHTML=h;
    const imp=[];
    if(v.ratio>=10)imp.push(`Reads are ${fmt(v.ratio)} times writes: put a cache in front of the database and add read replicas.`);
    else imp.push(`Reads and writes are close (${fmt(v.ratio)} to 1), so caching helps less; plan the database for the write load.`);
    if(wp>10000)imp.push(`Peak writes of ${fmt(wp)}/s are more than one relational primary usually handles (roughly 10,000 simple writes/s): shard, or use a database that partitions automatically such as Cassandra or DynamoDB.`);
    else imp.push(`Peak writes of ${fmt(wp)}/s fit on one well-sized primary database; sharding is not needed for write volume.`);
    if(dbTot>10e12)imp.push(`${fmtBytes(dbTot)} of data over ${fmt(v.years)} years is more than one database server should hold (roughly 10 TB): partition the data across shards.`);
    else imp.push(`${fmtBytes(dbTot)} in total fits on a single database server with replicas.`);
    if(rp>100000)imp.push(`Peak reads of ${fmt(rp)}/s need several cache nodes; one Redis node handles on the order of 100,000 simple operations per second.`);
    imp.push(cacheUp>100e9?`The cache upper bound (${fmtBytes(cacheUp)}) is more than one node's memory: use Redis Cluster across several nodes. The upper bound counts every read as different data, so the real working set is usually much smaller.`:`The cache (${fmtBytes(cacheUp)} at most) fits on one Redis node with a replica.`);
    if(v.media>0)imp.push(`Media goes to object storage behind a CDN; the database keeps only metadata and the object key.`);
    $("#cimp",el).innerHTML=imp.map(x=>`<li>${x}</li>`).join("");
  }
  $("#cpre",el).addEventListener("click",ev=>{const b=ev.target.closest("[data-pre]");if(!b)return;preset=b.dataset.pre;store("capPreset",preset);v={...PRE[preset]};$$("[data-pre]",el).forEach(x=>x.setAttribute("aria-current",String(x===b)));fill();render()});
  F.forEach(([k])=>$("#c-"+k,el).addEventListener("input",ev=>{const n=parseFloat(ev.target.value);if(!isNaN(n)&&n>=0){v[k]=n;$$("[data-pre]",el).forEach(x=>x.setAttribute("aria-current","false"));render()}}));
  fill();render();
},
ref(el){
  el.innerHTML=`<div class="cols even">
   <div class="stack">
    <div class="box"><h3>Time and traffic</h3><div class="tablewrap"><table><tbody>
     <tr><td>Seconds in a day</td><td class="num">86,400 (round to 100,000)</td></tr>
     <tr><td>1 million requests per day</td><td class="num">about 12 per second</td></tr>
     <tr><td>100 million requests per day</td><td class="num">about 1,200 per second</td></tr>
     <tr><td>1 billion requests per day</td><td class="num">about 12,000 per second</td></tr>
     <tr><td>Seconds in a month</td><td class="num">about 2.6 million</td></tr>
     <tr><td>Peak traffic</td><td class="num">often 2 to 3 times the average</td></tr>
    </tbody></table></div></div>
    <div class="box"><h3>Sizes</h3><div class="tablewrap"><table><tbody>
     <tr><td>KB, MB, GB, TB, PB</td><td class="num">10<sup>3</sup>, 10<sup>6</sup>, 10<sup>9</sup>, 10<sup>12</sup>, 10<sup>15</sup> bytes</td></tr>
     <tr><td>Integer ID or timestamp</td><td class="num">8 bytes</td></tr>
     <tr><td>UUID</td><td class="num">16 bytes</td></tr>
     <tr><td>Short text post with metadata</td><td class="num">about 300 bytes</td></tr>
     <tr><td>Chat message with metadata</td><td class="num">about 100 to 200 bytes</td></tr>
     <tr><td>JSON API response</td><td class="num">about 1 to 10 KB</td></tr>
     <tr><td>Compressed photo</td><td class="num">about 200 KB to 3 MB</td></tr>
     <tr><td>1 minute of 1080p video</td><td class="num">about 50 to 100 MB</td></tr>
    </tbody></table></div></div>
   </div>
   <div class="stack">
    <div class="box"><h3>Latency</h3><div class="tablewrap"><table><tbody>
     <tr><td>Main memory reference</td><td class="num">100 ns</td></tr>
     <tr><td>Read 4 KB at random from SSD</td><td class="num">150 µs</td></tr>
     <tr><td>Round trip inside one data center</td><td class="num">500 µs</td></tr>
     <tr><td>Read 1 MB sequentially from SSD</td><td class="num">1 ms</td></tr>
     <tr><td>Hard disk seek</td><td class="num">10 ms</td></tr>
     <tr><td>Round trip California to Netherlands</td><td class="num">150 ms</td></tr>
    </tbody></table></div><p class="note">From "Latency numbers every programmer should know". The hardware figures are older, but the relative sizes still hold: memory is far faster than SSD, and SSD is far faster than a cross-continent round trip.</p></div>
    <div class="box"><h3>Rough single-machine limits</h3><div class="tablewrap"><table><tbody>
     <tr><td>App server</td><td class="num">hundreds to a few thousand requests/s</td></tr>
     <tr><td>Relational primary</td><td class="num">thousands to about 10,000 simple writes/s</td></tr>
     <tr><td>Redis node</td><td class="num">about 100,000 simple operations/s</td></tr>
     <tr><td>WebSocket gateway</td><td class="num">tens of thousands to hundreds of thousands of connections</td></tr>
     <tr><td>Single database server, comfortable size</td><td class="num">up to roughly 10 TB</td></tr>
    </tbody></table></div><p class="note">Planning numbers for interviews; real limits depend on hardware and workload.</p></div>
   </div>
  </div>`;
}
};

/* ---------- labs ---------- */
/* A lab is registered as a deeper view whose tabs are rendered from data. Lab text, files and the setup script are in LAB. */
const WHERE={psa:["PowerShell, as administrator","w-ps"],ps:["PowerShell","w-ps"],wsl:["Ubuntu terminal","w-wsl"],psql:["psql prompt, inside the db container","w-in"],rcli:["redis-cli prompt, inside the redis container","w-in"],win:["Browser on Windows","w-win"],winui:["Windows settings and apps","w-win"],file:["File","w-out"],task:["Task for an AI coding tool","w-out"]};
function labDone(id){const d=store("done."+id);return d&&typeof d==="object"?d:{}}
function labCount(id){
  const done=labDone(id),keys=LAB.labs[id].items;let d=0;
  keys.forEach(k=>{if(done[k])d++});
  return [d,keys.length];
}
/* Paste setting. A terminal without bracketed paste sends a pasted block one line at a time, and a
   "docker compose exec" line then takes the lines after it as input. Parentheses around the block make
   the shell read all of it before it runs the first line. The setting is per viewer (browser storage).
   Not wrapped: single lines, blocks for other places than the Ubuntu terminal, blocks with a cd line
   (cd would stop applying at the closing parenthesis), lines with <job id>, and the setup scripts. */
function parenOn(){return store("paren")===1}
/* A block that sets a shell variable for later blocks (TOKEN=$(...)) is never wrapped: inside ( ) the variable would end with the block. */
function wrappable(w,code){return w==="wsl"&&code.includes("\n")&&!code.includes("<job id>")&&!/(^|\n|&&|;)\s*cd\s/.test(code)&&!/(^|\n)\s*[A-Z_]+=\$\(/.test(code)}
function cmdBlock(w,code,label,nowrap,xi){
  const W=WHERE[w]||[w,"w-out"],wr=!nowrap&&wrappable(w,code),on=wr&&parenOn(),xp=xi!=null;
  return `<div class="cmdb"${wr?` data-wrap data-raw="${esc(code)}"`:""}><div class="cmdh"><span class="where ${W[1]}">${esc(W[0])}</span>${label?`<span class="muted">${esc(label)}</span>`:""}${wr?`<span class="wtag muted"${on?"":" hidden"}>in ( ) for pasting</span>`:""}<span class="sp"></span>${xp?`<button type="button" class="btn xbtn" data-xp="${xi}" aria-expanded="false">Explain</button>`:""}<button type="button" class="btn" data-cp>Copy</button></div><pre class="code${w==="task"?" wrap":""}" tabindex="0">${esc(on?"(\n"+code+"\n)":code)}</pre>${xp?`<div class="xpl" role="region" aria-label="Explanation of the command" hidden></div>`:""}</div>`;
}
/* Explain panel: the block line by line, a map of the parts it reaches, how to read its output.
   The text comes from the build (LAB.x); the map is drawn here from the hops. */
const XMAP={
 stack:{w:400,h:268,frames:[[140,8,252,252,"containers"]],nodes:{
  browser:[8,40,116,44,"Windows browser","localhost:8000"],term:[8,104,116,44,"Ubuntu terminal","where you type"],
  hub:[8,196,116,44,"The internet","Docker Hub, PyPI",1],
  api:[152,40,90,44,"api","FastAPI"],redis:[298,40,90,44,"redis","cache, queue"],
  engine:[152,112,236,28,"Docker Engine","",0,1],
  worker:[152,168,90,44,"worker","arq"],db:[298,168,90,44,"db","PostgreSQL"],
  wlight:[218,222,104,34,"worker-light","light queue",1]},ctrs:["api","worker","wlight","db","redis"]},
 sync:{w:400,h:268,frames:[[140,8,252,252,"containers"]],nodes:{
  term:[8,104,116,44,"Ubuntu terminal","where you type"],hub:[8,196,116,44,"The internet","api.github.com",1],
  gh:[152,40,90,44,"github","stand-in API"],sync:[298,40,90,44,"sync","pull scripts"],
  engine:[152,112,236,28,"Docker Engine","",0,1],
  db:[152,168,90,44,"db","PostgreSQL"],receiver:[298,168,90,44,"receiver","webhooks",1],
  processor:[218,220,104,38,"processor","applies deliveries",1]},ctrs:["gh","sync","db","receiver","processor"]},
 svc:{w:400,h:268,frames:[[140,8,252,252,"containers"]],nodes:{
  browser:[8,40,116,44,"Windows browser","/docs page",1],term:[8,104,116,44,"Ubuntu terminal","where you type"],
  hub:[8,196,116,44,"The internet","Docker Hub, PyPI",1],
  api:[146,40,70,44,"api","FastAPI"],sync:[232,40,70,44,"sync","runner"],gh:[318,40,70,44,"github","stand-in"],
  engine:[146,112,242,28,"Docker Engine","",0,1],
  db:[146,168,70,44,"db","PostgreSQL"],receiver:[318,168,70,44,"receiver","webhooks",1],
  processor:[232,214,70,40,"processor","deliveries",1]},ctrs:["api","sync","gh","db","receiver","processor"]},
 relia:{w:400,h:372,frames:[[140,8,252,356,"containers"]],nodes:{
  term:[8,104,116,44,"Ubuntu terminal","where you type"],hub:[8,196,116,44,"The internet","Docker Hub, PyPI",1],
  api:[152,40,90,44,"api","FastAPI"],redis:[298,40,90,44,"redis","cache, queue"],
  engine:[152,112,236,28,"Docker Engine","",0,1],
  worker:[152,168,90,44,"worker","arq"],db:[298,168,90,44,"db","PostgreSQL"],
  scheduler:[210,236,90,44,"scheduler","relay, sweepers"],
  payproc:[298,312,90,44,"payproc","processor",1],wlight:[152,318,104,30,"worker-light","",1]},ctrs:["api","worker","wlight","db","redis","scheduler","payproc"]},
 host:{w:400,h:300,frames:[[8,8,196,284,"Windows"],[20,126,172,158,"WSL 2 virtual machine"],[214,8,178,284,"Internet"]],nodes:{
  ps:[20,30,172,38,"PowerShell","wsl commands"],winapp:[116,78,80,38,"VS Code","File Explorer",1],
  ubuntu:[32,150,128,38,"Ubuntu terminal","bash, sudo, apt"],engine:[32,206,128,36,"Docker Engine","a service"],
  ctr:[32,252,128,28,"a container","",1],
  ms:[226,30,154,38,"Microsoft","WSL and Ubuntu"],arch:[226,96,154,38,"Ubuntu archive","Ubuntu's packages"],
  drepo:[226,162,154,38,"Docker's repository","Docker's packages"],hub:[226,228,154,38,"Docker Hub","container images"]}}
};
let XID=0;
function xEnd(n,ox,oy){
  /* where an arrow leaves or enters box n, aimed at the point (ox,oy) */
  const [x,y,w,h,,,,band]=n,cx=x+w/2,cy=y+h/2;
  if(band){
    if(ox<x)return [x,cy];
    if(ox>x+w)return [x+w,cy];
    const px=Math.max(x+10,Math.min(x+w-10,ox));return [px,oy<cy?y:y+h];
  }
  const dx=ox-cx,dy=oy-cy;if(!dx&&!dy)return [cx,cy];
  const t=Math.min(Math.abs((w/2+2)/(dx||1e-9)),Math.abs((h/2+2)/(dy||1e-9)));
  return [cx+dx*t,cy+dy*t];
}
function xmapSVG(X){
  const M=XMAP[X.map],id="xm"+(++XID),lit=new Set(X.lit),down=new Set(X.down||[]);X.hops.forEach(h=>{lit.add(h[0]);lit.add(h[1])});
  let s=`<svg class="fig xmap" viewBox="0 0 ${M.w} ${M.h}" role="img" aria-label="Map of the parts this command reaches. The numbered list below the map says the same in words."><defs><marker id="${id}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="xah"/></marker></defs>`;
  /* boxes a badge must not cover: frame labels and every drawn box; boxes an arrow must not cross: every drawn box but the band */
  const labels=[],boxes={};
  M.frames.forEach(([x,y,w,h,l])=>{s+=`<rect class="zone" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text class="zt" x="${x+8}" y="${y+15}">${esc(l)}</text>`;labels.push([x+4,y+4,l.length*6.6+8,15])});
  Object.entries(M.nodes).forEach(([k,n])=>{
    const [x,y,w,h,l,sub,opt,band]=n,on=lit.has(k),dn=down.has(k);if(opt&&!on)return;
    boxes[k]=[x,y,w,h,band];
    const cls=band?"xband":"fnode";
    s+=`<g class="${on?"xon":"xoff"}${dn?" xdown":""}"><rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${band?6:8}"/>`;
    if(band)s+=`<text x="${x+10}" y="${y+h/2+4}">${esc(l)}</text>`;
    else{const sb=dn?"stopped":sub;s+=`<text x="${x+w/2}" y="${y+(sb?17:h/2+4)}" text-anchor="middle">${esc(l)}</text>`;if(sb)s+=`<text class="sm" x="${x+w/2}" y="${y+31}" text-anchor="middle">${esc(sb)}</text>`}
    s+=`</g>`;
  });
  const inside=([px,py],[x,y,w,h],m)=>px>x-m&&px<x+w+m&&py>y-m&&py<y+h+m;
  const pairs={};X.hops.forEach((h,i)=>{const key=[h[0],h[1]].sort().join("|");(pairs[key]=pairs[key]||[]).push(i)});
  const badges=[],placed=[];
  X.hops.forEach((h,i)=>{
    const A=M.nodes[h[0]],B=M.nodes[h[1]];
    const ac=[A[0]+A[2]/2,A[1]+A[3]/2],bc=[B[0]+B[2]/2,B[1]+B[3]/2];
    let p1,p2;
    if(A[7]){p1=xEnd(A,bc[0],bc[1]);p2=xEnd(B,p1[0],p1[1])}
    else if(B[7]){p2=xEnd(B,ac[0],ac[1]);p1=xEnd(A,p2[0],p2[1])}
    else{p1=xEnd(A,bc[0],bc[1]);p2=xEnd(B,ac[0],ac[1])}
    const grp=pairs[[h[0],h[1]].sort().join("|")],k=grp.indexOf(i),off=(k-(grp.length-1)/2)*10*(h[0]<h[1]?1:-1); /* the sign keeps arrows in opposite directions apart */
    let dx=p2[0]-p1[0],dy=p2[1]-p1[1];const len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    const q1=[p1[0]+nx*off,p1[1]+ny*off],q2=[p2[0]+nx*off,p2[1]+ny*off];
    /* an arrow that would cross another box bends around it */
    const others=Object.entries(boxes).filter(([n,b])=>n!==h[0]&&n!==h[1]&&!b[4]).map(([,b])=>b);
    const pt=(c,f)=>{const u=1-f;return c?[u*u*q1[0]+2*u*f*c[0]+f*f*q2[0],u*u*q1[1]+2*u*f*c[1]+f*f*q2[1]]:[q1[0]+(q2[0]-q1[0])*f,q1[1]+(q2[1]-q1[1])*f]};
    const crosses=c=>{for(let f=.04;f<.97;f+=.03){const p=pt(c,f);if(others.some(b=>inside(p,b,2)))return true}return false};
    let c=null;
    if(crosses(null)){const mx=(q1[0]+q2[0])/2,my=(q1[1]+q2[1])/2;for(const d of [50,-50,80,-80,110,-110,140,-140]){const cc=[mx+nx*d,my+ny*d];if(!crosses(cc)){c=cc;break}}}
    const f1=n=>n.toFixed(1);
    s+=`<path class="xarrow${h[3]?" xfail":""}" d="M${f1(q1[0])},${f1(q1[1])} ${c?`Q${f1(c[0])},${f1(c[1])} `:"L"}${f1(q2[0])},${f1(q2[1])}" marker-end="url(#${id})"/>`;
    /* the badge sits on its arrow, at the first spot clear of other badges, frame labels and boxes */
    let bx,by,best=null;
    const tries=len<34?[.5]:[.5,.35,.65,.25,.75,.2,.8,.42,.58,.3,.7,.15,.85];
    const allBoxes=Object.values(boxes).filter(b=>!b[4]);
    const clear=(x,y)=>placed.every(([px,py])=>Math.hypot(px-x,py-y)>=18)&&!labels.some(b=>inside([x,y],b,7))&&!allBoxes.some(b=>inside([x,y],b,6));
    for(const f of tries){
      [bx,by]=pt(c,f);
      if(len<34){const side=off>=0?1:-1;bx+=nx*12*side;by+=ny*12*side}
      if(best===null)best=[bx,by];
      if(clear(bx,by)){best=null;break}
    }
    if(best!==null){/* nothing fully clear: keep clear of other badges at least */
      for(const f of tries){[bx,by]=pt(c,f);if(placed.every(([px,py])=>Math.hypot(px-bx,py-by)>=17))break}
    }
    placed.push([bx,by]);
    badges.push(`<g class="xbadge"><circle cx="${f1(bx)}" cy="${f1(by)}" r="7.5"/><text x="${f1(bx)}" y="${f1(by+3.4)}" text-anchor="middle">${i+1}</text></g>`);
  });
  return `<div class="svgwrap">${s}${badges.join("")}</svg></div>`;
}
/* true when an arrow between two containers passes over the Docker Engine strip of the stack map */
function xCrossesEngine(X){
  const M=XMAP[X.map];if(!M.ctrs)return false;
  const N=M.nodes,E=N.engine,C=M.ctrs;
  return X.hops.some(([a,b])=>C.includes(a)&&C.includes(b)&&((N[a][1]<E[1])!==(N[b][1]<E[1])));
}
function xPanel(i){
  const X=LAB.x.b[i],P=LAB.x.p,N=LAB.x.names,one=X.lines.length===1;
  let h=X.why?`<p class="xwhy">${X.why}</p>`:"";
  const firstLine={},firstPart={};
  h+=`<h4>${one?"The command, part by part":"Line by line"}</h4><ol class="xlines${one?" one":""}">${X.lines.map(([code,ids],n)=>{
    const same=ids.length===1&&P[ids[0]][0]===code.trim(),head=one||same?"":`<code class="xcode">${esc(code)}</code>`;
    const lkey=code+"|"+ids.join(",");
    if(lkey in firstLine)return `<li>${head||`<code class="xcode">${esc(code)}</code>`}<p class="muted">Same as line ${firstLine[lkey]+1}.</p></li>`;
    firstLine[lkey]=n;
    return `<li>${head}<dl class="xparts">${ids.map(k=>{const seen=k in firstPart;if(!seen)firstPart[k]=n;return `<dt><code>${esc(P[k][0])}</code></dt><dd${seen?' class="muted"':""}>${seen?`As in line ${firstPart[k]+1}.`:P[k][1]}</dd>`}).join("")}</dl></li>`}).join("")}</ol>`;
  if(X.map){
    h+=`<h4>Where it goes</h4>${xmapSVG(X)}`;
    const notes=[];
    const anyDown=X.down&&X.down.length;
    if(anyDown||X.hops.some(x=>x[3]))notes.push(!anyDown&&X.map==="sync"?"Dashed: a request that fails.":"Dashed: a part that is stopped at that point, and a request that fails or waits because of it.");
    if(xCrossesEngine(X))notes.push("Containers send requests to each other over the project's network, not through Docker Engine. An arrow that crosses the Docker Engine strip only passes over it in the drawing.");
    if(notes.length)h+=notes.map(n=>`<p class="note xnote">${n}</p>`).join("");
    if(X.hops.length)h+=`<ol class="xhops">${X.hops.map(([a,b,l,f])=>`<li${f?' class="xf"':""}><b>${esc(N[X.map][a])}</b> to <b>${esc(N[X.map][b])}</b>: ${esc(l)}</li>`).join("")}</ol>`;
    else h+=`<p class="note">Nothing leaves ${esc(N[X.map][X.lit[X.lit.length-1]])}: the command reads or changes what is there.</p>`;
  }
  if(X.read)h+=`<h4>Reading the output</h4><p>${X.read}</p>`;
  return h;
}
function cmdRefHTML(b){
  const MAX=8;
  return `<div class="cref"><p class="muted m0">The ${b.count} commands this lab uses, by group. Each entry links to the places that use it. The <b>Explain</b> button on a command block takes that block apart line by line.</p>
   <label class="cfilter"><span>Find a command</span><input type="search" data-cfilter placeholder="for example logs" autocomplete="off"></label>
   ${b.groups.map(g=>`<section class="crefg"><h3>${esc(g.name)}</h3><dl>${g.items.map(it=>{
     const more=it.used.length-MAX,u=it.used.slice(0,MAX).map(([r,l])=>`<a href="#${r}">${esc(l)}</a>`).join("; ");
     return `<div class="crefi" data-cname="${esc((it.name+" "+it.text.replace(/<[^>]+>/g,"")).toLowerCase())}"><dt><code>${esc(it.name)}</code></dt><dd>${it.text}<span class="cused">Used in: ${u}${more>0?`; and ${more} more place${more>1?"s":""}`:""}.</span></dd></div>`}).join("")}</dl></section>`).join("")}
   <p class="note cnone" hidden>No command matches.</p></div>`;
}
function applyParen(){
  const on=parenOn();
  $$(".cmdb[data-wrap]").forEach(b=>{
    $("pre",b).textContent=on?"(\n"+b.dataset.raw+"\n)":b.dataset.raw;
    const t=$(".wtag",b);if(t)t.hidden=!on;
  });
  $$("[data-paren]").forEach(c=>{c.checked=on});
}
function outBlock(code,label){
  return `<div class="cmdb out"><div class="cmdh"><span class="where w-out">${esc(label||"What you should see")}</span></div><pre class="code" tabindex="0">${esc(code)}</pre></div>`;
}
function doneBox(lab,k,on){return `<label><input type="checkbox" data-done="${lab}:${k}"${on?" checked":""}> Done</label>`}
function labBlocks(arr,lab){return (arr||[]).map(b=>labBlock(b,lab)).join("")}
function labBlock(b,lab){
  switch(b.t){
    case "p":return `<p>${b.h}</p>`;
    case "h":return `<h3>${esc(b.x)}</h3>`;
    case "ul":return `<ul class="plain">${b.items.map(i=>`<li>${i}</li>`).join("")}</ul>`;
    case "ol":return `<ol class="steps">${b.items.map(i=>`<li>${i}</li>`).join("")}</ol>`;
    case "note":return `<p class="note">${b.h}</p>`;
    case "callout":return `<div class="callout">${b.h}</div>`;
    case "cmd":return cmdBlock(b.w,b.c,b.label,false,b.x);
    case "cmdref":return cmdRefHTML(b);
    case "out":return outBlock(b.c,b.label);
    case "table":return `<div class="tablewrap${b.narrow?" narrow":""}"><table><thead><tr>${b.head.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "pastepref":return `<label class="ppref"><input type="checkbox" data-paren${parenOn()?" checked":""}><span>${b.compact?"Put copied blocks in parentheses. Turn this on if your terminal failed the paste check.":"My terminal failed the paste check. Put copied blocks in parentheses."}</span></label>`;
    case "setupcopy":return setupCopyHTML(b.id);
    case "fileviews":return fileViewsHTML(b.id);
    case "dl":return `<dl class="fields">${b.rows.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    case "acc":return b.items.map(it=>`<details class="acc"><summary><span>${it.s}</span></summary><div>${labBlocks(it.b,lab)}</div></details>`).join("");
    case "box":return `<div class="box">${labBlocks(b.b,lab)}</div>`;
    case "fig":return `<div class="svgwrap">${LABFIG[b.id]()}</div>${b.caption?`<p class="figcap">${b.caption}</p>`:""}`;
    case "nodes":return `<div class="chips">${b.ids.map(id=>`<button type="button" class="chip" data-gonode="${id}">${esc(NODES[id].name)} <span class="muted">on the map</span></button>`).join("")}</div>`;
    case "files":return filesBlock(b.id);
    case "steps":{const done=labDone(lab);return `<ol class="lsteps">${b.items.map(s=>`<li class="${done[s.k]?"done":""}"><div class="lsh"><span class="num" aria-hidden="true"></span><h3>${esc(s.title)}</h3>${doneBox(lab,s.k,done[s.k])}</div>${s.w?`<p class="stepw"><span>Runs in</span>${s.w.map(k=>`<span class="where ${WHERE[k][1]}">${esc(WHERE[k][0])}</span>`).join("")}</p>`:""}${labBlocks(s.b,lab)}</li>`).join("")}</ol>`}
    case "ops":return `<section class="opsg"><h3>${esc(b.name)}</h3>${b.items.map(o=>`<div class="op"><h4>${esc(o.task)}</h4>${labBlocks(o.b,lab)}</div>`).join("")}</section>`;
    case "ex":{const done=labDone(lab);return b.items.map(x=>{
      const cmp=(x.explain||x.obs)?`<details class="acc"><summary><span>${x.obs?"Compare with your prediction: results of the test run":"Compare with your prediction"}</span></summary><div>${x.explain?`<p>${x.explain}</p>`:""}${x.obs?labBlocks(x.obs,lab):""}</div></details>`:"";
      const back=x.back?`<div class="back"><b>Explain back</b><ul class="plain">${x.back.map(q=>`<li>${q}</li>`).join("")}</ul></div>`:"";
      return `<section class="exc"><div class="exh"><h3>${esc(x.title)}</h3>${doneBox(lab,x.k,done[x.k])}</div><p class="muted m0">${x.goal}</p>${x.predict?`<div class="predict"><b>Predict first</b>${x.predict}</div>`:""}${labBlocks(x.b,lab)}${cmp}${back}</section>`}).join("")}
  }
  return "";
}
function diffHTML(d){return d.split("\n").map(l=>{const c=l.startsWith("@@")?"hunk":l[0]==="+"?"add":l[0]==="-"?"del":"";return c?`<span class="${c}">${esc(l)}</span>`:esc(l)}).join("\n")}
function fileViewHTML(id,path){
  const f=LAB.files[id].find(x=>x.path===path);
  const code=f.code?`<div class="cmdb"><div class="cmdh"><span class="where w-out">File</span><span class="muted">${esc(LAB.folder[id])}/${esc(f.path)}</span><span class="sp"></span><button type="button" class="btn" data-cp>Copy</button></div><pre class="code" tabindex="0">${esc(f.code)}</pre></div>`:`<p class="note">This file is empty.</p>`;
  const diff=f.diff?`<details class="acc"><summary><span>Changes from ${esc(f.base||"Lab 1")}: ${f.added} lines added, ${f.removed} removed</span></summary><div><p class="note">A line that starts with + was added and a line that starts with - was removed. The other lines are unchanged and show where the change is. A line that starts with @@ gives the position in the file.</p><pre class="code diff" tabindex="0">${diffHTML(f.diff)}</pre></div></details>`:"";
  return `<h4 class="m0"><code>${esc(f.path)}</code>${f.tag?` <span class="pill plan">${esc(f.tag)}</span>`:""}</h4><p class="muted small">${esc(f.desc)}</p>${f.notes.length?`<h4>Reading notes</h4><ul class="plain">${f.notes.map(n=>`<li>${n}</li>`).join("")}</ul>`:""}${diff}${code}`;
}
function setupCopyHTML(id){
  const U=LAB.filesui[id],lines=LAB.setup[id].split("\n").length;
  return `<div class="btnrow"><button type="button" class="btn primary" data-cpsetup="${id}">${esc(U.button)}</button></div>
   <details class="acc" data-setupbox="${id}"><summary><span>${esc(U.read)} (${lines} lines)</span></summary><div>${cmdBlock("wsl",LAB.setup[id],null,true)}</div></details>`;
}
function fileViewsHTML(id){
  const F=LAB.files[id];
  let cur=store("file."+id);if(!F.some(f=>f.path===cur))cur=F[0].path;
  return `<div class="fbrow"><ul class="ftree" data-ftree="${id}">${F.map(f=>`<li><button type="button" data-file="${esc(f.path)}" aria-current="${f.path===cur}">${esc(f.path)}${f.tag?` <span class="pill plan">${esc(f.tag)}</span>`:""}<small>${esc(f.desc)}</small></button></li>`).join("")}</ul>
   <div data-fview="${id}">${fileViewHTML(id,cur)}</div></div>`;
}
function filesBlock(id){
  const F=LAB.files[id],dir=LAB.folder[id],U0=LAB.filesui[id];
  return `<div class="box"><h3>Create all the files with one paste</h3>
   <p>${U0.intro?U0.intro.replace("{n}",F.length).replace("{dir}",esc(dir)):`The setup script writes the ${F.length} files of this lab into a new folder named <code>${esc(dir)}</code>. It only writes files and starts nothing. Running it again replaces the lab files and leaves your <code>.env</code> alone.`}</p>
   <ol class="steps"><li>In the Ubuntu terminal, go to your labs folder: <code>mkdir -p ~/labs &amp;&amp; cd ~/labs</code></li>
   <li>Copy the script, paste it into the terminal and press Enter. Windows Terminal asks before pasting several lines, so choose <b>Paste anyway</b>.</li>
   <li>The last line it prints should be <code>${U0.last?U0.last.replace("{n}",F.length).replace("{dir}",esc(dir)):`Created ${F.length} files in /home/&lt;you&gt;/labs/${esc(dir)}`}</code>.</li></ol>
   ${setupCopyHTML(id)}
   <p class="note">The script is generated from the files shown below, so the two always match.</p></div>
  <div class="box"><h3>The files, with reading notes</h3>${fileViewsHTML(id)}</div>`;
}
function labProgress(lab){
  const [d,n]=labCount(lab);
  $$(`[data-prog="${lab}"]`).forEach(p=>{p.innerHTML=`<span>${d} of ${n} steps and exercises marked done in this lab</span><span class="hbar"><i style="width:${n?d/n*100:0}%"></i></span>`});
}
function labTab(lab,tab,el){
  const T=LAB.labs[lab].body[tab];if(!T)return;
  const track=(T.main||[]).some(b=>b.t==="steps"||b.t==="ex");
  el.innerHTML=T.side
    ?`<div class="cols labcols"><div class="stack">${labBlocks(T.main,lab)}</div><div class="stack">${labBlocks(T.side,lab)}</div></div>`
    :`<div class="labmain">${track?`<p class="lprog" data-prog="${lab}"></p>`:""}${labBlocks(T.main,lab)}</div>`;
  labProgress(lab);
}
function buildLabs(){
  $("#labgrid").innerHTML=LAB.order.map(id=>{
    const L=LAB.labs[id],[d,n]=labCount(id);
    return `<button type="button" class="vcard" data-plane="lab-${id}"><span class="kick">${esc(L.kicker)}</span><b>${esc(L.name)}</b><span>${esc(L.blurb)}</span><span class="tabsline">${esc(L.time)}</span><span class="tabsline">${d?`${d} of ${n} steps and exercises marked done`:`Tabs: ${L.tabs.filter(t=>t[0]!=="res").map(t=>t[1]).join(", ")}`}</span><span class="go">Open lab →</span></button>`}).join("");
  $("#plangrid").innerHTML=LAB.planned.map(p=>`<div class="vcard planned"><span class="pill plan">Planned${p.kicker?" · "+esc(p.kicker):""}</span><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span><span class="tabsline">On the map: ${p.covers.map(c=>esc(NODES[c].name)).join(", ")}</span></div>`).join("");
}
function nodeLabs(id){
  const ready=LAB.order.filter(l=>LAB.labs[l].covers.includes(id)),plan=LAB.planned.filter(p=>p.covers.includes(id));
  if(!ready.length&&!plan.length)return "";
  return `<h4>Hands-on labs</h4>${ready.length?`<div class="chips">${ready.map(l=>`<button type="button" class="chip" data-plane="lab-${l}">${esc(LAB.labs[l].kicker)}: ${esc(LAB.labs[l].name)}</button>`).join("")}</div>`:""}${plan.length?`<p class="note">Planned: ${plan.map(p=>esc(p.name)).join("; ")}.</p>`:""}`;
}
function startLabs(){
  return `<h4>Hands-on labs</h4><ol class="steps">${LAB.order.map(l=>`<li><button type="button" class="linkbtn" data-plane="lab-${l}">${esc(LAB.labs[l].name)}</button>: ${esc(LAB.labs[l].blurb)}</li>`).join("")}</ol><p class="note">${LAB.planned.length} more labs are planned. They are listed below the map.</p>`;
}
function labCopy(btn,text,pre){
  if(!btn.dataset.label)btn.dataset.label=btn.textContent;
  const back=()=>setTimeout(()=>{btn.textContent=btn.dataset.label},1600);
  const done=()=>{btn.textContent="Copied";back()};
  const select=()=>{if(!pre)return;const d=pre.closest("details");if(d)d.open=true;const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r);btn.textContent="Selected. Press Ctrl+C";back()};
  try{navigator.clipboard.writeText(text).then(done,select)}catch(e){select()}
}
defer(document,"click",ev=>{
  const xb=ev.target.closest("[data-xp]");
  if(xb){
    const pnl=$(".xpl",xb.closest(".cmdb")),open=xb.getAttribute("aria-expanded")==="true";
    if(!pnl.innerHTML)pnl.innerHTML=xPanel(+xb.dataset.xp);
    pnl.hidden=open;xb.setAttribute("aria-expanded",String(!open));xb.textContent=open?"Explain":"Hide explanation";
    return;
  }
  const c=ev.target.closest("[data-cp]");
  if(c){const pre=$("pre",c.closest(".cmdb"));labCopy(c,pre.textContent,pre);return}
  const s=ev.target.closest("[data-cpsetup]");
  if(s){const id=s.dataset.cpsetup;labCopy(s,LAB.setup[id],$(`[data-setupbox="${id}"] pre`));return}
  const f=ev.target.closest("[data-file]");
  if(f){
    const tree=f.closest("[data-ftree]"),id=tree.dataset.ftree,view=$(`[data-fview="${id}"]`);
    store("file."+id,f.dataset.file);
    $$("[data-file]",tree).forEach(b=>b.setAttribute("aria-current",String(b===f)));
    view.innerHTML=fileViewHTML(id,f.dataset.file);
    if(matchMedia("(max-width: 880px)").matches)view.scrollIntoView({behavior:RM?"auto":"smooth",block:"start"});
    return;
  }
  const g=ev.target.closest("[data-gonode]");
  if(g){
    showMap();
    try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
    selectNode(g.dataset.gonode,false);
    $("#mapcard").scrollIntoView({block:"start"});
  }
});
defer(document,"input",ev=>{
  const f=ev.target.closest("[data-cfilter]");if(!f)return;
  const q=f.value.trim().toLowerCase(),root=f.closest(".cref");let any=false;
  $$(".crefg",root).forEach(g=>{let n=0;$$(".crefi",g).forEach(i=>{const on=!q||i.dataset.cname.includes(q);i.hidden=!on;if(on)n++});g.hidden=!n;if(n)any=true});
  $(".cnone",root).hidden=any;
});
defer(document,"change",ev=>{
  const pp=ev.target.closest("[data-paren]");
  if(pp){store("paren",pp.checked?1:0);applyParen();return}
  const c=ev.target.closest("[data-done]");if(!c)return;
  const [lab,k]=c.dataset.done.split(":"),d=labDone(lab);
  if(c.checked)d[k]=1;else delete d[k];
  store("done."+lab,d);
  const li=c.closest("ol.lsteps > li");if(li)li.classList.toggle("done",c.checked);
  labProgress(lab);buildLabs();
});

/* lab figures */
const LABFIG={
where(){
  const N=(x,y,w,hh,a,b)=>`<rect class="fnode" x="${x}" y="${y}" width="${w}" height="${hh}" rx="8"/><text x="${x+w/2}" y="${y+(b?16:hh/2+4)}" text-anchor="middle">${a}</text>${b?`<text class="sm" x="${x+w/2}" y="${y+30}" text-anchor="middle">${b}</text>`:""}`;
  return `<svg class="fig" viewBox="0 0 400 312" role="img" aria-label="Windows contains PowerShell, a browser and VS Code. Inside Windows, the WSL 2 virtual machine runs Ubuntu, which holds the terminal, the lab files and Docker Engine with its containers.">
  <defs><marker id="lf-a1" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>
  <rect class="zonef" x="4" y="4" width="392" height="304" rx="12"/><text class="zt" x="16" y="22">Windows 10 or 11</text>
  ${N(16,30,112,36,"Browser")}${N(144,30,112,36,"PowerShell")}${N(272,30,112,36,"VS Code")}
  <rect class="zone" x="16" y="92" width="368" height="204" rx="10"/><text class="zt" x="372" y="110" text-anchor="end">WSL 2: Ubuntu</text>
  ${N(120,118,160,40,"Ubuntu terminal","docker, curl, git")}${N(292,118,80,40,"~/labs","lab files")}
  <rect class="zone" x="28" y="176" width="344" height="108" rx="10"/><text class="zt" x="360" y="194" text-anchor="end">Docker Engine</text>
  ${N(40,204,74,34,"api")}${N(122,204,74,34,"worker")}${N(204,204,74,34,"db")}${N(286,204,74,34,"redis")}
  <text class="sm" x="200" y="262" text-anchor="middle">containers on one private network, data in volumes</text>
  <path class="arrow" d="M77,66 V202" marker-end="url(#lf-a1)"/><text class="lbl" x="83" y="84">localhost:8000</text>
  <path class="arrow" d="M200,66 V116" marker-end="url(#lf-a1)"/><text class="lbl" x="206" y="84">wsl</text>
  <path class="arrowd" d="M332,66 V116" marker-end="url(#lf-a1)"/><text class="lbl" x="326" y="84" text-anchor="end">WSL extension</text>
  <path class="arrow" d="M200,158 V174" marker-end="url(#lf-a1)"/><text class="lbl" x="206" y="171">docker compose</text>
  </svg>`;
},
stack(){
  const N=(x,y,w,hh,a,b,c)=>`<rect class="fnode" x="${x}" y="${y}" width="${w}" height="${hh}" rx="8"/><text x="${x+w/2}" y="${y+(b?17:hh/2+4)}" text-anchor="middle">${a}</text>${b?`<text class="sm" x="${x+w/2}" y="${y+31}" text-anchor="middle">${b}</text>`:""}${c?`<text class="sm" x="${x+w/2}" y="${y+44}" text-anchor="middle">${c}</text>`:""}`;
  return `<svg class="fig" viewBox="0 0 400 292" role="img" aria-label="A browser or curl calls the api container on localhost port 8000. Inside the Compose network, api reads and writes db, uses redis as cache and queue, and worker takes jobs from redis and updates db.">
  <defs><marker id="lf-a2" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>
  ${N(130,6,140,32,"curl or browser")}
  <rect class="zone" x="8" y="66" width="384" height="218" rx="10"/><text class="zt" x="20" y="276">Compose network</text>
  ${N(130,92,140,42,"api","FastAPI, port 8000")}
  ${N(24,200,150,56,"db","PostgreSQL 16","volume pgdata")}
  ${N(226,170,150,44,"redis","cache and job queue")}
  ${N(226,232,150,42,"worker","arq")}
  <path class="arrow" d="M200,38 V90" marker-end="url(#lf-a2)"/><text class="lbl" x="206" y="54">HTTP, localhost:8000</text>
  <path class="arrow" d="M150,134 V166 H99 V198" marker-end="url(#lf-a2)"/><text class="lbl" x="105" y="160">SQL</text>
  <path class="arrow" d="M250,134 V152 H301 V168" marker-start="url(#lf-a2)" marker-end="url(#lf-a2)"/><text class="lbl" x="307" y="162">cache, queue</text>
  <path class="arrow" d="M301,214 V230" marker-end="url(#lf-a2)"/><text class="lbl" x="307" y="226">jobs</text>
  <path class="arrow" d="M226,246 H176" marker-end="url(#lf-a2)"/><text class="lbl" x="201" y="240" text-anchor="middle">UPDATE</text>
  </svg>`;
},
jobpath(){
  const N=(x,y,w,hh,a,b)=>`<rect class="fnode" x="${x}" y="${y}" width="${w}" height="${hh}" rx="8"/><text x="${x+w/2}" y="${y+(b?17:hh/2+4)}" text-anchor="middle">${a}</text>${b?`<text class="sm" x="${x+w/2}" y="${y+31}" text-anchor="middle">${b}</text>`:""}`;
  const K=(y,a,b)=>`<rect class="fkey" x="188" y="${y}" width="196" height="32" rx="6"/><text class="mono" x="197" y="${y+13}">${a}</text><text class="sm" x="197" y="${y+26}">${b}</text>`;
  const C=(x,y,n)=>`<circle class="fnum" cx="${x}" cy="${y}" r="8"/><text class="fnumt" x="${x}" y="${y+3.5}" text-anchor="middle">${n}</text>`;
  return `<svg class="fig" viewBox="0 0 400 324" role="img" aria-label="Six numbered steps. 1: a client calls the api. 2: the api writes the job to Redis. 3: the worker takes the job from Redis. 4: the worker updates the database. 5: the worker writes the result to Redis. 6: the api reads the job's status from Redis.">
  <defs><marker id="lf-a3" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>
  ${N(16,8,124,34,"curl or browser")}
  ${N(16,96,124,44,"api","producer")}
  <rect class="zone" x="176" y="56" width="216" height="182" rx="10"/><text class="zt" x="380" y="73" text-anchor="end">redis</text>
  ${K(80,"arq:queue","ids of waiting and running jobs")}
  ${K(118,"arq:job:&lt;id&gt;","function name and arguments")}
  ${K(156,"arq:in-progress:&lt;id&gt;","marker: taken by a worker")}
  ${K(194,"arq:result:&lt;id&gt;","result or error, kept one hour")}
  ${N(232,270,124,44,"worker","runs the function")}
  ${N(16,270,124,44,"db","notes table")}
  <path class="arrow" d="M78,42 V94" marker-end="url(#lf-a3)"/>${C(94,68,1)}
  <path class="arrow" d="M140,108 H186" marker-end="url(#lf-a3)"/>${C(160,96,2)}
  <path class="arrowd" d="M140,130 H186" marker-end="url(#lf-a3)"/>${C(160,144,6)}
  <path class="arrow" d="M264,238 V268" marker-end="url(#lf-a3)"/>${C(250,253,3)}
  <path class="arrow" d="M324,270 V240" marker-end="url(#lf-a3)"/>${C(338,255,5)}
  <path class="arrow" d="M232,292 H142" marker-end="url(#lf-a3)"/>${C(187,280,4)}
  </svg>`;
},
stopkill(){
  const X=t=>52+t*1.6;
  const ticks=[0,30,60,90,120,150,180,210];
  return `<svg class="fig" viewBox="0 0 400 214" role="img" aria-label="Two timelines of one job. After a normal stop at 3 seconds, the second attempt starts about 4 seconds after the first. After a kill at 3 seconds, the marker stays for 190 seconds and the second attempt starts when it expires.">
  <text x="4" y="46">Stop</text>
  <rect class="tlrun" x="${X(0)}" y="34" width="5" height="16" rx="2"/>
  <rect class="tlrun" x="${X(4.4)}" y="34" width="${(20*1.6).toFixed(1)}" height="16" rx="2"/>
  <text class="sm" x="${X(27)}" y="46">second attempt, about 4 s after the first start</text>
  <text class="sm" x="${X(0)}" y="26">job starts, worker stopped at 3 s</text>
  <line class="gridd" x1="52" y1="70" x2="388" y2="70"/>
  <text x="4" y="110">Kill</text>
  <rect class="tlrun" x="${X(0)}" y="98" width="5" height="16" rx="2"/>
  <rect class="tlmark" x="${X(0)}" y="120" width="${(190*1.6).toFixed(1)}" height="7" rx="2"/>
  <rect class="tlrun" x="${X(190.4)}" y="98" width="${(10*1.6).toFixed(1)}" height="16" rx="2"/>
  <text class="sm" x="${X(0)}" y="90">job starts, worker killed at 3 s</text>
  <text class="sm" x="${X(6)}" y="110">worker started again, idle</text>
  <text class="sm" x="${X(200)}" y="90" text-anchor="end">second attempt at 190 s</text>
  <text class="sm" x="${X(0)}" y="142">marker arq:in-progress:&lt;id&gt; lasts job_timeout + 10 = 190 s</text>
  <line class="grid" x1="52" y1="160" x2="388" y2="160"/>
  ${ticks.map(t=>`<line class="grid" x1="${X(t)}" y1="160" x2="${X(t)}" y2="165"/><text class="sm" x="${X(t)}" y="178" text-anchor="middle">${t}</text>`).join("")}
  <text class="sm" x="220" y="198" text-anchor="middle">seconds after the job first started</text>
  </svg>`;
},
twoqueues(){
  const N=(x,y,w,hh,a,b)=>`<rect class="fnode" x="${x}" y="${y}" width="${w}" height="${hh}" rx="8"/><text x="${x+w/2}" y="${y+17}" text-anchor="middle">${a}</text><text class="sm" x="${x+w/2}" y="${y+31}" text-anchor="middle">${b}</text>`;
  const K=(y,a,b)=>`<rect class="fkey" x="150" y="${y}" width="104" height="36" rx="6"/><text class="mono" x="202" y="${y+15}" text-anchor="middle">${a}</text><text class="sm" x="202" y="${y+28}" text-anchor="middle">${b}</text>`;
  return `<svg class="fig" viewBox="0 0 400 190" role="img" aria-label="The api writes each job to one of two queues in Redis. The worker container reads the default queue, arq:queue. The worker-light container reads the light queue, arq:light.">
  <defs><marker id="lf-a4" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>
  ${N(8,72,100,44,"api","POST /jobs")}
  <rect class="zone" x="138" y="12" width="128" height="166" rx="10"/><text class="zt" x="254" y="30" text-anchor="end">redis</text>
  ${K(44,"arq:queue","queue: default")}
  ${K(128,"arq:light","queue: light")}
  ${N(296,40,98,44,"worker","4 jobs at once")}
  ${N(296,124,98,44,"worker-light","10 jobs at once")}
  <path class="arrow" d="M108,86 H124 V62 H148" marker-end="url(#lf-a4)"/>
  <path class="arrow" d="M108,102 H124 V146 H148" marker-end="url(#lf-a4)"/>
  <path class="arrow" d="M254,62 H294" marker-end="url(#lf-a4)"/>
  <path class="arrow" d="M254,146 H294" marker-end="url(#lf-a4)"/>
  </svg>`;
},
threestacks(){
  const X=[12,140,268],C=[72,200,328],W=120;
  const B=(c,y,h,cls,lines)=>`<rect class="${cls}" x="${X[c]}" y="${y}" width="${W}" height="${h}" rx="8"/>`+lines.map(l=>`<text${l[2]?` class="${l[2]}"`:""} x="${C[c]}" y="${y+l[1]}" text-anchor="middle">${l[0]}</text>`).join("");
  const R=(y,t)=>`<text class="zt" x="12" y="${y}">${t}</text>`;
  const T=(c,y,a,b)=>`<text class="sm" x="${C[c]}" y="${y}" text-anchor="middle">${a}</text><text class="sm" x="${C[c]}" y="${y+13}" text-anchor="middle">${b}</text>`;
  const app=[["app",17],["writes the job",31,"sm"]],wrk=[["worker",17],["runs the function",31,"sm"]],opt=[["optional",25,"sm"],["for example Celery",39,"sm"]];
  return `<svg class="fig" viewBox="0 0 400 402" role="img" aria-label="Three columns compare arq on Redis, RabbitMQ and Amazon SQS across four rows: producer, broker, task library and worker. With arq, the task library tracks unfinished jobs with a marker that Redis holds. With RabbitMQ and SQS, the broker tracks them, with acknowledgements and with the visibility timeout. A task library is optional on RabbitMQ and SQS.">
  <text x="${C[0]}" y="15" text-anchor="middle">arq on Redis</text><text class="sm" x="${C[0]}" y="28" text-anchor="middle">this lab</text>
  <text x="${C[1]}" y="15" text-anchor="middle">RabbitMQ</text><text class="sm" x="${C[1]}" y="28" text-anchor="middle">not run here</text>
  <text x="${C[2]}" y="15" text-anchor="middle">Amazon SQS</text><text class="sm" x="${C[2]}" y="28" text-anchor="middle">not run here</text>
  ${R(48,"Producer")}${B(0,54,40,"fnode",app)}${B(1,54,40,"fnode",app)}${B(2,54,40,"fnode",app)}
  ${R(112,"Broker")}
  ${B(0,118,56,"fnode",[["Redis",17],["holds the jobs",32,"sm"],["and the marker",45,"sm"]])}
  ${B(1,118,56,"fmarkd",[["RabbitMQ",17],["tracks with",32,"ftag"],["acknowledgements",46,"smk"]])}
  ${B(2,118,56,"fmarkd",[["SQS",17],["tracks with",32,"ftag"],["visibility timeout",46,"smk"]])}
  ${R(192,"Task library")}
  ${B(0,198,56,"fmarkd",[["arq",17],["tracks with",32,"ftag"],["in-progress marker",46,"smk"]])}
  ${B(1,198,56,"fopt",opt)}${B(2,198,56,"fopt",opt)}
  ${R(272,"Worker")}${B(0,278,40,"fnode",wrk)}${B(1,278,40,"fnode",wrk)}${B(2,278,40,"fnode",wrk)}
  ${R(336,"When the job is done")}
  ${T(0,352,"arq records the result","and deletes the marker")}${T(1,352,"the worker sends","an acknowledgement")}${T(2,352,"the worker deletes","the message")}
  <rect class="fmarkd" x="12" y="382" width="16" height="12" rx="3"/><text class="sm" x="34" y="392">marked: tracks unfinished jobs and hands them out again</text>
  </svg>`;
},
outbox(){
  const N=(x,y,w,hh,cls,a,b)=>`<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${hh}" rx="8"/><text x="${x+w/2}" y="${y+17}" text-anchor="middle">${a}</text><text class="sm" x="${x+w/2}" y="${y+31}" text-anchor="middle">${b}</text>`;
  return `<svg class="fig" viewBox="0 0 400 366" role="img" aria-label="The api writes a notes row and an outbox row to PostgreSQL in one transaction and does not write to the broker. A relay reads the unsent outbox rows, sends each one to the broker and marks it sent. The worker takes the job from the broker. The outbox table and the relay are the two parts the pattern adds.">
  <defs><marker id="lf-a5" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>
  ${N(12,26,112,44,"fnode","api","producer")}
  <text class="sm" x="68" y="88" text-anchor="middle">does not write</text><text class="sm" x="68" y="101" text-anchor="middle">to the broker</text>
  <rect class="zone" x="148" y="8" width="244" height="106" rx="10"/><text class="zt" x="380" y="25" text-anchor="end">postgresql</text>
  <rect class="fkey" x="160" y="34" width="104" height="42" rx="6"/><text x="212" y="51" text-anchor="middle">notes table</text><text class="sm" x="212" y="65" text-anchor="middle">one row</text>
  <rect class="fmarkd" x="276" y="34" width="104" height="42" rx="6"/><text x="328" y="51" text-anchor="middle">outbox table</text><text class="ftag" x="328" y="66" text-anchor="middle">added</text>
  <text class="sm" x="270" y="100" text-anchor="middle">one transaction writes both rows</text>
  <path class="arrow" d="M124,48 H146" marker-end="url(#lf-a5)"/>
  <rect class="fmarkd" x="148" y="140" width="244" height="56" rx="8"/><text x="160" y="158">relay</text><text class="ftag" x="380" y="158" text-anchor="end">added</text>
  <text class="sm" x="160" y="174">reads unsent outbox rows, sends each one</text><text class="sm" x="160" y="187">to the broker, then marks it sent</text>
  <path class="arrow" d="M328,76 V138" marker-end="url(#lf-a5)"/><text class="lbl" x="322" y="131" text-anchor="end">unsent rows</text>
  ${N(148,222,244,44,"fnode","broker","Redis with arq, RabbitMQ or SQS")}
  <path class="arrow" d="M270,196 V220" marker-end="url(#lf-a5)"/><text class="lbl" x="277" y="213">job</text>
  ${N(148,288,244,44,"fnode","worker","then as in The path of one job")}
  <path class="arrow" d="M270,266 V286" marker-end="url(#lf-a5)"/>
  <rect class="fmarkd" x="12" y="346" width="16" height="12" rx="3"/><text class="sm" x="34" y="356">marked: the two parts the outbox pattern adds</text>
  </svg>`;
}
};


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
