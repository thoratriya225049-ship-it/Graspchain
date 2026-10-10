import { z } from "zod";
import type { FeedbackRecord, ScorePayload, XRay } from "./types";

/** SSE events on POST /api/session/:id/submit (SYSTEM_DESIGN §6). */
export type Stage = "segmenting" | "judging" | "scoring" | "explaining" | "recording";

export type EvalEvent =
  | { type: "accepted"; data: { attemptId: string; attemptNo: number } }
  | { type: "stage"; data: { stage: Stage } }
  | { type: "score"; data: ScorePayload }
  | { type: "hidden"; data: { attemptId: string; message: string } }
  | { type: "feedback"; data: { partial: unknown } | { final: FeedbackRecord } }
  | { type: "xray"; data: XRay }
  | { type: "record"; data: { assessmentId: string; recordHash: string; chainStatus: string } }
  | { type: "done"; data: { attemptId: string } }
  | { type: "error"; data: { code: string; message: string } };

export function encodeSse(e: EvalEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

/** Incremental SSE parser for `fetch` streams (EventSource cannot POST). */
export function createSseParser(onEvent: (type: string, data: unknown) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk.replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let type = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) continue;
      try {
        onEvent(type, JSON.parse(data.join("\n")));
      } catch {
        /* malformed event: ignore, polling will recover */
      }
    }
  };
}

/** Light runtime checks on the payloads the client relies on. */
export const ScoreEventSchema = z
  .object({
    attemptId: z.string(),
    finalScore: z.number().min(1).max(10),
    band: z.string(),
    dimensions: z.object({ coverage: z.number(), correctness: z.number(), accuracy: z.number(), reasoning: z.number(), ownWords: z.number() }),
  })
  .passthrough();
export const RecordEventSchema = z.object({ assessmentId: z.string(), recordHash: z.string(), chainStatus: z.string() });

export type ResultStatus = "evaluating" | "scored" | "done" | "delayed" | "failed";

/** GET /api/result/:attemptId (polling fallback and page loads). */
export interface ResultPayload {
  attemptId: string;
  status: ResultStatus;
  researchHidden: boolean;
  score: ScorePayload | null;
  feedback: FeedbackRecord | null;
  xrayReady: boolean;
  record: { assessmentId: string; recordHash: string; chainStatus: string; ethTx: string | null; blockNumber: number | null } | null;
  error: { code: string; message: string } | null;
  xray?: XRay;
}
