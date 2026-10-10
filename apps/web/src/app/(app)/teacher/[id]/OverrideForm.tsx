"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Notice, inputClass } from "@/components/ui/Bits";
import { call } from "@/lib/http";

export function OverrideForm({ assessmentId, currentScore }: { assessmentId: string; currentScore: number }) {
  const router = useRouter();
  const [score, setScore] = useState(currentScore.toFixed(1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ assessmentId: string; previousScore: number; newScore: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(score);
    if (!Number.isFinite(n) || n < 1 || n > 10) return setError("Enter a score from 1.0 to 10.0.");
    if (reason.trim().length < 10) return setError("Give a reason of at least 10 characters — it is recorded with the correction.");
    setBusy(true);
    setError(null);
    const r = await call<{ assessmentId: string; previousScore: number; newScore: number }>(`/api/teacher/review/${assessmentId}`, {
      method: "POST",
      json: { newScore: n, reason: reason.trim() },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    setDone(r.data);
    router.refresh();
  }

  if (done)
    return (
      <div className="mt-4">
        <Notice tone="ok" title={`Correction recorded: ${done.previousScore.toFixed(1)} → ${done.newScore.toFixed(1)}`}>
          New assessment <span className="mono">{done.assessmentId.slice(0, 8)}</span> supersedes the original and is queued on-chain.{" "}
          <Link className="link" href={`/verify/${done.assessmentId}`}>
            Verify the lineage
          </Link>
        </Notice>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="mt-5 space-y-5">
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-end gap-4">
        <Field label="New score" htmlFor="ns">
          <input
            id="ns"
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={`${inputClass} num mono text-lg`}
          />
        </Field>
        <p className="pb-3 text-xs text-ink-3">The original stays on-chain and still verifies; the student sees both.</p>
      </div>
      <Field label="Reason (shown to the student, written into the receipt)" htmlFor="rs">
        <textarea
          id="rs"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
          placeholder="e.g. kp3 is explained correctly in other words; the judge missed the paraphrase."
        />
      </Field>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button type="submit" busy={busy}>
        Record correction
      </Button>
    </form>
  );
}
