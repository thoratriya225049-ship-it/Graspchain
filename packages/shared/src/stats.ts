function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = Array(xs.length).fill(0) as number[];
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export function spearman(a: number[], b: number[]): number | null {
  return pearson(ranks(a), ranks(b));
}

export function mae(a: number[], b: number[]): number | null {
  if (!a.length) return null;
  return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
}

export function withinOne(a: number[], b: number[]): number | null {
  if (!a.length) return null;
  return a.filter((x, i) => Math.abs(x - b[i]) <= 1).length / a.length;
}

export function pearsonR(a: number[], b: number[]): number | null {
  return pearson(a, b);
}

/** Quadratic weighted kappa over integer ratings in [min, max]. */
export function qwk(a: number[], b: number[], min = 1, max = 10): number | null {
  const n = a.length;
  if (n < 2) return null;
  const k = max - min + 1;
  const ra = a.map((x) => Math.min(max, Math.max(min, Math.round(x))) - min);
  const rb = b.map((x) => Math.min(max, Math.max(min, Math.round(x))) - min);
  const O = Array.from({ length: k }, () => Array(k).fill(0) as number[]);
  for (let i = 0; i < n; i++) O[ra[i]][rb[i]]++;
  const ha = Array(k).fill(0) as number[];
  const hb = Array(k).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    ha[ra[i]]++;
    hb[rb[i]]++;
  }
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      const w = (i - j) ** 2 / (k - 1) ** 2;
      num += w * O[i][j];
      den += w * ((ha[i] * hb[j]) / n);
    }
  return den === 0 ? null : 1 - num / den;
}

/** Percentile bootstrap CI for a paired statistic (deterministic for a seed). */
export function bootstrapCI(
  a: number[],
  b: number[],
  stat: (x: number[], y: number[]) => number | null,
  opts: { reps?: number; seed?: number; alpha?: number } = {},
): [number, number] | null {
  const n = a.length;
  if (n < 3) return null;
  const reps = opts.reps ?? 2000;
  let s = (opts.seed ?? 7) >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const vals: number[] = [];
  for (let r = 0; r < reps; r++) {
    const xa: number[] = [];
    const xb: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      xa.push(a[j]);
      xb.push(b[j]);
    }
    const v = stat(xa, xb);
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < reps / 2) return null;
  vals.sort((x, y) => x - y);
  const alpha = opts.alpha ?? 0.05;
  return [vals[Math.floor((alpha / 2) * vals.length)], vals[Math.min(vals.length - 1, Math.floor((1 - alpha / 2) * vals.length))]];
}
