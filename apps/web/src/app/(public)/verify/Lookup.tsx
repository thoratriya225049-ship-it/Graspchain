"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Bits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Lookup() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const v = id.trim();
    if (!UUID.test(v)) return setError("An assessment id looks like 3f1c2b9e-4a7d-4c1e-9b2a-7d6e5f4a3b21.");
    router.push(`/verify/${v.toLowerCase()}`);
  }

  async function fromFile(f: File | undefined) {
    setFileError(null);
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as { assessmentId?: string };
      if (!j.assessmentId || !UUID.test(j.assessmentId)) throw new Error();
      router.push(`/verify/${j.assessmentId}`);
    } catch {
      setFileError("That file is not a Graspchain receipt.");
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={go} noValidate className="space-y-4">
        <Field label="Assessment id" htmlFor="aid" error={error}>
          <input
            id="aid"
            value={id}
            onChange={(e) => setId(e.target.value)}
            spellCheck={false}
            placeholder="3f1c2b9e-…"
            aria-invalid={!!error}
            className={`${inputClass} mono`}
          />
        </Field>
        <Button type="submit" iconAfter="arrow">
          Verify
        </Button>
      </form>
      <Field
        label="Or read the id from a receipt file"
        htmlFor="rf"
        error={fileError}
        hint="The file stays on your device; only its id is used to open the check."
      >
        <input
          id="rf"
          type="file"
          accept="application/json,.json"
          onChange={(e) => fromFile(e.target.files?.[0])}
          className="block text-sm file:mr-3 file:rounded-sm file:border file:border-ink file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
        />
      </Field>
    </div>
  );
}
