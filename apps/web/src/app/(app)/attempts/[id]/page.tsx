import type { Metadata } from "next";
import { getConfig, page, requireMe } from "@/lib/api";
import type { Profile, Result } from "@/lib/types";
import { ResultView } from "./ResultView";

export const metadata: Metadata = { title: "Result" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(undefined, `/attempts/${id}`);
  const [result, config] = await Promise.all([page<Result>(`/api/result/${id}`, `/attempts/${id}`), getConfig()]);
  const profile = me.role === "student" ? await page<Profile>("/api/profile/me") : null;
  return (
    <ResultView
      initial={result}
      viewer={me.role}
      recommendation={profile?.recommendation ?? null}
      verifierUrl={config?.verifierUrl ?? "http://localhost:5174/"}
      publicWebUrl={config?.publicWebUrl ?? "http://localhost:3000"}
      explorerUrl={config?.chain.explorerUrl ?? null}
    />
  );
}
