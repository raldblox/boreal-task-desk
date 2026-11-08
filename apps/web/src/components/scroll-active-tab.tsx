"use client";

import { useEffect, useRef } from "react";

/** Scrolls a horizontally scrolling tab bar so its current tab is in view (on phones the last tabs start off-screen). */
export function ScrollActiveTab({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav.current || !current) return;
    const left = current.offsetLeft - (nav.current.clientWidth - current.offsetWidth) / 2;
    nav.current.scrollTo({ left: Math.max(0, left) });
  });
  return (
    <nav ref={nav} aria-label={label} className={className}>
      {children}
    </nav>
  );
}
