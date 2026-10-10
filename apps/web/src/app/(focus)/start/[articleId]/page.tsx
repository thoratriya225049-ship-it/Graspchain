import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, getConfig, page } from "@/lib/api";
import type { ArticlesResponse, SessionView } from "@/lib/types";
import { Gate } from "./Gate";

export const metadata: Metadata = { title: "Before you read" };

export default async function StartPage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  const [{ articles }, config] = await Promise.all([page<ArticlesResponse>("/api/articles", `/start/${articleId}`), getConfig()]);
  const a = articles.find((x) => x.id === articleId);
  if (!a) notFound();
  const active = await api<{ session: SessionView | null }>("/api/session/active").then(
    (r) => r.session,
    () => null,
  );
  return <Gate article={a} capS={config?.fairclockCapS ?? 10} windowS={(config?.windowMs ?? 2000) / 1000} active={active} />;
}
