import Link from "next/link";
import { getConfig } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Icon } from "../ui/Icon";
import { Nav } from "./Nav";
import { ServerUnreachable, SystemStatus } from "./SystemRail";
import { Wordmark } from "./Wordmark";

export async function Shell({ me, children, wide = false, bare = false }: { me: Me | null; children: React.ReactNode; wide?: boolean; bare?: boolean }) {
  const config = await getConfig();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper">
        {/* Full width: the brand anchored far left, status and actions grouped far right. */}
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark href={me ? (me.role === "student" ? "/home" : me.role === "teacher" ? "/teacher" : "/admin") : "/"} />
          {me ? (
            <Nav me={me} system={<SystemStatus config={config} />} />
          ) : (
            <div className="flex items-center gap-0.5 min-[400px]:gap-1.5 sm:gap-3">
              <SystemStatus config={config} />
              <Link
                href="/verify"
                className="hidden h-9 items-center rounded-full px-3 text-base font-medium text-ink-2 no-underline transition-colors duration-200 hover:bg-paper-sunk hover:text-ink sm:inline-flex"
              >
                Verify a receipt
              </Link>
              <Link
                href="/login"
                className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-teal/70 px-3 text-base font-semibold text-teal no-underline min-[400px]:pl-4 min-[400px]:pr-3.5 transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-water)] hover:border-teal hover:bg-teal hover:text-white active:translate-y-px"
              >
                Sign in
                <Icon name="arrow" size={14} className="hidden transition-transform duration-200 ease-[var(--ease-water)] group-hover:translate-x-0.5 min-[400px]:block" />
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
