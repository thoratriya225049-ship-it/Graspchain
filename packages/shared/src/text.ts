/** Text utilities used by the pipeline, the UI and the tests. All deterministic. */

export const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];

export const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

export const MIN_WORDS = 30;
export const MAX_WORDS = 300;

/** Reading time (PRD §9.1): clamp(ceil(words / 200 × 60 × 1.3), 60, 240) seconds. */
export function readSecondsForWords(n: number): number {
  return Math.min(240, Math.max(60, Math.ceil((n / 200) * 60 * 1.3)));
}

export interface Span {
  text: string;
  start: number;
  end: number;
}

/** Deterministic sentence splitter (the Stage 1 fallback). Spans index into the original text. */
export function splitSentences(text: string): Span[] {
  const out: Span[] = [];
  const re = /[^.!?\n]+(?:[.!?]+["'”’)]*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (!t) continue;
    const start = m.index + lead;
    out.push({ text: t, start, end: start + t.length });
  }
  return out;
}

/** Share of the answer's 5-grams that also appear in the source (PRD §9.2.7, own words). */
export function fiveGramOverlap(answer: string, source: string): number {
  const grams = (ws: string[]) => {
    const g: string[] = [];
    for (let i = 0; i + 5 <= ws.length; i++) g.push(ws.slice(i, i + 5).join(" "));
    return g;
  };
  const a = grams(words(answer));
  if (!a.length) return 0;
  const s = new Set(grams(words(source)));
  return a.filter((g) => s.has(g)).length / a.length;
}

/**
 * Whitespace/case-normalized view of a string with a map back to original offsets, so a
 * normalized match can be turned into an exact span of the original answer.
 */
export function normalizeWithMap(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (norm.length) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      norm += " ";
      map.push(i);
      pendingSpace = false;
    }
    // One output character per input character keeps `map` aligned (some lower-casings expand).
    const lc = ch.toLowerCase();
    norm += (lc.length === 1 ? lc : ch).replace(/[’‘`]/, "'").replace(/[“”]/, '"');
    map.push(i);
  }
  return { norm, map };
}

export const normalize = (s: string): string => normalizeWithMap(s).norm;
