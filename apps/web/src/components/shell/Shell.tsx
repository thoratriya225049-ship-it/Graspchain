import Link from "next/link";
import { getConfig } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Nav } from "./Nav";
import { ServerUnreachable, SystemStatus } from "./SystemRail";
import { Wordmark } from "./Wordmark";

export async function Shell({ me, children, wide = false, bare = false }: { me: Me | null; children: React.ReactNode; wide?: boolean; bare?: boolean }) {
  const config = await getConfig();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper">
        <div className="frame flex h-16 items-center justify-between gap-6">
          <Wordmark href={me ? (me.role === "student" ? "/home" : me.role === "teacher" ? "/teacher" : "/admin") : "/"} />
          {me ? (
            <Nav me={me} system={<SystemStatus config={config} />} />
          ) : (
            <div className="flex items-center gap-1 text-[0.9375rem] sm:gap-2">
              <SystemStatus config={config} />
              <Link
                href="/verify"
                className="hidden rounded-full px-3.5 py-2 text-ink-3 no-underline transition-colors hover:bg-paper-sunk hover:text-ink sm:inline-flex"
              >
                Verify a receipt
              </Link>
              <Link href="/login" className="rounded-full border border-teal px-4 py-1.5 font-medium text-teal no-underline transition-colors hover:bg-mint">
                Sign in
              </Link>
            </div>
          )}
        </div>
        {!config ? <ServerUnreachable /> : null}
      </header>
      <main id="main" className={`flex-1 ${wide || bare ? "" : "pb-24"}`}>
        {children}
      </main>
      <Footer verifierUrl={config?.verifierUrl ?? null} />
    </div>
  );
}

export function Footer({ verifierUrl }: { verifierUrl: string | null }) {
  return (
    <footer className="border-t border-rule">
      <div className="frame flex flex-col gap-3 py-8 text-xs text-ink-3 md:flex-row md:items-center md:justify-between">
        <p>
          Graspchain — <span className="italic">the LLM finds evidence, rules decide, code scores, the LLM explains, the chain commits.</span>
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1">
          {verifierUrl ? (
            <a className="link" href={verifierUrl} target="_blank" rel="noreferrer">
              Independent verifier
            </a>
          ) : null}
          <Link className="link" href="/credits">
            Credits &amp; licenses
          </Link>
        </p>
      </div>
    </footer>
  );
}
