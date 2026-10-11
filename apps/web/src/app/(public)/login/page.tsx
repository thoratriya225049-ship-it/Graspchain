import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/Shell";
import { getMe, homeFor } from "@/lib/api";
import { SignIn } from "./SignIn";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getMe().catch(() => null);
  if (me) redirect(me.needsConsent ? "/consent" : next && next.startsWith("/") ? next : homeFor(me.role));
  return (
    <Shell me={null}>
      <div className="frame pt-10 md:pt-16">
        <header className="max-w-2xl">
          <p className="eyebrow">Sign in</p>
          <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.5rem)]">Who&rsquo;s here today?</h1>
          <p className="mt-3 text-md text-ink-2">Pick a role, then sign in with your ID — or create one. Nothing identifying ever reaches the chain.</p>
        </header>
        <div className="mt-10">
          <SignIn next={next && next.startsWith("/") ? next : undefined} />
        </div>
      </div>
    </Shell>
  );
}
