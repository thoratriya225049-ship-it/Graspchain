import { Shell } from "@/components/shell/Shell";
import { requireMe } from "@/lib/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  return <Shell me={me}>{children}</Shell>;
}
