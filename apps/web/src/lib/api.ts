import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Me, PublicConfig, Role } from "./types";

/** Server-side access to the Fastify API, forwarding the visitor's session cookie. */
const ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const jar = await cookies();
  let res: Response;
  try {
    res = await fetch(`${ORIGIN}${path}`, {
      ...init,
      cache: "no-store",
      headers: { ...(init.headers ?? {}), cookie: jar.toString(), accept: "application/json" },
    });
  } catch {
    throw new ApiError(503, "API_UNREACHABLE", "The Graspchain API is not reachable. Start it with `pnpm dev`.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, body.code ?? "ERROR", body.message ?? `Request failed (${res.status})`);
  return body;
}

/** Like `api`, but 401 → login, 404 → not-found page. */
export async function page<T>(path: string, next?: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export const getMe = cache(async (): Promise<Me | null> => {
  try {
    return (await api<{ user: Me }>("/api/auth/me")).user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

export function homeFor(role: Role) {
  return role === "student" ? "/home" : role === "teacher" ? "/teacher" : "/admin";
}

/** For pages: signed in, consented (students), and of an allowed role — or redirect. */
export async function requireMe(roles?: Role[], next?: string): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (me.needsConsent) redirect(`/consent${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (roles && !roles.includes(me.role)) redirect(homeFor(me.role));
  return me;
}

export const getConfig = cache(async (): Promise<PublicConfig | null> => {
  try {
    return await api<PublicConfig>("/api/config/public");
  } catch {
    return null;
  }
});
