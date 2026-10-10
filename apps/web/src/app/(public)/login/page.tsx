import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { getMe, homeFor } from "@/lib/api";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const ROSTER = [
  { code: "DEMO-01", role: "Student", note: "Four past attempts — see progress and a recommendation" },
  { code: "DEMO-02", role: "Student", note: "Starts fresh — take an assessment end to end" },
  { code: "DEMO-03", role: "Student", note: "Two attempts flagged for teacher review" },
  { code: "TEACH-01", role: "Teacher", note: "Review queue, score corrections, blind rating" },
  { code: "ADMIN-01", role: "Admin", note: "Integrity tools, live modes, system status" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getMe().catch(() => null);
  if (me) redirect(me.needsConsent ? "/consent" : next && next.startsWith("/") ? next : homeFor(me.role));
  return (
    <Shell me={null}>
      <div className="frame grid gap-16 pt-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-24 md:pt-24">
        <section className="animate-rise">
          <p className="eyebrow">Sign in</p>
          <h1 className="mt-4 font-serif text-2xl md:text-3xl">Your roster code is your key.</h1>
          <p className="mt-4 max-w-md text-md text-ink-2">
            Use the code your instructor gave you. Nothing that identifies you is ever written on-chain — only salted hashes.
          </p>
          <div className="mt-10 max-w-sm">
            <LoginForm next={next && next.startsWith("/") ? next : undefined} />
          </div>
        </section>
        <section aria-labelledby="roster" className="animate-rise [animation-delay:80ms]">
          <h2 id="roster" className="eyebrow">
            Demo roster
          </h2>
          <ul className="mt-4 border-t border-ink">
            {ROSTER.map((r) => (
              <li key={r.code} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-4 border-b border-rule py-4">
                <span className="mono text-[0.9375rem] text-ink">{r.code}</span>
                <span>
                  <span className="text-sm font-medium">{r.role}</span>
                  <span className="mt-0.5 block text-sm text-ink-3">{r.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-3">Demo codes are listed here because this is a demonstration deployment. A real class gets codes privately.</p>
        </section>
      </div>
    </Shell>
  );
}
