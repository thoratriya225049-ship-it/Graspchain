import Link from "next/link";
import type { ComponentProps } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "signal" | "danger" | "light";
type Size = "sm" | "md" | "lg";

/** One primary per screen: solid Teal, white text (5.66:1). Secondary is outlined in Teal. No gradients on buttons. */
const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[var(--ease-water)] active:translate-y-px disabled:opacity-45 disabled:active:translate-y-0";
const variants: Record<Variant, string> = {
  primary: "bg-teal text-white hover:bg-[#0e5f75] rounded-[14px] shadow-[0_10px_24px_-14px_rgb(18_112_138/0.6)]",
  signal: "bg-teal text-white hover:bg-[#0e5f75] rounded-[14px]",
  secondary: "border border-teal text-teal hover:bg-mint rounded-[14px] [.on-abyss_&]:border-aqua/70 [.on-abyss_&]:text-aqua [.on-abyss_&]:hover:bg-abyss-2",
  light: "bg-on-dark text-abyss hover:bg-white rounded-[14px]",
  quiet: "text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal [.on-abyss_&]:text-aqua [.on-abyss_&]:decoration-aqua/40",
  danger: "border border-bad-mark text-bad hover:bg-bad-wash rounded-[14px]",
  // Below secondary: a hairline in Ink, for side routes next to a primary (works on Paper and Mint).
  ghost: "border border-rule-strong text-ink-2 hover:border-ink/35 hover:bg-paper-raised hover:text-ink rounded-[14px]",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-[12px]",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-13 px-7 text-base rounded-[16px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${variant === "quiet" ? "h-auto px-0" : sizes[size]} ${extra}`;
}

function Busy() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-current" style={{ animation: `ticker 1s ${i * 160}ms var(--ease-in-out) infinite` }} />
      ))}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconAfter,
  busy,
  busyLabel = "Working…",
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: IconName; iconAfter?: IconName; busy?: boolean; busyLabel?: string }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={buttonClass(variant, size, className)}>
      {busy ? <Busy /> : icon ? <Icon name={icon} size={size === "lg" ? 18 : 16} /> : null}
      <span>{busy ? busyLabel : children}</span>
      {iconAfter && !busy ? <Icon name={iconAfter} size={size === "lg" ? 18 : 16} /> : null}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  iconAfter,
  className = "",
  children,
  external,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; variant?: Variant; size?: Size; icon?: IconName; iconAfter?: IconName; external?: boolean }) {
  const cls = buttonClass(variant, size, className);
  if (external)
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {icon ? <Icon name={icon} /> : null}
        <span>{children}</span>
        <Icon name="external" size={14} />
      </a>
    );
  return (
    <Link href={href} className={cls} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
      {iconAfter ? <Icon name={iconAfter} /> : null}
    </Link>
  );
}
