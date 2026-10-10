import type { Metadata } from "next";
import { getConfig, requireMe } from "@/lib/api";
import { AdminConsole } from "./AdminConsole";

export const metadata: Metadata = { title: "Integrity" };

export default async function AdminPage() {
  await requireMe(["admin"], "/admin");
  const config = await getConfig();
  return <AdminConsole demoTools={!!config?.adminDemoTools} />;
}
