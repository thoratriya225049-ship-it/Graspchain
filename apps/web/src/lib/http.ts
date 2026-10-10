/** Browser-side calls to /api (same origin; Next rewrites to the API). */
export interface Reply<T> {
  ok: boolean;
  status: number;
  data: T;
  error: { code: string; message: string } | null;
}

export async function call<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Reply<T>> {
  const { json, ...rest } = init;
  try {
    const res = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const data = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : { code: data.code ?? "ERROR", message: data.message ?? `Request failed (${res.status}).` },
    };
  } catch {
    return { ok: false, status: 0, data: {} as T, error: { code: "OFFLINE", message: "Couldn't reach Graspchain. Check your connection and try again." } };
  }
}

export const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function store(kind: "session" | "local") {
  const get = (k: string): string | null => {
    try {
      return (kind === "session" ? sessionStorage : localStorage).getItem(k);
    } catch {
      return null;
    }
  };
  const set = (k: string, v: string | null) => {
    try {
      const s = kind === "session" ? sessionStorage : localStorage;
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    } catch {
      /* storage unavailable: degrade silently */
    }
  };
  return { get, set };
}
