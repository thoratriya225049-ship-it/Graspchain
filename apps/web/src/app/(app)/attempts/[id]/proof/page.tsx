import type { Metadata } from "next";
import { getConfig, page, requireMe } from "@/lib/api";
import type { Result } from "@/lib/types";
import { ProofView } from "./ProofView";

export const metadata: Metadata = { title: "Proof" };

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(undefined, `/attempts/${id}/proof`);
  const [result, config] = await Promise.all([page<Result>(`/api/result/${id}`, `/attempts/${id}/proof`), getConfig()]);
  return (
    <ProofView
      initial={result}
      viewer={me.role}
      verifierUrl={config?.verifierUrl ?? "http://localhost:5174/"}
      publicWebUrl={config?.publicWebUrl ?? "http://localhost:3000"}
      explorerUrl={config?.chain.explorerUrl ?? null}
      chainName={config?.chain.name ?? "the chain"}
    />
  );
}
