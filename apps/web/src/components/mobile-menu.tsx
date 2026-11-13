"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { PointMark } from "@/components/brand";
import { NAV } from "@/components/nav-links";
import { cn } from "@/lib/utils";

const MORE = [
  { href: "/features", label: "Features" },
  { href: "/rules", label: "Rulebook" },
  { href: "/faq", label: "FAQ" },
];

/**
 * The phone menu: one button in the header that opens a panel under it, instead of a second row
 * of links on every page. Closes on navigation, on Escape and on a tap outside the links.
 */
export function MobileMenu() {
  const pathname = usePathname();
  // Open on the page it was opened on: navigating anywhere closes it, with no effect needed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((was: boolean) => boolean)) =>
    setOpenOn((prev) => ((typeof next === "function" ? next(prev === pathname) : next) ? pathname : null));
  // The panel renders into <body>: the header's backdrop blur would otherwise make "fixed" mean
  // "fixed to the header", and the panel would neither cover the page nor reach the bottom.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-full border bg-background/60 text-foreground transition-colors hover:bg-primary-soft/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {mounted && createPortal(
      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 top-[var(--header-h,4rem)] bottom-0 z-40 bg-background/95 backdrop-blur-md"
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      >
        <nav aria-label="Main" className="mobile-menu-in flex flex-col px-5 pt-4 pb-10">
          {NAV.map((item) => {
            const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between border-b py-4 text-2xl font-light tracking-[-0.025em]",
                  current ? "text-primary" : "text-foreground",
                )}
              >
                {item.label}
                {current && <PointMark className="h-3 w-1.5 text-primary" />}
              </Link>
            );
          })}
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {MORE.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>,
      document.body,
      )}
    </div>
  );
}
