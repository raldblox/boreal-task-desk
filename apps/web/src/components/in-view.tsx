"use client";

import { createElement, useEffect, useRef } from "react";

/**
 * Marks its element with `data-inview` the first time it comes on screen, so CSS can present what's
 * inside (globals.css, "motion"). Once only: scrolling back doesn't replay it. The content is
 * server-rendered and visible without script; only the hidden starting state waits for this.
 */
export function InView({
  as = "div",
  className,
  style,
  children,
  threshold = 0.25,
}: {
  as?: "div" | "ol" | "ul" | "section";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  threshold?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.setAttribute("data-inview", "");
        io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return createElement(as, { ref, className, style, "data-present": "" }, children);
}
