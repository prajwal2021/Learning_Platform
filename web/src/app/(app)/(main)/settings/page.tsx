"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, KeyRound, Loader2, Monitor, Moon, Palette, ShieldCheck, Sparkles, Sun, User } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { patch, put } from "@/lib/http";
import { ACCENTS, BACKGROUNDS, applyPrefs, readPrefs, type Prefs } from "@/lib/prefs";
import { applyTheme, readPref, type ThemePref } from "@/lib/theme";
import { Avatar, useMe } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/fx";

const METHOD: Record<string, string> = { password: "Email and password", google: "Google", microsoft: "Microsoft", apple: "Apple", code: "Access code" };

function Section({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card grid gap-6 !rounded-[22px] p-6 sm:p-8 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="flex items-center gap-2 text-[1.05rem] font-semibold">{icon}{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{sub}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </motion.section>
  );
}

export default function Settings() {
  const { me, refresh } = useMe();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [cur, setCur] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs());
  const [theme, setTheme] = useState<ThemePref>("dark");

  useEffect(() => { setPrefs(readPrefs()); setTheme(readPref()); }, []);
  useEffect(() => { if (me) { setName(me.name); setEmail(me.email ?? ""); } }, [me]);

  const set = (p: Partial<Prefs>) => { const n = { ...prefs, ...p }; setPrefs(n); applyPrefs(n); };
  const codeOnly = !!me && me.methods.includes("code") && !me.email;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy("name");
    try { await patch("/api/me", { name }); refresh(); toast.success("Name saved"); }
    catch (err: any) { toast.error(err.message); }
    finally { setBusy(null); }
  }
  async function saveCreds(e: React.FormEvent) {
    e.preventDefault();
    setBusy("creds");
    try {
      await put("/api/me/credentials", { email, password: pw, current_password: cur });
      setPw(""); setCur(""); refresh();
      toast.success(codeOnly ? "Email and password added. You can now sign in with them." : "Sign-in details updated");
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-8 sm:px-8 lg:pt-12">
      <PageHeader eyebrow="Settings" title="Your account" lede="Your profile, how you sign in, and how the platform looks and moves." />
      <div className="grid gap-[var(--lp-gap)]">
        <Section icon={<User size={17} className="text-brand" />} title="Profile" sub="How you appear across the platform.">
          <div className="mb-5 flex items-center gap-4">
            <Avatar me={me} className="!h-16 !w-16 !text-xl" />
            <div>
              <p className="font-semibold">{me?.name}</p>
              <p className="text-[13px] text-faint">{me ? `Member since ${new Date(me.joined).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : " "}</p>
            </div>
          </div>
          <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1"><span className="mb-1.5 block text-[13px] text-muted">Display name</span>
              <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={codeOnly} />
            </label>
            <button className="btn btn-primary" disabled={busy === "name" || codeOnly || !name.trim() || name === me?.name}>{busy === "name" ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Save</button>
          </form>
          {codeOnly ? <p className="mt-2 text-[12.5px] text-faint">With an access code, your name is how your progress is found on another device. Add an email and password below first.</p> : null}
        </Section>

        <Section icon={<ShieldCheck size={17} className="text-brand" />} title="Sign-in" sub={codeOnly ? "You signed in with an access code. Add an email and password so your progress stays yours if codes are retired." : "The ways you can sign in to this account."}>
          <div className="mb-6 flex flex-wrap gap-2">
            {(me?.methods ?? []).map((m) => <span key={m} className="chip !cursor-default" data-on="true"><Check size={13} /> {METHOD[m] ?? m}</span>)}
          </div>
          <form onSubmit={saveCreds} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1.5 block text-[13px] text-muted">Email</span>
              <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {me?.methods.includes("password") ? (
              <label><span className="mb-1.5 block text-[13px] text-muted">Current password</span>
                <input className="input" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
              </label>
            ) : null}
            <label className={clsx(!me?.methods.includes("password") && "sm:col-span-2")}><span className="mb-1.5 block text-[13px] text-muted">{me?.methods.includes("password") ? "New password" : "Password"}</span>
              <input className="input" type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
            </label>
            <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy === "creds"}>{busy === "creds" ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />} {me?.methods.includes("password") ? "Update sign-in details" : "Add email and password"}</button></div>
          </form>
        </Section>

        <Section icon={<Palette size={17} className="text-brand" />} title="Appearance" sub="Saved in this browser. The legacy interactive pages and the workbooks follow the theme too.">
          <p className="mb-2.5 text-[13px] font-medium text-muted">Theme</p>
          <div className="mb-7 grid grid-cols-3 gap-2.5">
            {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => { setTheme(t); applyTheme(t); }} className={clsx("card flex flex-col items-center gap-2 !rounded-2xl p-4 transition-all", theme === t ? "!border-brand shadow-glow" : "hover:-translate-y-0.5")}>
                <Icon size={20} className={theme === t ? "text-brand" : "text-muted"} /><span className="text-[13px] font-medium">{label}</span>
              </button>
            ))}
          </div>
          <p className="mb-2.5 text-[13px] font-medium text-muted">Accent colour</p>
          <div className="mb-7 flex flex-wrap gap-3">
            {(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((k) => (
              <button key={k} onClick={() => set({ accent: k })} title={ACCENTS[k].label} aria-pressed={prefs.accent === k}
                className={clsx("group relative h-12 w-12 rounded-2xl transition-transform hover:scale-110", prefs.accent === k && "ring-2 ring-fg ring-offset-2 ring-offset-[var(--lp-surface)]")}
                style={{ background: `linear-gradient(135deg, ${ACCENTS[k].a}, ${ACCENTS[k].b})`, boxShadow: `0 8px 24px -8px ${ACCENTS[k].a}` }}>
                {prefs.accent === k ? <Check size={18} className="absolute inset-0 m-auto text-white" /> : null}
              </button>
            ))}
          </div>
          <p className="mb-2.5 text-[13px] font-medium text-muted">Background</p>
          <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map((b) => (
              <button key={b} onClick={() => set({ bg: b })} className={clsx("card relative h-20 overflow-hidden !rounded-2xl text-[13px] font-medium transition-all", prefs.bg === b ? "!border-brand shadow-glow" : "hover:-translate-y-0.5")}>
                <span className="absolute inset-0 opacity-70" style={{
                  background: b === "aurora" ? "radial-gradient(circle at 20% 20%, var(--lp-brand), transparent 55%), radial-gradient(circle at 80% 70%, var(--lp-brand-2), transparent 55%)"
                    : b === "grid" ? "linear-gradient(var(--lp-line-strong) 1px, transparent 1px) 0 0/14px 14px, linear-gradient(90deg, var(--lp-line-strong) 1px, transparent 1px) 0 0/14px 14px"
                    : b === "particles" ? "radial-gradient(var(--lp-brand) 1.5px, transparent 2px) 0 0/18px 18px" : "var(--lp-surface)" }} />
                <span className="relative">{BACKGROUNDS[b]}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Compact density" sub="Tighter spacing, more on screen" on={prefs.density === "compact"} onChange={(v) => set({ density: v ? "compact" : "comfortable" })} />
            <Toggle label="Reduce motion" sub="Calm animations and pause 3D scenes" on={prefs.motion === "reduced"} onChange={(v) => set({ motion: v ? "reduced" : "full" })} />
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-[12px] text-faint"><Sparkles size={13} /> Changes apply instantly, everywhere.</p>
        </Section>
      </div>
    </main>
  );
}

function Toggle({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="card flex items-center gap-4 !rounded-2xl p-4 text-left">
      <span className="flex-1"><span className="block text-[14px] font-medium">{label}</span><span className="block text-[12px] text-faint">{sub}</span></span>
      <span className={clsx("relative h-7 w-12 flex-none rounded-full transition-colors", on ? "bg-brand" : "bg-node")}>
        <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }} className={clsx("absolute top-1 h-5 w-5 rounded-full bg-white shadow", on ? "right-1" : "left-1")} />
      </span>
    </button>
  );
}
