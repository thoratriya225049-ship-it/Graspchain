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
    { href: "/research/rate", label: "Blind rating" },
    { href: "/research", label: "Research" },
    { href: "/verify", label: "Verify" },
  ],
  admin: [
    { href: "/admin", label: "Admin" },
    { href: "/teacher", label: "Review" },
    { href: "/research", label: "Research" },
    { href: "/verify", label: "Verify" },
  ],
};

export function Nav({ me, system }: { me: Me; system?: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const links = LINKS[me.role];
  const active = (href: string) =>
    path === href ||
    (path.startsWith(`${href}/`) && !links.some((l) => l.href !== href && l.href.startsWith(href) && path.startsWith(l.href))) ||
    (href === "/home" && path.startsWith("/attempts"));

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <nav aria-label="Main" className="hidden md:block">
        <ul className="flex items-center gap-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active(l.href) ? "page" : undefined}
                className={`relative inline-flex h-9 items-center rounded-full px-3.5 text-[0.9375rem] no-underline transition-colors duration-200 ${
                  active(l.href) ? "bg-mint text-ink" : "text-ink-3 hover:bg-paper-sunk hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="hidden items-center gap-3 md:flex">
        {system}
        <span className="text-right leading-tight">
          <span className="mono block text-sm text-ink">{me.code}</span>
          <span className="block text-2xs uppercase tracking-[0.12em] text-ink-3">{me.role}</span>
        </span>
        <button onClick={signOut} className="rounded-full px-3 py-1.5 text-sm text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink">
          Sign out
        </button>
      </div>
      <div className="flex items-center gap-1 md:hidden">
        {system}
        <button className="rounded-full p-2 hover:bg-paper-sunk" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "close" : "menu"} size={22} />
          <span className="sr-only">Menu</span>
        </button>
      </div>
      {open ? (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-full z-40 h-[100dvh] animate-fade border-t border-rule bg-paper px-[var(--gutter)] pt-4 md:hidden"
        >
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active(l.href) ? "page" : undefined}
                  className={`block border-b border-rule py-4 font-serif text-2xl no-underline ${active(l.href) ? "text-teal" : "text-ink"}`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between">
            <span className="mono text-sm">
              {me.code} · {me.role}
            </span>
            <button onClick={signOut} className="text-sm text-teal underline underline-offset-4">
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
