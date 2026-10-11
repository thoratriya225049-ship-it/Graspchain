import type { Metadata } from "next";
import Link from "next/link";
import { requireMe } from "@/lib/api";
import { RatingDesk } from "../ResearchClient";

export const metadata: Metadata = { title: "Blind rating" };

/** Blind rating as its own calm mode: one answer at a time, no system score anywhere on the page. */
export default async function RatePage() {
  await requireMe(["teacher", "admin"], "/research/rate");
  return (
    <div className="frame pt-10 md:pt-14">
      <Link href="/research" className="link text-sm text-ink-3">
        ← Research
      </Link>
      <header className="mt-4 max-w-2xl">
        <p className="eyebrow">Blind rating</p>
        <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)]">Rate the answer, not the system.</h1>
        <p className="mt-3 text-[0.9375rem] text-ink-2">
          First attempts of consenting students, in an order shuffled per rater. You never see the system&rsquo;s score while rating.
        </p>
      </header>
      <RatingDesk />
    </div>
  );
}
