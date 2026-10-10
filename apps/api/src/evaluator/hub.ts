import type { EvalEvent } from "@graspchain/shared";

type Listener = (e: EvalEvent) => void;
interface Run {
  events: EvalEvent[];
  listeners: Set<Listener>;
  finished: boolean;
  at: number;
}

/**
 * In-memory fan-out of evaluation events, so a refreshed tab or a second tab can re-attach to a
 * running evaluation and replay what it missed. Durable state lives in SQLite; this is only the
 * live stream (polling reads the database).
 */
export class EventHub {
  private runs = new Map<string, Run>();

  open(attemptId: string) {
    this.runs.set(attemptId, { events: [], listeners: new Set(), finished: false, at: Date.now() });
  }

  emit(attemptId: string, e: EvalEvent) {
    const run = this.runs.get(attemptId);
    if (!run) return;
    run.events.push(e);
    for (const l of run.listeners) l(e);
    if (e.type === "done" || e.type === "error") {
      run.finished = true;
      run.listeners.clear();
    }
  }

  subscribe(attemptId: string, l: Listener): { replay: EvalEvent[]; finished: boolean; unsubscribe: () => void } | null {
    const run = this.runs.get(attemptId);
    if (!run) return null;
    if (!run.finished) run.listeners.add(l);
    return { replay: [...run.events], finished: run.finished, unsubscribe: () => run.listeners.delete(l) };
  }

  isRunning(attemptId: string) {
    const r = this.runs.get(attemptId);
    return !!r && !r.finished;
  }

  gc(maxAgeMs = 10 * 60_000) {
    const now = Date.now();
    for (const [k, r] of this.runs) if (r.finished && now - r.at > maxAgeMs) this.runs.delete(k);
  }
}
