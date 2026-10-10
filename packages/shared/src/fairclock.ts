import type { ClockMode } from "./types";

/**
 * FairClock (PRD §9.1, SYSTEM_DESIGN §4.1). The reading deadline starts from measured delivery,
 * capped so that faking a slow acknowledgement gains at most `capS` seconds.
 *  - naive: sentAt + readSeconds
 *  - fair, before ack: sentAt + cap + readSeconds (provisional)
 *  - fair, after ack:  sentAt + min(ackAt − sentAt, cap) + readSeconds (tightened, never extended)
 */
export function computeDeadline(
  sentAt: number,
  ackAt: number | null,
  readSeconds: number,
  cfg: { capS: number; mode: ClockMode },
): { deadline: number; latencyCompMs: number } {
  if (cfg.mode === "naive") return { deadline: sentAt + readSeconds * 1000, latencyCompMs: 0 };
  const capMs = cfg.capS * 1000;
  const delay = ackAt == null ? capMs : Math.min(Math.max(0, ackAt - sentAt), capMs);
  return { deadline: sentAt + delay + readSeconds * 1000, latencyCompMs: ackAt == null ? 0 : delay };
}
