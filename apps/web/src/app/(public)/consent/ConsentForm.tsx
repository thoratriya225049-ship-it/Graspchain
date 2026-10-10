"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Bits";
import { call } from "@/lib/http";

export function ConsentForm({ next, consented }: { next: string; consented: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

  async function send(accept: boolean) {
    setBusy(accept ? "accept" : "withdraw");
    setError(null);
    const r = await call("/api/auth/consent", { method: "POST", json: { accept } });
    setBusy(null);
    if (!r.ok) return setError(r.error!.message);
    if (accept) {
      router.push(next);
      router.refresh();
    } else setWithdrawn(true);
  }

  if (withdrawn)
    return (
      <Notice tone="ink" title="Consent withdrawn">
        Your data is excluded from research exports from now on. You can sign out, or accept again to keep using Graspchain.
      </Notice>
    );

  return (
    <div className="space-y-4">
      {error ? (
        <Notice tone="bad" title="Couldn't save">
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" busy={busy === "accept"} onClick={() => send(true)} iconAfter="arrow">
          I understand and agree
        </Button>
        {consented ? (
          <Button variant="quiet" busy={busy === "withdraw"} onClick={() => send(false)}>
            Withdraw consent
          </Button>
        ) : null}
      </div>
    </div>
  );
}
