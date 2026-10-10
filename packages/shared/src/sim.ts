/**
 * FairGate simulation (PRD §13.3, E5a). Synthetic clients; everything here is simulated and is
 * labelled as such in the UI. Deterministic for a given seed.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SimConfig {
  mode: "fifo" | "fair";
  windowMs: number;
  seed: number;
  fastClients?: number;
  normalClients?: number;
  burst?: number;
  concurrency?: number;
  serviceMs?: number;
  horizonMs?: number;
}

export interface CohortStats {
  cohort: "fast" | "normal";
  clients: number;
  admittedWithin60s: number;
  medianWaitS: number | null;
  p95WaitS: number | null;
}

export interface SimResult {
  config: Required<SimConfig>;
  cohorts: CohortStats[];
  latencyAdvantageRatio: number | null;
  jain: number;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
};

function lognormal(rand: () => number, median: number, sigma: number) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return median * Math.exp(sigma * z);
}

export function simulate(cfg: SimConfig): SimResult {
  const c: Required<SimConfig> = {
    fastClients: 20,
    normalClients: 180,
    burst: 5,
    concurrency: 3,
    serviceMs: 2000,
    horizonMs: 60000,
    ...cfg,
  };
  const rand = mulberry32(c.seed);
  type Join = { client: number; cohort: "fast" | "normal"; arrive: number };
  const joins: Join[] = [];
  for (let i = 0; i < c.fastClients; i++) {
    const lat = rand() * 20;
    for (let b = 0; b < c.burst; b++) joins.push({ client: i, cohort: "fast", arrive: lat + b * 5 });
  }
  for (let i = 0; i < c.normalClients; i++) {
    const lat = Math.min(2000, Math.max(200, lognormal(rand, 600, 0.6)));
    joins.push({ client: c.fastClients + i, cohort: "normal", arrive: lat });
  }

  // One open ticket per client: later joins from the same client are rejected.
  const seen = new Set<number>();
  const tickets = joins.sort((a, b) => a.arrive - b.arrive).filter((j) => (seen.has(j.client) ? false : (seen.add(j.client), true)));

  let order: Join[];
  if (c.mode === "fifo") order = tickets;
  else {
    const windows = new Map<number, Join[]>();
    for (const t of tickets) {
      const w = Math.floor(t.arrive / c.windowMs);
      windows.set(w, [...(windows.get(w) ?? []), t]);
    }
    order = [...windows.keys()].sort((a, b) => a - b).flatMap((w) => shuffle(windows.get(w)!, rand));
  }

  const slots = Array(c.concurrency).fill(0) as number[];
  const admittedAt = new Map<number, number>();
  for (const t of order) {
    const windowClose = c.mode === "fair" ? (Math.floor(t.arrive / c.windowMs) + 1) * c.windowMs : t.arrive;
    const i = slots.indexOf(Math.min(...slots));
    const start = Math.max(slots[i], windowClose);
    slots[i] = start + c.serviceMs;
    admittedAt.set(t.client, start - t.arrive);
  }

  const cohorts: CohortStats[] = (["fast", "normal"] as const).map((cohort) => {
    const ts = tickets.filter((t) => t.cohort === cohort);
    const waits = ts.map((t) => admittedAt.get(t.client)!);
    const within = waits.filter((w, k) => ts[k].arrive + w <= c.horizonMs).length;
    return {
      cohort,
      clients: ts.length,
      admittedWithin60s: ts.length ? within / ts.length : 0,
      medianWaitS: quantile(waits, 0.5) !== null ? quantile(waits, 0.5)! / 1000 : null,
      p95WaitS: quantile(waits, 0.95) !== null ? quantile(waits, 0.95)! / 1000 : null,
    };
  });
  const [fast, normal] = cohorts;
  const ratio = fast.medianWaitS && normal.medianWaitS ? normal.medianWaitS / fast.medianWaitS : null;
  const rates = cohorts.map((x) => x.admittedWithin60s);
  const jain = rates.reduce((s, x) => s + x, 0) ** 2 / (rates.length * rates.reduce((s, x) => s + x * x, 0) || 1);
  return { config: c, cohorts, latencyAdvantageRatio: ratio, jain };
}

export function simulateMany(
  base: Omit<SimConfig, "seed">,
  seeds: number,
): {
  ratioMean: number | null;
  ratioSd: number | null;
  fastMedian: number;
  normalMedian: number;
  fastAdmit: number;
  normalAdmit: number;
  jain: number;
} {
  const runs = Array.from({ length: seeds }, (_, i) => simulate({ ...base, seed: 1000 + i }));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const ratios = runs.map((r) => r.latencyAdvantageRatio).filter((x): x is number => x !== null);
  const rm = ratios.length ? mean(ratios) : null;
  const sd = ratios.length > 1 && rm !== null ? Math.sqrt(mean(ratios.map((x) => (x - rm) ** 2))) : null;
  return {
    ratioMean: rm,
    ratioSd: sd,
    fastMedian: mean(runs.map((r) => r.cohorts[0].medianWaitS ?? 0)),
    normalMedian: mean(runs.map((r) => r.cohorts[1].medianWaitS ?? 0)),
    fastAdmit: mean(runs.map((r) => r.cohorts[0].admittedWithin60s)),
    normalAdmit: mean(runs.map((r) => r.cohorts[1].admittedWithin60s)),
    jain: mean(runs.map((r) => r.jain)),
  };
}

/** PRNG seeded from a hex digest (FairGate: seed = HMAC/sha256(windowId, QUEUE_SECRET)). */
export function rngFromHex(hex: string) {
  return mulberry32(parseInt(hex.slice(0, 8), 16));
}
