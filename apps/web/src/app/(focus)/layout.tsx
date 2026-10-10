import { SystemRail } from "@/components/shell/SystemRail";
import { Wordmark } from "@/components/shell/Wordmark";
import { getConfig, requireMe } from "@/lib/api";

/** Focus mode for reading and writing: no navigation, nothing competing with the text. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe(["student"]);
  const config = await getConfig();
  return (
    <div className="flex min-h-dvh flex-col">
      <SystemRail config={config} />
      <header className="border-b border-rule">
        <div className="frame flex h-14 items-center justify-between">
          <Wordmark href="/home" />
          <span className="mono text-sm text-ink-3">{me.code}</span>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
