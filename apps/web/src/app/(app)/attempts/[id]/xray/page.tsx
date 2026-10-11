import type { Metadata } from "next";
import Link from "next/link";
import { JourneySteps, JourneyThread } from "@/components/fx/JourneyThread";
import { page, requireMe } from "@/lib/api";
import type { Result, XRay } from "@/lib/types";
import { XRayView } from "./XRayView";

export const metadata: Metadata = { title: "X-Ray" };

export default async function XRayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(undefined, `/attempts/${id}/xray`);
  const [x, result] = await Promise.all([
    page<XRay>(`/api/result/${id}/xray`, `/attempts/${id}/xray`),
    page<Result>(`/api/result/${id}`, `/attempts/${id}/xray`),
  ]);
  return (
    <section className="on-abyss isolate -mb-24 min-h-[calc(100dvh-4rem)] pb-24">
      <JourneyThread stage="decision" tone="dark" />
      <div className="frame pt-10 md:pt-14">
        <JourneySteps stage="decision" tone="dark" className="mb-8" />
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-aqua">
              X-Ray · <span className="mono normal-case tracking-normal">{x.articleId}</span>
            </p>
            <h1 className="display mt-3 max-w-3xl text-[clamp(1.75rem,3.5vw,2.75rem)] text-on-dark">{x.title}</h1>
          </div>
          <div className="flex items-center gap-6 text-[0.9375rem]">
            <Link href={`/attempts/${id}`} className="text-on-dark-2 underline decoration-white/25 underline-offset-4 hover:text-on-dark">
              ← Back to the result
            </Link>
            {me.role === "student" ? (
              <Link href={`/start/${x.articleId}`} className="font-medium text-aqua">
                Retry this article →
              </Link>
            ) : null}
          </div>
        </header>
        <XRayView x={x} evidence={result.score?.evidence ?? null} />
      </div>
    </section>
  );
}
