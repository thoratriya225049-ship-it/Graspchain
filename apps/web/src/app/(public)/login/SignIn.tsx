"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { sha256Hex } from "@graspchain/shared";
import { DecryptText } from "@/components/fx/DecryptText";
import { useCalm } from "@/components/fx/hooks";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Bits";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { call } from "@/lib/http";
import type { Me } from "@/lib/types";

type Role = Me["role"];
const home = (r: Role) => (r === "student" ? "/home" : r === "teacher" ? "/teacher" : "/admin");

export const ROSTER: { code: string; role: Role; note: string }[] = [
  { code: "DEMO-01", role: "student", note: "Four past attempts, progress and a recommendation" },
  { code: "DEMO-02", role: "student", note: "A fresh start — take an assessment end to end" },
  { code: "DEMO-03", role: "student", note: "Two attempts flagged for teacher review" },
  { code: "TEACH-01", role: "teacher", note: "Review queue, score corrections, blind rating" },
  { code: "ADMIN-01", role: "admin", note: "Integrity tools, live modes, system status" },
];

const ROLES: { id: Role; name: string; line: string; tone: "light" | "dark"; wash: string; art: React.ReactNode }[] = [
  {
    id: "student",
    name: "Student",
    line: "Read a passage, explain it, and see exactly what you understood.",
    tone: "light",
    wash: "radial-gradient(120% 90% at 0% 0%, #AEDFF7 0%, transparent 60%), radial-gradient(90% 80% at 100% 100%, #DAF3F2 0%, transparent 70%), #EAF6FB",
    art: (
      <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
        {[30, 50, 70, 90].map((y, i) => (
          <rect key={y} x="24" y={y} width={150 - i * 18} height="7" rx="3.5" fill="#0B3A4A" opacity="0.12" />
        ))}
        <rect x="24" y="68" width="96" height="11" rx="3" fill="#AB9BCB" opacity="0.55" />
        <circle cx="170" cy="36" r="10" fill="#6ACCC6" opacity="0.7" />
      </svg>
    ),
  },
  {
    id: "teacher",
    name: "Teacher",
    line: "Review uncertain results one at a time, correct with a reason, rate blind.",
    tone: "light",
    wash: "radial-gradient(110% 90% at 100% 0%, #B0BCE3 0%, transparent 60%), radial-gradient(90% 80% at 0% 100%, #DAF3F2 0%, transparent 70%), #EEF1FA",
    art: (
      <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
        {[34, 62, 90].map((y, i) => (
          <g key={y}>
            <circle cx="36" cy={y + 4} r="7" fill="none" stroke="#0B3A4A" strokeOpacity="0.35" strokeWidth="2" />
            {i !== 1 ? <path d={`M32 ${y + 4}l3 3 6-7`} stroke="#12708A" strokeWidth="2.2" fill="none" strokeLinecap="round" /> : null}
            <rect x="54" y={y} width={110 - i * 14} height="8" rx="4" fill="#0B3A4A" opacity="0.13" />
          </g>
        ))}
      </svg>
    ),
  },
  {
    id: "admin",
    name: "Admin",
    line: "System status, integrity tools and live modes for this deployment.",
    tone: "dark",
    wash: "radial-gradient(120% 90% at 100% 100%, #12708A 0%, transparent 65%), radial-gradient(70% 60% at 0% 0%, rgb(106 204 198 / 0.25) 0%, transparent 70%), #0B3A4A",
    art: (
      <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden>
        <path d="M40 40 L100 70 L160 40 M100 70 L100 112 M40 100 L100 70 L160 100" stroke="#6ACCC6" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
        {[
          [40, 40],
          [160, 40],
          [100, 70],
          [100, 112],
          [40, 100],
          [160, 100],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={x === 100 && y === 70 ? 9 : 5} fill={x === 100 && y === 70 ? "#6ACCC6" : "#AEDFF7"} opacity="0.85" />
        ))}
      </svg>
    ),
  },
];

/** A random salt per visit: the demonstration hashes ID + salt exactly as the server does with its own secret salt. */
function useSalt() {
  return useMemo(() => {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) return "";
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  }, []);
}

export function SignIn({ next }: { next?: string }) {
  const router = useRouter();
  const { coarse } = useCalm();
  const [role, setRole] = useState<Role>("student");
  const [expanded, setExpanded] = useState<Role>("student");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [demoOpen, setDemoOpen] = useState(false);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLabel, setRegLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const salt = useSalt();
  const typed = tab === "login" ? code.trim() : regCode.trim();
  const [hash, setHash] = useState("");
  useEffect(() => {
    if (!typed || !salt) return setHash("");
    const t = window.setTimeout(() => void sha256Hex(typed + salt).then((h) => setHash(h.slice(0, 32))), 220);
    return () => window.clearTimeout(t);
  }, [typed, salt]);

  const canRegister = role !== "admin";
  useEffect(() => {
    if (!canRegister && tab === "register") setTab("login");
  }, [canRegister, tab]);

  function choose(r: Role) {
    setRole(r);
    setExpanded(r);
    setError(null);
  }
  function fill(c: string, r: Role) {
    choose(r);
    setTab("login");
    setCode(c);
    setPassword("");
    setDemoOpen(false);
    requestAnimationFrame(() => codeRef.current?.focus());
  }

  async function finish(u: Me) {
    setDone(true);
    await new Promise((r) => setTimeout(r, 380));
    router.push(u.needsConsent ? `/consent${next ? `?next=${encodeURIComponent(next)}` : ""}` : (next ?? home(u.role)));
    router.refresh();
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 3) return setError("Enter your ID or roster code (at least 3 characters).");
    setBusy(true);
    setError(null);
    const r = await call<{ user: Me }>("/api/auth/login", { method: "POST", json: { code: code.trim(), password: password ? password : undefined } });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    await finish(r.data.user);
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    const c = regCode.trim();
    if (c.length < 3) return setError("Your ID must be at least 3 characters.");
    if (!/^[a-zA-Z0-9_-]+$/.test(c)) return setError("Use only letters, numbers, hyphens and underscores.");
    if (regPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (regPassword !== regConfirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    const r = await call<{ user: Me }>("/api/auth/register", {
      method: "POST",
      json: { code: c, password: regPassword, label: regLabel.trim() || undefined, role: role === "teacher" ? "teacher" : "student" },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    await finish(r.data.user);
  }

  const shortcuts = ROSTER.filter((x) => x.role === expanded);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-14">
      {/* ── Role picker (Skiper UI 52, expand on hover) ── */}
      <section aria-labelledby="roles-h">
        <h2 id="roles-h" className="sr-only">
          Choose your role
        </h2>
        <div role="radiogroup" aria-label="I am signing in as" className="flex flex-col gap-2 md:h-[26rem] md:flex-row" onMouseLeave={() => setExpanded(role)}>
          {ROLES.map((r) => {
            const open = expanded === r.id;
            const dark = r.tone === "dark";
            return (
              <motion.div
                key={r.id}
                layout
                className="relative overflow-hidden rounded-[28px] md:min-w-0 md:basis-0"
                style={{ background: r.wash }}
                animate={{ flexGrow: open ? 5 : 1 }}
                transition={{ duration: 0.4, ease: [0.22, 0.8, 0.2, 1] }}
                onHoverStart={() => !coarse && setExpanded(r.id)}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === r.id}
                  aria-expanded={open}
                  aria-controls={`role-${r.id}`}
                  onFocus={() => setExpanded(r.id)}
                  onClick={() => choose(r.id)}
                  className={`relative flex w-full items-start justify-between gap-3 p-5 text-left md:h-full md:flex-col md:justify-start ${dark ? "text-on-dark" : "text-abyss"}`}
                >
                  <span className={`flex items-center gap-3 ${open ? "" : "md:flex-col md:items-start"}`}>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${role === r.id ? (dark ? "border-aqua bg-aqua text-abyss" : "border-abyss bg-abyss text-white") : dark ? "border-white/40" : "border-abyss/35"}`}
                      aria-hidden
                    >
                      {role === r.id ? <Icon name="check" size={12} /> : null}
                    </span>
                    <span className={`font-serif text-2xl leading-none tracking-[-0.02em] ${open ? "" : "md:mt-1 md:[writing-mode:vertical-rl]"}`}>
                      {r.name}
                    </span>
                  </span>
                  <span
                    className={`pointer-events-none absolute bottom-0 right-0 hidden h-36 w-56 transition-opacity duration-500 md:block ${open ? "opacity-60" : "opacity-50"}`}
                  >
                    {r.art}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      id={`role-${r.id}`}
                      key="more"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.32, delay: 0.12 }}
                      className={`relative px-5 pb-5 md:absolute md:left-0 md:top-16 md:w-[24rem] ${dark ? "text-on-dark" : "text-abyss"}`}
                    >
                      <p className={`max-w-[19rem] text-[0.9375rem] leading-snug ${dark ? "text-on-dark" : "text-abyss"}`}>{r.line}</p>
                      <p className={`mt-5 text-2xs font-semibold uppercase tracking-[0.14em] ${dark ? "text-sky" : "text-abyss/80"}`}>Demo shortcuts</p>
                      <ul className="mt-2 flex flex-col items-start gap-2">
                        {ROSTER.filter((x) => x.role === r.id).map((d) => (
                          <li key={d.code}>
                            <button
                              type="button"
                              onClick={() => fill(d.code, d.role)}
                              className={`group inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-left text-sm transition-colors ${dark ? "bg-white/10 text-on-dark hover:bg-white/20" : "bg-white/70 text-abyss hover:bg-white"}`}
                            >
                              <span className="mono whitespace-nowrap rounded-full px-1.5 text-[0.8125rem] font-medium">{d.code}</span>
                              <span className={`hidden text-xs leading-snug sm:inline ${dark ? "text-on-dark-2" : "text-abyss/80"}`}>{d.note}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {shortcuts.length ? `${ROLES.find((x) => x.id === expanded)?.name}: ${shortcuts.map((s) => s.code).join(", ")}` : ""}
        </p>
      </section>

      {/* ── The form ── */}
      <section aria-labelledby="form-h" className="card p-6 shadow-lift sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="form-h" className="sr-only">
            {tab === "login" ? "Sign in" : "Create a new ID"}
          </h2>
          <Segmented
            label="Sign in or create an ID"
            value={tab}
            onChange={(v) => {
              setTab(v);
              setError(null);
            }}
            options={
              canRegister
                ? [
                    { value: "login", label: "Sign In" },
                    { value: "register", label: "Create New ID" },
                  ]
                : [{ value: "login", label: "Sign In" }]
            }
          />
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-teal hover:bg-mint"
          >
            <Icon name="eye" size={15} /> Try a demo
          </button>
        </div>
        <p className="mt-4 text-sm text-ink-3">
          {tab === "register"
            ? `New ${role === "teacher" ? "teacher" : "student"} ID — you choose the ID and password.`
            : role === "admin"
              ? "Admins also enter the deployment's admin secret after signing in."
              : `Signing in as a ${role}.`}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          {tab === "login" ? (
            <motion.form
              key="login"
              onSubmit={submitLogin}
              noValidate
              className="mt-6 space-y-5"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.22 }}
            >
              <Field label="Your ID or roster code" htmlFor="code" error={error}>
                <input
                  ref={codeRef}
                  id="code"
                  name="code"
                  autoComplete="username"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. DEMO-02 or your_id"
                  aria-invalid={!!error}
                  aria-describedby="privacy"
                  className={`${inputClass} mono h-13 text-lg tracking-[0.03em]`}
                />
              </Field>
              <Privacy hash={hash} />
              <Field label="Password" htmlFor="password" hint="Optional for demo codes, required for registered IDs.">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} h-11`}
                />
              </Field>
              <Submit busy={busy} done={done} label="Sign In" />
            </motion.form>
          ) : (
            <motion.form
              key="register"
              onSubmit={submitRegister}
              noValidate
              className="mt-6 space-y-5"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22 }}
            >
              <Field label="Choose an ID" htmlFor="reg-code" hint="Letters, numbers, hyphens or underscores (e.g. alex_01)" error={error}>
                <input
                  id="reg-code"
                  name="code"
                  autoComplete="username"
                  spellCheck={false}
                  value={regCode}
                  onChange={(e) => setRegCode(e.target.value)}
                  placeholder="e.g. student_alex"
                  aria-invalid={!!error}
                  aria-describedby="privacy"
                  className={`${inputClass} mono h-12`}
                />
              </Field>
              <Privacy hash={hash} />
              <Field label="Your name or label (optional)" htmlFor="reg-label" hint="Shown on your results, never on-chain">
                <input
                  id="reg-label"
                  name="label"
                  value={regLabel}
                  onChange={(e) => setRegLabel(e.target.value)}
                  placeholder="e.g. Alex Rivers"
                  className={`${inputClass} h-11`}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Password" htmlFor="reg-password" hint="At least 6 characters">
                  <input
                    id="reg-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} h-11`}
                  />
                </Field>
                <Field label="Confirm password" htmlFor="reg-confirm">
                  <input
                    id="reg-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} h-11`}
                  />
                </Field>
              </div>
              <Submit busy={busy} done={done} label={`Create ${role === "teacher" ? "teacher" : "student"} ID & sign in`} />
            </motion.form>
          )}
        </AnimatePresence>
      </section>

      <Sheet
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="Try a demo"
        description="One tap fills the code. This is a demonstration deployment — a real class gets codes privately."
      >
        <ul className="divide-y divide-rule">
          {ROSTER.map((d) => (
            <li key={d.code}>
              <button
                type="button"
                onClick={() => fill(d.code, d.role)}
                className="group grid w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-2 py-4 text-left hover:bg-mint"
              >
                <span className="mono text-[0.9375rem] font-medium text-ink">{d.code}</span>
                <span>
                  <span className="block text-sm font-medium capitalize">{d.role}</span>
                  <span className="block text-sm text-ink-3">{d.note}</span>
                </span>
                <Icon name="arrow" size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

function Privacy({ hash }: { hash: string }) {
  return (
    <div id="privacy" className="rounded-[14px] bg-mint px-4 py-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
          <Icon name="lock" size={14} /> Only this is ever written on-chain.
        </span>
        <span className="mono hidden text-2xs text-ink-3 sm:inline">sha256(ID + salt)</span>
      </div>
      <p className="mt-1.5 min-h-[1.375rem] truncate text-[0.9375rem] text-ink">
        {hash ? <DecryptText value={hash} speed={1} /> : <span className="text-sm text-ink-3">Start typing your ID…</span>}
      </p>
      <p className="mt-1 text-2xs leading-4 text-ink-3">
        Hashed here, in your browser, with a random salt. The server salts with its own secret, so the real value differs.
      </p>
    </div>
  );
}

function Submit({ busy, done, label }: { busy: boolean; done: boolean; label: string }) {
  return (
    <Button type="submit" size="lg" busy={busy} busyLabel="Signing in…" iconAfter={done ? "check" : "arrow"} className="w-full">
      {done ? "Signed in" : label}
    </Button>
  );
}
