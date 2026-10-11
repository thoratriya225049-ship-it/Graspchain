import { redirect } from "next/navigation";
import { ChainFlowStory } from "@/components/fx/ChainFlow";
import { ColourfulText } from "@/components/fx/ColourfulText";
import { OutlineMarquee } from "@/components/fx/OutlineMarquee";
import { Cta4, type CtaActivity, type CtaMetric } from "@/components/home/Cta4";
import { HomeHero } from "@/components/home/HomeHero";
import { Shell } from "@/components/shell/Shell";
import { getConfig, getMe, homeFor } from "@/lib/api";
import { homeExample } from "@/lib/example";
import type { PublicConfig } from "@/lib/types";

function pipeline(cfg: PublicConfig | null) {
  const judge = cfg?.judge.kind ?? "evidence";
  return [
    {
      who: "LLM",
      verb: "finds evidence",
      line: "Cuts the answer into claims in the student's exact words and quotes the source sentences that bear on each.",
      touch: "Cannot set the number.",
    },
    judge === "jev"
      ? { who: "Jev", verb: "decides", line: "One typed call judges every key idea and claim.", touch: "Shapes it only through probabilities." }
      : {
          who: "Rules",
          verb: "decide",
          line: "Every quote is checked word for word; published rules turn verified evidence into verdicts.",
          touch: "Deterministic: same evidence, same verdict.",
        },
    {
      who: "Code",
      verb: "scores",
      line: "A fixed formula, set before any data was seen, turns verdicts into 1–10.",
      touch: "The only place the number is computed.",
    },
    {
      who: "LLM",
      verb: "explains",
      line: "Writes what was understood, missed and misread; every quote is checked against the answer.",
      touch: "Cannot change the number.",
    },
    {
      who: "Chain",
      verb: "commits",
      line: "A salted hash of the receipt goes to a public registry. Edit the record and it stops matching.",
      touch: "Makes the number tamper-evident.",
    },
  ];
}

const STAGE_DOT = ["#AB9BCB", "#6ACCC6", "#12708A", "#B0BCE3", "#0B3A4A"];

export default async function Landing() {
  const me = await getMe().catch(() => null);
  if (me && !me.needsConsent) redirect(homeFor(me.role));
  const cfg = await getConfig();
  const chainName = cfg?.chain.name ?? "Ethereum";
  const ex = homeExample(chainName);

  const metrics: CtaMetric[] = cfg
    ? [
        {
          id: "judge",
          label: "Judge",
          value: cfg.judge.kind === "evidence" ? "Rules" : cfg.judge.kind === "jev" ? "Jev" : "Local",
          note: cfg.judge.kind === "local" ? "demo stand-in" : cfg.judge.kind === "evidence" ? "on verified evidence" : "typed judge",
          ok: cfg.judge.kind !== "local",
          icon: "check",
        },
        {
          id: "llm",
          label: "LLM",
          value: cfg.llm.enabled ? (cfg.llm.provider ?? "on") : "Off",
          note: cfg.llm.enabled ? "evidence + feedback" : "template feedback",
          ok: cfg.llm.enabled,
          icon: "pen",
        },
        {
          id: "chain",
          label: "Chain",
          value: String(cfg.chain.chainId),
          note: cfg.chain.canWrite ? "writer on" : "writer off",
          ok: cfg.chain.canWrite,
          icon: "link",
        },
        { id: "clock", label: "FairClock", value: `${cfg.fairclockCapS} s`, note: "delay given back", ok: cfg.clockMode === "fair", icon: "replay" },
      ]
    : [];
  const activities: CtaActivity[] = [
    { id: "u", title: "Understand · read the source", timestamp: "a fixed time, then it closes", color: "#AEDFF7" },
    { id: "e", title: "Evidence · claims meet sentences", timestamp: "every quote checked word for word", color: "#6ACCC6" },
    { id: "d", title: "Decision · rules, then a formula", timestamp: "same evidence, same score", color: "#12708A" },
    { id: "p", title: "Proof · a salted hash on-chain", timestamp: cfg ? chainName : "public registry", color: "#0B3A4A" },
  ];

  return (
    <Shell me={null} bare>
      <HomeHero ex={ex} chain={chainName} registry={cfg?.chain.registry ?? null} capS={cfg?.fairclockCapS ?? 10} />

      {/* A lighter, full-width layer over the hero (square edges): Sky (the tint inside "proven.") easing into Paper, so the
          next section reads as new without a hard line, and hands off cleanly to the marquee below. */}
      <section
        className="relative z-10 -mt-10 md:-mt-14"
        style={{
          background: "linear-gradient(180deg, #CDE8F4 0%, #DDF0F6 38%, #EEF8F9 72%, var(--color-paper) 100%)",
          boxShadow: "0 -28px 60px -36px rgb(4 22 30 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.55)",
        }}
        aria-labelledby="trail"
      >
        <div className="frame py-20 md:py-28">
          <div className="max-w-2xl">
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-teal">The chain</p>
            <h2 id="trail" className="display mt-4 text-[clamp(2.25rem,5vw,3.5rem)] text-ink">
              Every answer leaves a trail you can <ColourfulText text="check" tone="light" />.
            </h2>
            <p className="mt-4 text-md text-ink-2">One claim, followed from the student&rsquo;s words to a sealed receipt.</p>
          </div>
          <div className="mt-14">
            <ChainFlowStory ex={ex} tone="light" />
          </div>
        </div>
      </section>

      <OutlineMarquee />

      <section className="frame py-16 md:py-24" aria-labelledby="how">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
          <h2 id="how" className="display text-[clamp(2rem,4vw,3rem)]">
            How a result is made
          </h2>
          <p className="max-w-lg text-[0.9375rem] text-ink-2">Who may touch the number at each step is the whole design.</p>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl bg-rule md:grid-cols-5">
          {pipeline(cfg).map((s, i) => (
            <li key={s.who + s.verb} className="flex flex-col bg-paper p-6">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_DOT[i] }} aria-hidden />
                <span className="mono text-xs text-ink-3">0{i + 1}</span>
              </span>
              <p className="mt-4 font-serif text-xl leading-tight">
                {s.who} <span className="italic text-ink-3">{s.verb}</span>
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-2">{s.line}</p>
              <p className={`mt-5 border-t pt-3 text-xs ${s.who === "Code" ? "border-teal font-medium text-teal" : "border-rule text-ink-3"}`}>{s.touch}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Full-bleed Mint band; the content keeps to the page frame so it lines up with the sections above. */}
      <section className="bg-mint" aria-labelledby="fair">
        <div className="frame grid gap-10 py-14 md:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] md:py-20">
          <h2 id="fair" className="display text-[clamp(1.75rem,3vw,2.5rem)]">
            Fair by construction
          </h2>
          <dl className="grid gap-8 sm:grid-cols-3">
            {[
              ["Same chance to enter", "Everyone joining in the same short window is ordered by a seeded shuffle, not connection speed."],
              ["Same time to read", `The clock starts when the passage has arrived; up to ${cfg?.fairclockCapS ?? 10} s of network delay is given back.`],
              ["Same grader", "One pinned judge and one fixed formula for every answer, with a receipt to prove it."],
            ].map(([h, b]) => (
              <div key={h}>
                <dt className="font-serif text-lg">{h}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-2">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Cta4
        title="Ready to prove what you"
        accentWord="understood?"
        subtitle="Sign in with your ID or a demo code, read one short passage, and leave with a result you can check — and so can anyone else."
        ctaLabel="Sign in"
        ctaHref="/login"
        secondaryLabel="Verify a receipt"
        secondaryHref="/verify"
        metrics={metrics}
        activitiesTitle="How a result is made"
        activities={activities}
      />
    </Shell>
  );
}
