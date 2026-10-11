"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Notice, inputClass } from "@/components/ui/Bits";
import { call } from "@/lib/http";

export function OverrideForm({
  assessmentId,
  currentScore,
  integrityOutcome,
}: {
  assessmentId: string;
  currentScore: number;
  /** Set when the integrity record still needs a decision. */
  integrityOutcome: string | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState(currentScore.toFixed(1));
  const [decision, setDecision] = useState<"" | "CLEARED" | "UPHELD">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ assessmentId: string; previousScore: number; newScore: number; integrityDecision: string | null } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(score);
    if (!Number.isFinite(n) || n < 1 || n > 10) return setError("Enter a score from 1.0 to 10.0.");
    if (reason.trim().length < 10) return setError("Give a reason of at least 10 characters — it is recorded with the correction.");
    setBusy(true);
    setError(null);
    const changed = Math.round(n * 10) / 10 !== Math.round(currentScore * 10) / 10;
    if (!changed && !decision) return setError("Change the score, choose an integrity decision, or both.");
    const r = await call<{ assessmentId: string; previousScore: number; newScore: number; integrityDecision: string | null }>(
      `/api/teacher/review/${assessmentId}`,
      {
        method: "POST",
        json: { ...(changed ? { newScore: n } : {}), ...(decision ? { integrityDecision: decision } : {}), reason: reason.trim() },
      },
    );
    setBusy(false);
    if (!r.ok) return setError(r.error!.message);
    setDone(r.data);
    router.refresh();
  }

  if (done)
    return (
      <div className="mt-4">
        <Notice
          tone="ok"
          title={`${done.previousScore === done.newScore ? "Integrity decision recorded" : `Correction recorded: ${done.previousScore.toFixed(1)} → ${done.newScore.toFixed(1)}`}${done.integrityDecision ? ` · integrity ${done.integrityDecision.toLowerCase()}` : ""}`}
        >
          New assessment <span className="mono">{done.assessmentId.slice(0, 8)}</span> supersedes the original and is queued on-chain.{" "}
          <Link className="link" href={`/verify/${done.assessmentId}`}>
            Verify the lineage
          </Link>
        </Notice>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="mt-5 space-y-5">
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-end gap-4">
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
      {integrityOutcome ? (
        <fieldset className="space-y-2 text-sm">
          <legend className="text-sm font-medium">Integrity decision (current outcome: {integrityOutcome.replace(/_/g, " ").toLowerCase()})</legend>
          {[
            ["", "No decision now"],
            ["CLEARED", "Clear — the events have an innocent explanation; certify the result"],
            ["UPHELD", "Uphold — the conditions were not trustworthy; the result is not certified"],
          ].map(([v, label]) => (
            <label
              key={v}
              className={`flex cursor-pointer items-start gap-2.5 rounded-[12px] px-3 py-2 transition-colors ${decision === v ? "bg-mint" : "hover:bg-paper-sunk"}`}
            >
              <input
                type="radio"
                name="integrity"
                value={v}
                checked={decision === v}
                onChange={() => setDecision(v as typeof decision)}
                className="mt-1 accent-[#12708A]"
              />
              <span>{label}</span>
            </label>
          ))}
          <p className="text-xs text-ink-3">The recorded events are never edited; the decision is a new, linked record.</p>
        </fieldset>
      ) : null}
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
      <Button type="submit" busy={busy} busyLabel="Recording…" className="w-full">
        Record correction
      </Button>
    </form>
  );
}
