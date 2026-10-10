import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getConfig, page } from "@/lib/api";
import type { SessionView } from "@/lib/types";
import { SessionFlow } from "./SessionFlow";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await page<SessionView>(`/api/session/${id}`, `/session/${id}`);
  if ((s.state === "EVALUATING" || s.state === "DONE") && s.attemptId) redirect(`/attempts/${s.attemptId}`);
  const config = await getConfig();
  return <SessionFlow sessionId={id} initial={s} demoTools={!!config?.adminDemoTools} minWords={config?.minWords ?? 30} maxWords={config?.maxWords ?? 300} />;
}
