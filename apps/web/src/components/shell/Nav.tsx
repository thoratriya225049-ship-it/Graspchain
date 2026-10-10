"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Me } from "@/lib/types";
import { Icon } from "../ui/Icon";

const LINKS: Record<Me["role"], { href: string; label: string }[]> = {
  student: [
    { href: "/home", label: "Desk" },
    { href: "/library", label: "Library" },
    { href: "/progress", label: "Progress" },
    { href: "/verify", label: "Verify" },
  ],
  teacher: [
    { href: "/teacher", label: "Review" },
    { href: "/research", label: "Research" },
    { href: "/verify", label: "Verify" },
  ],
  admin: [
    { href: "/admin", label: "Integrity" },
    { href: "/teacher", label: "Review" },
    { href: "/research", label: "Research" },
    { href: "/verify", label: "Verify" },
  ],
};

export function Nav({ me }: { me: Me }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const links = LINKS[me.role];
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/home" && path.startsWith("/attempts"));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const list = (mobile: boolean) => (
    <ul className={mobile ? "flex flex-col" : "flex items-center gap-7"}>
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={active(l.href) ? "page" : undefined}
            className={
              mobile
                ? `block border-b border-rule py-3 font-serif text-xl ${active(l.href) ? "text-signal-ink" : "text-ink"}`
                : `relative py-5 text-[0.9375rem] no-underline transition-colors ${active(l.href) ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-signal" : "text-ink-3 hover:text-ink"}`
            }
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <nav aria-label="Main" className="hidden md:block">
        {list(false)}
      </nav>
      <div className="hidden items-center gap-4 md:flex">
        <span className="text-right leading-tight">
          <span className="mono block text-sm text-ink">{me.code}</span>
          <span className="block text-2xs uppercase tracking-[0.12em] text-ink-3">{me.role}</span>
        </span>
        <button onClick={signOut} className="text-sm text-ink-3 underline decoration-rule-strong underline-offset-4 hover:text-ink">
          Sign out
        </button>
      </div>
      <button className="md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? "close" : "menu"} size={22} />
        <span className="sr-only">Menu</span>
      </button>
      {open ? (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-full z-40 h-[100dvh] animate-fade border-t border-rule bg-paper px-[var(--gutter)] pt-2 md:hidden"
        >
          {list(true)}
          <div className="mt-6 flex items-center justify-between">
            <span className="mono text-sm">
              {me.code} · {me.role}
            </span>
            <button onClick={signOut} className="text-sm underline underline-offset-4">
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
