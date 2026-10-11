import type { Metadata } from "next";
import { Shell } from "@/components/shell/Shell";
import { getConfig, getMe } from "@/lib/api";
import { Ceremony } from "./Ceremony";

export const metadata: Metadata = { title: "Verify a receipt" };

/** S9 entry: the verification ceremony — against Graspchain's copy, or independently in the browser. */
export default async function VerifyIndex() {
  const [me, config] = await Promise.all([getMe().catch(() => null), getConfig()]);
  return (
    <Shell me={me} bare>
      <Ceremony
        chain={
          config
            ? {
                rpcUrl: config.chain.publicRpcUrl,
                registry: config.chain.registry,
                chainId: config.chain.chainId,
                chainName: config.chain.name,
                verifierUrl: config.verifierUrl,
              }
            : null
        }
      />
    </Shell>
  );
}
