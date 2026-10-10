import QRCode from "qrcode";
import { getConfig } from "@/lib/api";
import { verifierLink } from "@/lib/links";

/** Receipt QR (APP_FLOW §2.10): opens the independent verifier with the receipt URL. Rendered server-side as SVG. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad id", { status: 400 });
  const cfg = await getConfig();
  if (!cfg) return new Response("API unavailable", { status: 503 });
  const target = verifierLink(cfg.verifierUrl, cfg.publicWebUrl, id);
  const svg = await QRCode.toString(target, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#15171a", light: "#fbf9f4" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
}
