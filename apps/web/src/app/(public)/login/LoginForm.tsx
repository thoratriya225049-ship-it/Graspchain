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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 3) return setError("Enter your roster code, for example DEMO-02.");
    setBusy(true);
    setError(null);
    const r = await call<{ user: Me }>("/api/auth/login", { method: "POST", json: { code: code.trim() } });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    const u = r.data.user;
    router.push(u.needsConsent ? `/consent${next ? `?next=${encodeURIComponent(next)}` : ""}` : (next ?? home(u.role)));
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Field label="Roster code" htmlFor="code" error={error}>
        <input
          id="code"
          name="code"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="DEMO-02"
          aria-invalid={!!error}
          className={`${inputClass} mono h-14 text-xl tracking-[0.06em]`}
        />
      </Field>
      <Button type="submit" size="lg" busy={busy} iconAfter="arrow" className="w-full">
        Continue
      </Button>
    </form>
  );
}
