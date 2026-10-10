import type { Metadata } from "next";
import Link from "next/link";
import { page, requireMe } from "@/lib/api";
import type { XRay } from "@/lib/types";
import { XRayView } from "./XRayView";

export const metadata: Metadata = { title: "X-Ray" };

export default async function XRayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(undefined, `/attempts/${id}/xray`);
  const x = await page<XRay>(`/api/result/${id}/xray`, `/attempts/${id}/xray`);
  return (
    <div className="frame pt-10 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            X-Ray · <span className="mono normal-case tracking-normal">{x.articleId}</span>
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-xl leading-tight md:text-2xl">{x.title}</h1>
        </div>
        <div className="flex items-center gap-6 text-[0.9375rem]">
          <Link href={`/attempts/${id}`} className="link">
            ← Back to the result
          </Link>
          {me.role === "student" ? (
            <Link href={`/start/${x.articleId}`} className="font-medium">
              Retry this article →
            </Link>
          ) : null}
        </div>
      </header>
      <XRayView x={x} />
    </div>
  );
}
