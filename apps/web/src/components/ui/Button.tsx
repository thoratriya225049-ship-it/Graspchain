import Link from "next/link";
import type { ComponentProps } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "quiet" | "signal" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,color,border-color,transform] duration-150 ease-out active:translate-y-px disabled:opacity-45 disabled:active:translate-y-0";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 rounded-sm",
  signal: "bg-signal text-white hover:bg-signal-ink rounded-sm",
  secondary: "border border-ink/80 text-ink hover:bg-ink hover:text-paper rounded-sm",
  quiet: "text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink",
  danger: "border border-bad text-bad hover:bg-bad hover:text-white rounded-sm",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-[0.9375rem]",
  lg: "h-12 px-6 text-md",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${variant === "quiet" ? "h-auto px-0" : sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconAfter,
  busy,
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: IconName; iconAfter?: IconName; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={buttonClass(variant, size, className)}>
      {icon ? <Icon name={icon} size={size === "lg" ? 18 : 16} /> : null}
      <span>{busy ? "Working…" : children}</span>
      {iconAfter ? <Icon name={iconAfter} size={size === "lg" ? 18 : 16} /> : null}
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
