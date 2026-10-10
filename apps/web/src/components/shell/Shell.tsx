import Link from "next/link";
import { getConfig } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Nav } from "./Nav";
import { SystemRail } from "./SystemRail";
import { Wordmark } from "./Wordmark";

export async function Shell({ me, children, wide = false }: { me: Me | null; children: React.ReactNode; wide?: boolean }) {
  const config = await getConfig();
  return (
    <div className="flex min-h-dvh flex-col">
      <SystemRail config={config} />
      <header className="sticky top-0 z-30 border-b border-rule bg-paper">
        <div className="frame flex h-16 items-center justify-between gap-6">
          <Wordmark href={me ? (me.role === "student" ? "/home" : me.role === "teacher" ? "/teacher" : "/admin") : "/"} />
          {me ? (
            <Nav me={me} />
          ) : (
            <div className="flex items-center gap-6 text-[0.9375rem]">
              <Link href="/verify" className="text-ink-3 no-underline hover:text-ink">
                Verify a receipt
              </Link>
              <Link href="/login" className="font-medium">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </header>
      <main id="main" className={`flex-1 ${wide ? "" : "pb-24"}`}>
        {children}
      </main>
      <Footer config={config} />
    </div>
  );
}

function Footer({ config }: { config: Awaited<ReturnType<typeof getConfig>> }) {
  return (
    <footer className="border-t border-rule">
      <div className="frame flex flex-col gap-3 py-8 text-xs text-ink-3 md:flex-row md:items-center md:justify-between">
        <p>
          Graspchain — <span className="italic">the LLM structures, Jev decides, code scores, the LLM explains, the chain commits.</span>
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1">
          {config?.chain.registry ? (
            <span>
              Registry <span className="mono">{config.chain.registry.slice(0, 10)}…</span> on {config.chain.name}
            </span>
          ) : null}
          {config ? (
            <a className="link" href={config.verifierUrl} target="_blank" rel="noreferrer">
              Independent verifier
            </a>
          ) : null}
        </p>
      </div>
    </footer>
  );
}
