import type { Metadata } from "next";
import { Shell } from "@/components/shell/Shell";
import { getConfig, getMe } from "@/lib/api";
import { Lookup } from "./Lookup";

export const metadata: Metadata = { title: "Verify a receipt" };

export default async function VerifyIndex() {
  const [me, config] = await Promise.all([getMe().catch(() => null), getConfig()]);
  return (
    <Shell me={me}>
      <div className="frame grid gap-16 pt-14 md:grid-cols-2 md:gap-24 md:pt-20">
        <section>
          <p className="eyebrow">Verify</p>
          <h1 className="mt-4 font-serif text-2xl md:text-3xl">Check that a result was never quietly changed.</h1>
          <p className="mt-4 max-w-md text-md text-ink-2">
            Every Graspchain result is a receipt whose hash is committed to a public registry. A receipt that verifies has not been altered since it was
            committed.
          </p>
          <div className="mt-10 max-w-md">
            <Lookup />
          </div>
        </section>
        <section className="md:border-l md:border-rule md:pl-12">
          <h2 className="eyebrow">Two ways to check</h2>
          <ol className="mt-4 border-t border-ink">
            <li className="border-b border-rule py-5">
              <h3 className="font-semibold">Here, against our copy</h3>
              <p className="mt-1 text-[0.9375rem] text-ink-2">
                Enter an assessment id. We recompute the hash of the copy we hold and ask the chain. This shows whether <em>our</em> copy still matches.
              </p>
            </li>
            <li className="border-b border-rule py-5">
              <h3 className="font-semibold">Independently, with your own file</h3>
              <p className="mt-1 text-[0.9375rem] text-ink-2">
                The static verifier is a single page that runs entirely in your browser: it hashes the receipt you give it and calls the registry over public
                RPC. It never contacts Graspchain&rsquo;s API.
              </p>
              {config ? (
                <a href={config.verifierUrl} target="_blank" rel="noreferrer" className="link mt-3 inline-block text-[0.9375rem]">
                  Open the independent verifier ↗
                </a>
              ) : null}
            </li>
          </ol>
        </section>
      </div>
    </Shell>
  );
}
