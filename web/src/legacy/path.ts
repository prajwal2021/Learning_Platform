// @ts-nocheck
/* eslint-disable */
/* Interactive code of the Learning Path page, moved over with its behaviour unchanged.
   Ticks are read from and saved to the API instead of the browser. */
export function start(initial, save) {
  "use strict";
  var root = document.getElementById("lp");
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); };
  var steps = all(".step"), units = all(".unit");

  /* Ticks are kept on the server. If a save fails, they last until the page is closed. */
  var done = initial && typeof initial === "object" ? Object.assign({}, initial) : {}, kept = true;
  function keep() { save(done).then(function () { kept = true; $("nx-warn").hidden = true; }, function () { kept = false; $("nx-warn").hidden = false; }); }

  function sid(li) { return li.getAttribute("data-step"); }
  function isDone(li) { return done[sid(li)] === true; }
  function unitOf(li) { return li.closest(".unit"); }
  function unitLabel(u) {
    var n = u.getAttribute("data-unit"), name = u.getAttribute("data-name");
    return n === "E" ? name : "Unit " + n + ", " + name;
  }

  var nextStep = null;
  function render() {
    var total = 0, count = 0;
    nextStep = null;
    steps.forEach(function (li) {
      var on = isDone(li);
      li.querySelector("input").checked = on;
      li.classList.toggle("done", on);
      li.classList.remove("isnext");
      if (!li.hasAttribute("data-opt")) { total++; if (on) count++; else if (!nextStep) nextStep = li; }
    });
    units.forEach(function (u) {
      var req = all(".step:not([data-opt])", u), d = req.filter(isDone).length;
      var c = u.querySelector("[data-count]");
      if (c) c.textContent = req.length ? d + " of " + req.length + " done" : "";
      var full = req.length > 0 && d === req.length;
      u.classList.toggle("alldone", full);
      var r = root.querySelector('.rail a[data-unit="' + u.getAttribute("data-unit") + '"]');
      if (r) { r.classList.toggle("alldone", full); r.removeAttribute("aria-current"); }
    });
    $("nx-bar").style.width = (total ? Math.round(count / total * 100) : 0) + "%";
    $("nx-prog").textContent = count + " of " + total + " steps done. Optional steps are not counted.";
    $("nx-warn").hidden = kept;
    if (nextStep) {
      var u = unitOf(nextStep), go = nextStep.querySelector(".go");
      nextStep.classList.add("isnext");
      var r2 = root.querySelector('.rail a[data-unit="' + u.getAttribute("data-unit") + '"]');
      if (r2) r2.setAttribute("aria-current", "step");
      $("nx-unit").textContent = unitLabel(u);
      $("nx-text").innerHTML = nextStep.querySelector(".kind").outerHTML + " " + nextStep.querySelector(".stext").innerHTML;
      $("nx-open").hidden = !go;
      if (go) { $("nx-open").href = go.getAttribute("href"); $("nx-open").textContent = go.textContent; }
      $("nx-done").hidden = false;
      $("nx-show").textContent = "Show in the list";
    } else {
      var p = root.querySelector(".unit.planned");
      $("nx-unit").textContent = "All steps are done";
      $("nx-text").textContent = p ? "The next unit to be built is unit " + p.getAttribute("data-unit") + ", " + p.getAttribute("data-name") + ". Its section lists what is available now." : "";
      $("nx-open").hidden = true;
      $("nx-done").hidden = true;
      $("nx-show").textContent = p ? "Go to unit " + p.getAttribute("data-unit") : "Show the list";
    }
  }

  function show(el, focusEl) {
    var u = el.closest(".unit") || el;
    if (u.tagName === "DETAILS") u.open = true;
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    if (focusEl) { try { focusEl.focus({ preventScroll: true }); } catch (e) { focusEl.focus(); } }
  }

  root.addEventListener("change", function (e) {
    var li = e.target.closest && e.target.closest(".step");
    if (!li || e.target.type !== "checkbox") return;
    if (e.target.checked) done[sid(li)] = true; else delete done[sid(li)];
    keep(); render();
  });
  $("nx-done").addEventListener("click", function () {
    if (!nextStep) return;
    done[sid(nextStep)] = true; keep(); render();
  });
  $("nx-show").addEventListener("click", function () {
    if (nextStep) show(nextStep, nextStep.querySelector("input"));
    else { var p = root.querySelector(".unit.planned"); if (p) show(p, p.querySelector("summary")); }
  });
  all(".rail a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var u = $("unit-" + a.getAttribute("data-unit"));
      if (!u) return;
      e.preventDefault(); show(u, u.querySelector("summary"));
    });
  });
  $("openall").addEventListener("click", function () { units.forEach(function (u) { u.open = true; }); });
  $("closeall").addEventListener("click", function () { units.forEach(function (u) { u.open = false; }); });

  /* Clearing takes two presses, so one press by mistake changes nothing. */
  var clr = $("clear"), armed = null;
  clr.addEventListener("click", function () {
    if (armed) { clearTimeout(armed); armed = null; done = {}; keep(); render(); clr.textContent = "Clear all ticks"; $("clearmsg").textContent = "All ticks cleared."; return; }
    clr.textContent = "Press again to clear all ticks"; $("clearmsg").textContent = "";
    armed = setTimeout(function () { armed = null; clr.textContent = "Clear all ticks"; }, 5000);
  });

  render();
  if (nextStep) unitOf(nextStep).open = true;
  var h = (location.hash || "").slice(1);
  if (/^unit-[0-9E]+$/.test(h) && $(h)) show($(h));
}
