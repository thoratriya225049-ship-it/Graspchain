import Link from "next/link";

/** Two linked squares: the reading (outline) and its committed proof (filled). */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="1.2" y="1.2" width="12" height="12" rx="1.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <rect x="8.8" y="8.8" width="12" height="12" rx="1.6" className="fill-signal" />
    </svg>
  );
}

export function Wordmark({ href = "/", tone = "ink" }: { href?: string; tone?: "ink" | "paper" }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 no-underline ${tone === "paper" ? "text-paper" : "text-ink"}`} aria-label="Graspchain home">
      <Mark />
      <span className="font-serif text-[1.375rem] font-semibold leading-none tracking-[-0.02em]">Graspchain</span>
    </Link>
  );
}
