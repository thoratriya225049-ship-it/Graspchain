"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Bits";
import { call } from "@/lib/http";
import type { Me } from "@/lib/types";

const home = (r: Me["role"]) => (r === "student" ? "/home" : r === "teacher" ? "/teacher" : "/admin");

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");

  // Login fields
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  // Register fields
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLabel, setRegLabel] = useState("");
  const [regRole, setRegRole] = useState<"student" | "teacher">("student");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 3) return setError("Enter your ID or roster code (at least 3 characters).");
    setBusy(true);
    setError(null);
    const r = await call<{ user: Me }>("/api/auth/login", {
      method: "POST",
      json: { code: code.trim(), password: password ? password : undefined },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    const u = r.data.user;
    router.push(u.needsConsent ? `/consent${next ? `?next=${encodeURIComponent(next)}` : ""}` : (next ?? home(u.role)));
    router.refresh();
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    const c = regCode.trim();
    if (c.length < 3) return setError("Your ID must be at least 3 characters.");
    if (!/^[a-zA-Z0-9_-]+$/.test(c)) return setError("ID can only contain letters, numbers, hyphens, and underscores.");
    if (regPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (regPassword !== regConfirm) return setError("Passwords do not match.");

    setBusy(true);
    setError(null);
    const r = await call<{ user: Me }>("/api/auth/register", {
      method: "POST",
      json: {
        code: c,
        password: regPassword,
        label: regLabel.trim() || undefined,
        role: regRole,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    const u = r.data.user;
    router.push(next ?? home(u.role));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Tab toggle */}
      <div className="flex border-b border-rule" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "login"}
          onClick={() => {
            setTab("login");
            setError(null);
          }}
          className={`mr-6 pb-3 text-sm font-semibold transition-colors ${tab === "login" ? "border-b-2 border-ink text-ink" : "text-ink-3 hover:text-ink"}`}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "register"}
          onClick={() => {
            setTab("register");
            setError(null);
          }}
          className={`pb-3 text-sm font-semibold transition-colors ${tab === "register" ? "border-b-2 border-ink text-ink" : "text-ink-3 hover:text-ink"}`}
        >
          Create New ID
        </button>
      </div>

      {tab === "login" ? (
        <form onSubmit={submitLogin} noValidate className="space-y-5">
          <Field label="Your ID or Roster Code" htmlFor="code" error={error}>
            <input
              id="code"
              name="code"
              autoComplete="username"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. DEMO-02 or your_id"
              aria-invalid={!!error}
              className={`${inputClass} mono h-13 text-lg tracking-[0.04em]`}
            />
          </Field>
          <Field label="Password" htmlFor="password" hint="Optional for demo codes, required for registered IDs.">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`${inputClass} h-11 text-base`}
            />
          </Field>
          <Button type="submit" size="lg" busy={busy} iconAfter="arrow" className="w-full">
            Sign In
          </Button>
          <p className="text-center text-xs text-ink-3">
            Don&rsquo;t have an ID yet?{" "}
            <button
              type="button"
              onClick={() => {
                setTab("register");
                setError(null);
              }}
              className="link font-semibold text-ink"
            >
              Create one now
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={submitRegister} noValidate className="space-y-5">
          <Field label="Choose an ID" htmlFor="reg-code" hint="Letters, numbers, hyphens or underscores (e.g. alex_01)" error={error}>
            <input
              id="reg-code"
              name="code"
              autoComplete="username"
              spellCheck={false}
              value={regCode}
              onChange={(e) => setRegCode(e.target.value)}
              placeholder="e.g. student_alex"
              className={`${inputClass} mono h-12 text-base`}
            />
          </Field>

          <Field label="Your Name / Label (Optional)" htmlFor="reg-label" hint="Displayed on your assessment results">
            <input
              id="reg-label"
              name="label"
              value={regLabel}
              onChange={(e) => setRegLabel(e.target.value)}
              placeholder="e.g. Alex Rivers"
              className={`${inputClass} h-11 text-base`}
            />
          </Field>

          <Field label="Account Role" htmlFor="reg-role">
            <div className="flex gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="radio"
                  name="role"
                  value="student"
                  checked={regRole === "student"}
                  onChange={() => setRegRole("student")}
                  className="accent-signal"
                />
                Student
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="radio"
                  name="role"
                  value="teacher"
                  checked={regRole === "teacher"}
                  onChange={() => setRegRole("teacher")}
                  className="accent-signal"
                />
                Teacher
              </label>
            </div>
          </Field>

          <Field label="Password" htmlFor="reg-password" hint="Minimum 6 characters">
            <input
              id="reg-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              placeholder="••••••••"
              className={`${inputClass} h-11 text-base`}
            />
          </Field>

          <Field label="Confirm Password" htmlFor="reg-confirm">
            <input
              id="reg-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={regConfirm}
              onChange={(e) => setRegConfirm(e.target.value)}
              placeholder="••••••••"
              className={`${inputClass} h-11 text-base`}
            />
          </Field>

          <Button type="submit" size="lg" busy={busy} iconAfter="arrow" className="w-full">
            Create Account &amp; Sign In
          </Button>

          <p className="text-center text-xs text-ink-3">
            Already have an ID?{" "}
            <button
              type="button"
              onClick={() => {
                setTab("login");
                setError(null);
              }}
              className="link font-semibold text-ink"
            >
              Sign in here
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
