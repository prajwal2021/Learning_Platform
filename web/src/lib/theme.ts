/** Theme: "light", "dark" or "system", kept in this browser. The resolved theme is set as data-theme on <html>,
 *  which every page understands: the new pages, the legacy pages' CSS, and the workbooks inside their frames. */
export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "lp-theme";

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function resolve(p: ThemePref): "light" | "dark" {
  if (p !== "system") return p;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(p: ThemePref) {
  try { localStorage.setItem(THEME_KEY, p); } catch {}
  const t = resolve(p);
  document.documentElement.setAttribute("data-theme", t);
  // workbooks run in same-origin frames; tell them too
  document.querySelectorAll("iframe[data-follow-theme]").forEach((f) => {
    try { (f as HTMLIFrameElement).contentWindow?.postMessage({ type: "theme", theme: t }, location.origin); } catch {}
  });
  window.dispatchEvent(new CustomEvent("lp-theme", { detail: t }));
}

export function currentTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}
