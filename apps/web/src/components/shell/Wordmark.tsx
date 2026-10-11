import Link from "next/link";

/** Two linked rounded squares: the reading (outline) and its committed proof (filled Teal / Aqua on Abyss). */
export function Mark({ size = 20, tone = "ink" }: { size?: number; tone?: "ink" | "paper" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="1.2" y="1.2" width="12" height="12" rx="3.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8.8" y="8.8" width="12" height="12" rx="3.6" fill={tone === "paper" ? "#6ACCC6" : "#12708A"} />
    </svg>
  );
}

export function Wordmark({ href = "/", tone = "ink" }: { href?: string; tone?: "ink" | "paper" }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 rounded-lg no-underline ${tone === "paper" ? "text-on-dark" : "text-ink"}`}
      aria-label="Graspchain home"
    >
      <Mark tone={tone} />
      <span className="font-serif text-[1.375rem] font-medium leading-none tracking-[-0.03em]">Graspchain</span>
    </Link>
  );
}
