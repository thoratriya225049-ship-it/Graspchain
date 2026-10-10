export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const score1 = (v: number) => v.toFixed(1);

export function shortHash(h: string, n = 8) {
  return h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-4)}` : h;
}

export function groupHash(h: string, size = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < h.length; i += size) out.push(h.slice(i, i + size));
  return out;
}

export function formatDateTime(iso: string | number) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(iso: string | number) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function relativeTime(iso: string | number, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export const DIMENSION_COPY = {
  coverage: {
    label: "Coverage",
    definition: "Share of the article's key ideas you explained, weighted by importance.",
  },
  correctness: {
    label: "Correctness",
    definition: "How many of your own claims the article supports.",
  },
  reasoning: {
    label: "Reasoning",
    definition: "Whether you explain why and how, not just what.",
  },
  ownWords: {
    label: "Own words",
    definition: "How little of your phrasing is copied from the article.",
  },
  accuracy: {
    label: "Accuracy",
    definition: "Overall factual accuracy of the summary against the article.",
  },
} as const;
