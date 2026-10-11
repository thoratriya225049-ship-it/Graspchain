import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { getConfig, getMe, homeFor } from "@/lib/api";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = { title: "Consent" };

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ next?: string; review?: string }> }) {
  const { next, review } = await searchParams;
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.needsConsent && !review) redirect(next && next.startsWith("/") ? next : homeFor(me.role));
  const cfg = await getConfig();
  const llm = cfg?.llm.enabled ? `${cfg.llm.provider} (${cfg.llm.model})` : "no LLM is configured in this deployment";
  const rows: [string, string][] = [
    [
      "What we store",
      "Your roster code, your answers, how long you read, and assessment-integrity events while an assessment page is open: leaving the tab or window, full-screen exits, blocked copy/paste/print attempts, reloads and similar. They never change your comprehension score; under published rules, serious or repeated events can mean a result needs a teacher's review or is not certified. A blocked paste is compared with the article on the server and then discarded.",
    ],
    [
      "Who sees your summary",
      `The judge (${cfg?.judge.kind === "jev" ? "Jev by TypeSafe, which states it does not train on user data" : cfg?.judge.kind === "evidence" ? "Graspchain's evidence judge: the LLM below extracts evidence from your answer and our code decides" : "a local demo judge on this server — Jev is not configured"}) and the LLM (${llm}). Google's free Gemini tier states content may be "used to improve our products"; names are never sent, and Groq can be used instead.`,
    ],
    [
      "What goes on-chain",
      "Only hashes and your score: a salted hash of your code, a salted hash of your answer, and the receipt's hash. Nothing that identifies you.",
    ],
    [
      "Research use",
      "If research mode is on, anonymized answers may be rated by people who cannot see your score or code. Benchmarks use first attempts only.",
    ],
    ["Withdrawing", "You can withdraw at any time from this page. Your data is then excluded from research exports."],
  ];
  return (
    <Shell me={me}>
      <article className="frame-narrow pt-14 md:pt-20">
        <p className="eyebrow">Before you start</p>
        <h1 className="display mt-4 text-[clamp(2.25rem,5vw,3.25rem)]">How your work is handled</h1>
        <p className="mt-3 text-md text-ink-2">Five things to know. Nothing that identifies you is ever written on-chain.</p>
        <dl className="mt-10 divide-y divide-rule rounded-[24px] bg-paper-raised px-6 ring-1 ring-rule">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-2 py-5 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
              <dt className="text-sm font-semibold">{k}</dt>
              <dd className="text-[0.9375rem] text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10">
          <ConsentForm next={next && next.startsWith("/") ? next : homeFor(me.role)} consented={!!me.consentAt && !me.withdrawnAt} />
        </div>
      </article>
    </Shell>
  );
}
