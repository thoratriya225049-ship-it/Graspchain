"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Route-level error boundary: calm, plain, recoverable. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const unreachable = /not reachable|API_UNREACHABLE|fetch failed/i.test(error.message);
  return (
    <div className="frame-narrow flex min-h-[70dvh] flex-col justify-center py-20">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <span className="h-2 w-2 rounded-full bg-warn-mark" aria-hidden />
        {unreachable ? "Can’t reach the server" : "Something went wrong"}
      </p>
      <h1 className="display mt-4 text-[clamp(2rem,4.5vw,3rem)]">{unreachable ? "The Graspchain server isn’t answering." : "This page couldn’t load."}</h1>
      <p className="mt-4 text-ink-2">
        {unreachable
          ? "It may be starting up. Try again in a moment — or start the stack with `pnpm dev`."
          : "Nothing you submitted was lost — answers are saved as soon as they're accepted."}
      </p>
      {error.digest ? <p className="mono mt-4 text-xs text-ink-3">Reference {error.digest}</p> : null}
      <div className="mt-8 flex items-center gap-6">
        <button onClick={reset} className="inline-flex h-11 items-center rounded-[14px] bg-teal px-5 font-medium text-white hover:bg-[#0e5f75]">
          Try again
        </button>
        <Link href="/" className="link">
          Home
        </Link>
      </div>
    </div>
  );
}
