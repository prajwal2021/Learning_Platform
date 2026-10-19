"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Boxes, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck, Sparkles, User } from "lucide-react";
import clsx from "clsx";
import { BRAND } from "@/lib/brand";
import { get, post } from "@/lib/http";
import Background from "@/components/ui/Background";

const TechOrbit = dynamic(() => import("@/components/three/TechOrbit"), { ssr: false });

type Mode = "login" | "signup" | "code";
type Provider = { id: "google" | "microsoft" | "apple"; label: string; configured: boolean };

const STATS = [
  { n: "5,295", l: "interview questions" },
  { n: "92", l: "technologies" },
  { n: "11", l: "stage workbooks" },
  { n: "40", l: "incident drills" },
  { n: "125", l: "interactive tools" },
  { n: "618", l: "code examples" },
];
const MARQUEE = ["PostgreSQL", "Redis", "Kafka", "Kubernetes", "System design", "FastAPI", "React", "Docker", "Rate limiting", "Sharding",
  "OAuth & JWT", "Queues & workers", "Observability", "Caching", "WebSockets", "Terraform", "Go", "Rust", "TypeScript", "SRE", "CI/CD", "AWS"];

function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function ProviderIcon({ id }: { id: Provider["id"] }) {
  if (id === "google")
    return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>);
  if (id === "microsoft")
    return (<svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" aria-hidden><path fill="#F25022" d="M1 1h10.5v10.5H1z"/><path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z"/><path fill="#00A4EF" d="M1 12.5h10.5V23H1z"/><path fill="#FFB900" d="M12.5 12.5H23V23H12.5z"/></svg>);
  return (<svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden><path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.5 4.5 0 0 1-2.6-4.1zM13.9 5.1c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>);
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">{icon}</span>
        {children}
      </span>
    </label>
  );
}

function Form({ initial }: { initial: Mode }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "code" ? "code" : initial);
  const [providers, setProviders] = useState<Provider[]>([
    { id: "google", label: "Google", configured: false }, { id: "microsoft", label: "Microsoft", configured: false }, { id: "apple", label: "Apple", configured: false },
  ]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") || "");

  useEffect(() => {
    get<Provider[]>("/api/auth/providers").then(setProviders).catch(() => {});
    // already signed in: go straight on
    get("/api/auth/me").then(() => location.replace(next)).catch(() => {});
  }, [next]);

  const pw = useMemo(() => strength(password), [password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") await post("/api/auth/signup", { name, email, password });
      else if (mode === "login") await post("/api/auth/login", { email, password });
      else await post("/api/auth/redeem", { code, name });
      location.assign(next);
    } catch (err: any) {
      setError(err.message || "Could not sign in.");
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Create your account" : mode === "login" ? "Welcome back" : "Join with an invite code";
  const sub = mode === "signup" ? "Start free. Your progress follows you on every device."
    : mode === "login" ? "Sign in to pick up exactly where you left off."
    : "Enter the code you were given and your name. The same name on another device continues your progress.";

  return (
    <div className="glass border-glow relative w-full max-w-[440px] rounded-[28px] p-7 sm:p-9">
      <div className="mb-6 flex rounded-2xl bg-node p-1 text-[13px] font-medium" role="tablist">
        {(["login", "signup", "code"] as Mode[]).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(""); }}
            className={clsx("relative flex-1 rounded-xl px-3 py-2 transition-colors", mode === m ? "text-fg" : "text-faint hover:text-muted")}>
            {mode === m ? <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-xl bg-surface shadow-soft" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
            <span className="relative">{m === "login" ? "Sign in" : m === "signup" ? "Sign up" : "Invite code"}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          <h2 className="text-[1.6rem] font-bold tracking-[-0.03em]">{title}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{sub}</p>

          {mode !== "code" ? (
            <>
              <div className="mt-6 grid gap-2.5">
                {providers.map((p) => (
                  <a key={p.id} href={p.configured ? `/api/auth/oauth/${p.id}/start?next=${encodeURIComponent(next)}` : undefined}
                    aria-disabled={!p.configured} title={p.configured ? undefined : `${p.label} sign-in is not set up on this server yet`}
                    className={clsx("btn h-11 w-full justify-center gap-3 !rounded-xl text-[14px]", !p.configured && "cursor-not-allowed opacity-55 hover:!translate-y-0")}
                    onClick={(e) => { if (!p.configured) { e.preventDefault(); setError(`${p.label} sign-in is not set up on this server yet. An administrator adds it in the server settings.`); } }}>
                    <ProviderIcon id={p.id} />
                    Continue with {p.label}
                  </a>
                ))}
              </div>
              <div className="my-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.14em] text-faint">
                <span className="divider flex-1" /> or with email <span className="divider flex-1" />
              </div>
            </>
          ) : <div className="h-6" />}

          <form onSubmit={submit} className="grid gap-4" noValidate={false}>
            {mode !== "login" ? (
              <Field icon={<User size={16} />} label={mode === "code" ? "Your name" : "Full name"}>
                <input className="input !pl-10" autoComplete="name" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
              </Field>
            ) : null}
            {mode === "code" ? (
              <Field icon={<KeyRound size={16} />} label="Access code">
                <input className="input !pl-10 font-mono tracking-[0.12em] uppercase" autoComplete="off" spellCheck={false} required value={code}
                  onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" />
              </Field>
            ) : (
              <>
                <Field icon={<Mail size={16} />} label={mode === "login" ? "Email or username" : "Email"}>
                  {/* sign-in also takes a plain username (an operator-made login has no email); sign-up needs a real address */}
                  <input className="input !pl-10" type={mode === "login" ? "text" : "email"} inputMode="email" autoCapitalize="none" spellCheck={false}
                    autoComplete={mode === "login" ? "username" : "email"} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </Field>
                <Field icon={<Lock size={16} />} label="Password">
                  <input className="input !px-10" type={show ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required minLength={mode === "signup" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide the password" : "Show the password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-faint hover:text-fg">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </Field>
                {mode === "signup" && password ? (
                  <div className="-mt-1 flex items-center gap-3" aria-live="polite">
                    <div className="grid flex-1 grid-cols-4 gap-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="h-1.5 rounded-full transition-colors duration-300"
                          style={{ background: i < pw ? ["var(--lp-red)", "var(--lp-amber)", "var(--lp-brand-2)", "var(--lp-brand-3)"][pw - 1] : "var(--lp-node)" }} />
                      ))}
                    </div>
                    <span className="w-16 text-right text-[12px] text-faint">{STRENGTH[pw]}</span>
                  </div>
                ) : null}
              </>
            )}

            <AnimatePresence>
              {error ? (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert"
                  className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-[13px] text-bad">{error}</motion.p>
              ) : null}
            </AnimatePresence>

            <button type="submit" disabled={busy} className="btn btn-primary mt-1 h-12 w-full !rounded-xl text-[15px]">
              {busy ? <Loader2 className="animate-spin" size={18} /> : null}
              {mode === "signup" ? "Create account" : mode === "login" ? "Sign in" : "Continue"}
              {!busy ? <ArrowRight size={17} /> : null}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-faint">
            {mode === "login" ? <>New here? <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} onClick={(e) => { e.preventDefault(); setMode("signup"); }} className="font-medium text-brand hover:underline">Create an account</Link></>
              : mode === "signup" ? <>Already have an account? <Link href="/login" onClick={(e) => { e.preventDefault(); setMode("login"); }} className="font-medium text-brand hover:underline">Sign in</Link></>
              : <>Have an account? <button type="button" onClick={() => setMode("login")} className="font-medium text-brand hover:underline">Sign in with email</button></>}
          </p>
        </motion.div>
      </AnimatePresence>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-faint"><ShieldCheck size={13} /> Passwords are hashed with scrypt. Sessions are HTTP-only cookies.</p>
    </div>
  );
}

export default function AuthScreen({ initial }: { initial: Mode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Background />
      <div className="relative z-[1] grid min-h-dvh lg:grid-cols-[1.12fr_1fr]">
        {/* the showcase */}
        <section className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_50%_24%,var(--lp-brand-soft),transparent_70%)]" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[conic-gradient(from_210deg,var(--lp-brand),var(--lp-brand-2),var(--lp-pink),var(--lp-brand))] shadow-glow">
              <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-surface text-brand"><Boxes size={18} /></span>
            </span>
            <span className="text-lg font-bold tracking-[-0.02em]">{BRAND.name}</span>
          </div>
          <div className="relative -mx-10 h-[34vh] min-h-[250px] xl:-mx-14">
            <TechOrbit className="absolute inset-0" scale={0.7} label="92 stacks" sub="one platform" />
          </div>
          <div className="relative max-w-xl pointer-events-none">
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="glass mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-muted">
              <Sparkles size={14} className="text-brand" /> Labs · Core Build · System design · Interview prep
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-[clamp(2.4rem,4.2vw,4rem)] font-bold leading-[1.02] tracking-[-0.045em]">
              Learn to build <span className="text-gradient">real systems</span>.<br />Get hired for it.
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }} className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-muted">
              {BRAND.description}
            </motion.p>
            <motion.dl initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.4 } } }}
              className="mt-9 grid grid-cols-3 gap-3">
              {STATS.map((s) => (
                <motion.div key={s.l} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="glass rounded-2xl px-4 py-3.5">
                  <dt className="text-2xl font-bold tracking-[-0.03em]">{s.n}</dt>
                  <dd className="mt-0.5 text-[12.5px] text-muted">{s.l}</dd>
                </motion.div>
              ))}
            </motion.dl>
          </div>
          <div className="relative -mx-14 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
            <div className="flex w-max animate-[marquee_42s_linear_infinite] gap-2.5">
              {[...MARQUEE, ...MARQUEE].map((t, i) => <span key={i} className="glass rounded-full px-3.5 py-1.5 text-[12.5px] text-muted">{t}</span>)}
            </div>
          </div>
        </section>

        {/* the form */}
        <section className="relative flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="absolute left-5 top-5 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-brand"><Boxes size={18} /></span>
            <span className="font-bold tracking-[-0.02em]">{BRAND.name}</span>
          </div>
          <Suspense><Form initial={initial} /></Suspense>
        </section>
      </div>
      <style>{`@keyframes marquee{to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}
