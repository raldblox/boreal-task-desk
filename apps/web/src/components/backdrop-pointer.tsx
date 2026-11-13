"use client";

import { useEffect } from "react";

/**
 * Lets the sky answer the pointer: writes its position as --px and --py (0 to 1) on <html>, at
 * most once a frame, for the backdrops' pointer parallax (globals.css: .depth-layer).
 * Mouse and pen only, and nothing at all for people who ask for less motion.
 */
export function BackdropPointer() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;
    const root = document.documentElement;
    let frame = 0;
    let x = 0.5;
    let y = 0.3;
    const write = () => {
      frame = 0;
      root.style.setProperty("--px", x.toFixed(3));
      root.style.setProperty("--py", y.toFixed(3));
    };
    const move = (e: PointerEvent) => {
      x = e.clientX / window.innerWidth;
      y = e.clientY / window.innerHeight;
      if (!frame) frame = requestAnimationFrame(write);
    };
    root.dataset.pointer = "on";
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.pointer;
    };
  }, []);
  return null;
}
