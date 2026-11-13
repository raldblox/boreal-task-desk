"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/tasks", label: "Find tasks" },
  { href: "/post", label: "Post a task" },
  { href: "/agents", label: "For agents" },
];

/** The main nav links: a clear tint on hover, and the current section stays highlighted. */
export function NavLinks() {
  // The path is only known at request time: prerender the plain links, then mark the current one.
  return (
    <Suspense fallback={<Links pathname={null} />}>
      <CurrentLinks />
    </Suspense>
  );
}

function CurrentLinks() {
  return <Links pathname={usePathname()} />;
}

function Links({ pathname }: { pathname: string | null }) {
  return (
    <>
      {NAV.map((item) => {
        const current = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              current
                ? "bg-primary-soft text-primary-soft-foreground"
                : "text-muted-foreground hover:bg-primary-soft/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
