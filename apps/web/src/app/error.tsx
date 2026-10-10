"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Route-level error boundary: say what happened and offer a way forward. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const unreachable = /not reachable|API_UNREACHABLE|fetch failed/i.test(error.message);
  return (
    <div className="frame-narrow flex min-h-[70dvh] flex-col justify-center py-20">
      <p className="eyebrow text-bad">Something went wrong</p>
      <h1 className="mt-3 font-serif text-2xl">{unreachable ? "The Graspchain API isn't responding." : "This page couldn't load."}</h1>
      <p className="mt-4 text-ink-2">
        {unreachable
          ? "Start the stack with `pnpm dev`, or check that the API is running on its configured port."
          : "Nothing you submitted was lost — answers are saved as soon as they're accepted."}
      </p>
      {error.digest ? <p className="mono mt-4 text-xs text-ink-3">Reference {error.digest}</p> : null}
      <div className="mt-8 flex gap-6">
        <button onClick={reset} className="font-medium underline underline-offset-4">
          Try again
        </button>
        <Link href="/" className="link">
          Home
        </Link>
      </div>
    </div>
  );
}
