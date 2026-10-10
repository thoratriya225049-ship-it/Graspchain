import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { ButtonLink } from "@/components/ui/Button";
import { getConfig, getMe, homeFor } from "@/lib/api";

const STAGES = [
  {
    n: "01",
    who: "LLM",
    verb: "structures",
    body: "Cuts your explanation into atomic claims. Each claim must be your exact words — the server rejects anything paraphrased, and adds back any sentence it left out.",
    number: "Cannot change the number. It only chooses span boundaries, which are checked.",
  },
  {
    n: "02",
    who: "Jev",
    verb: "decides",
    body: "One typed call judges every key idea, every claim and the sentence it came from, accuracy, reasoning, the central idea, gibberish and instructions to the grader.",
    number: "Shapes the number only through probabilities — never free text.",
  },
  {
    n: "03",
    who: "Code",
    verb: "scores",
    body: "A fixed formula, written before any data was seen, turns those probabilities into 1–10. The same input always gives the same score.",
    number: "The only place the number is computed.",
  },
  {
    n: "04",
    who: "LLM",
    verb: "explains",
    body: "Writes what you understood, missed and got wrong. Every quote is checked against your answer and every point against the judge.",
    number: "Cannot change the number.",
  },
  {
    n: "05",
    who: "Chain",
    verb: "commits",
    body: "The receipt's hash is written to a public registry. If anyone edits the record later, the hash no longer matches — and you hold your own copy.",
    number: "Makes the number tamper-evident.",
  },
];

export default async function Landing() {
  const me = await getMe().catch(() => null);
  if (me && !me.needsConsent) redirect(homeFor(me.role));
  const cfg = await getConfig();

  return (
    <Shell me={null}>
      <section className="frame grid gap-12 pb-20 pt-14 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-16 md:pt-24">
        <div className="animate-rise">
          <p className="eyebrow">Proof of comprehension</p>
          <h1 className="mt-5 font-serif text-[2.75rem] leading-[1.02] tracking-[-0.03em] md:text-display">
            A score you can learn from, and nobody can quietly change.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-2">
            Read a short technical article for a fixed time. It disappears. Explain it in your own words. In about two seconds you get a score, then precise
            feedback, then an X-Ray of the article showing what you understood, missed and got wrong.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <ButtonLink href="/login" size="lg" iconAfter="arrow">
              Sign in with a roster code
            </ButtonLink>
            <Link href="/verify" className="link text-[0.9375rem]">
              Verify a receipt
            </Link>
          </div>
        </div>

        <aside className="animate-rise self-end [animation-delay:100ms]" aria-label="Fairness guarantees">
          <ol className="border-t border-ink">
            {[
              [
                "Same chance to enter",
                "When a class starts together, everyone joining in the same two-second window is ordered by a seeded shuffle. A faster connection doesn't get you in first.",
              ],
              ["Same time to read", "Your clock starts when the article has arrived on your screen — up to ten seconds of network delay is given back."],
              ["Same grader, and a receipt", "Every answer goes through the same pinned judge and fixed formula. The result is a receipt anyone can check."],
            ].map(([h, b]) => (
              <li key={h} className="border-b border-rule py-5">
                <h2 className="font-serif text-lg">{h}</h2>
                <p className="mt-1.5 text-[0.9375rem] text-ink-2">{b}</p>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="border-y border-ink bg-paper-raised" aria-labelledby="how">
        <div className="frame py-16 md:py-20">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-end">
            <h2 id="how" className="font-serif text-2xl md:text-3xl">
              How a score is made
            </h2>
            <p className="max-w-xl text-[0.9375rem] text-ink-2">
              The LLM structures, Jev decides, code scores, the LLM explains, the chain commits. Who is allowed to touch the number at each step is the whole
              design.
            </p>
          </div>
          <ol className="mt-12 grid border-t border-ink md:grid-cols-5">
            {STAGES.map((s) => (
              <li key={s.n} className="flex flex-col border-b border-rule py-6 md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0">
                <p className="mono text-xs text-ink-3">{s.n}</p>
                <p className="mt-3 font-serif text-xl leading-tight">
                  {s.who} <span className="italic text-ink-3">{s.verb}</span>
                </p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
                <p
                  className={`mt-5 min-h-[3.75rem] border-t pt-3 text-xs ${s.n === "03" ? "border-signal font-medium text-signal-ink" : "border-rule text-ink-3"}`}
                >
                  {s.number}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="frame grid gap-12 py-20 md:grid-cols-2 md:gap-20" aria-labelledby="honest">
        <div>
          <h2 id="honest" className="font-serif text-2xl">
            What this deployment is running
          </h2>
          <p className="mt-3 max-w-md text-[0.9375rem] text-ink-2">
            Read live from the server. Stand-ins are named, everywhere they appear — including inside every receipt.
          </p>
        </div>
        {cfg ? (
          <dl className="border-t border-ink text-[0.9375rem]">
            {[
              [
                "Judge",
                cfg.judge.kind === "jev" ? `Jev · ${cfg.judge.model}` : `${cfg.judge.model} — a local, deterministic stand-in for Jev (no Jev key configured)`,
              ],
              [
                "LLM",
                cfg.llm.enabled
                  ? `${cfg.llm.provider} · ${cfg.llm.model}`
                  : "None configured — claims are split by sentence and feedback is built from the judge's results",
              ],
              [
                "Chain",
                `${cfg.chain.name} (${cfg.chain.chainId})${cfg.chain.registry ? ` · registry ${cfg.chain.registry.slice(0, 10)}…` : " · no registry configured"}`,
              ],
              ["Mode", cfg.demoMode === "replay" ? "Replay: cached answers only, no network calls" : "Live"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4 border-b border-rule py-4">
                <dt className="eyebrow pt-1">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="border-t border-ink pt-4 text-bad">The API is not reachable right now.</p>
        )}
      </section>
    </Shell>
  );
}
