import type { PublicConfig } from "@/lib/types";

/**
 * The honesty line: what is actually doing the work in this deployment. Stand-ins are named
 * as such on every page (local demo judge, missing LLM, replay mode, local chain).
 */
export function SystemRail({ config }: { config: PublicConfig | null }) {
  if (!config) {
    return (
      <div className="bg-bad text-white">
        <p className="frame py-1.5 text-xs">The Graspchain API is not reachable. Pages that need data will show an error until it is running.</p>
      </div>
    );
  }
  const items: { k: string; v: string; warn?: boolean }[] = [
    config.judge.kind === "jev"
      ? { k: "Judge", v: `Jev ${config.judge.model}` }
      : { k: "Judge", v: `${config.judge.model} · local demo stand-in, not Jev`, warn: true },
    config.llm.enabled
      ? { k: "LLM", v: `${config.llm.provider}/${config.llm.model}` }
      : { k: "LLM", v: "off · sentence split + template feedback", warn: true },
    { k: "Chain", v: `${config.chain.name} · ${config.chain.chainId}${config.chain.canWrite ? "" : " · writer off"}`, warn: !config.chain.canWrite },
  ];
  if (config.demoMode === "replay") items.push({ k: "Mode", v: "replay · cached answers only", warn: true });
  if (config.researchMode) items.push({ k: "Research", v: "on · scores hidden from students", warn: true });
  return (
    <div className="border-b border-ink/90 bg-ink text-paper/85" role="note" aria-label="System status">
      <ul className="frame flex flex-wrap items-center gap-x-6 gap-y-0.5 py-1.5 text-[0.6875rem] leading-4">
        {items.map((i) => (
          <li key={i.k} className="flex items-center gap-2">
            <span className="uppercase tracking-[0.14em] text-paper/50">{i.k}</span>
            <span className={`mono ${i.warn ? "text-[#f0b98f]" : "text-paper"}`}>{i.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
