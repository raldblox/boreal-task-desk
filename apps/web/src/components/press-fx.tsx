"use client";

import { useEffect } from "react";

/**
 * Marks the moment a primary action is pressed, so its rays and arrow can play (globals.css:
 * .cta-win[data-won]). One listener for the whole site; the effect itself is CSS. Mouse, touch
 * and pen release, and Enter or Space on the keyboard; never on a disabled button.
 */
export function PressFx() {
  useEffect(() => {
    const win = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>(".cta-win") : null;
      if (!el || el.matches(":disabled, [aria-disabled='true']")) return;
      el.removeAttribute("data-won");
      void el.offsetWidth; // restart the animation when pressed again quickly
      el.setAttribute("data-won", "");
      window.setTimeout(() => el.removeAttribute("data-won"), 800);
    };
    const onUp = (e: PointerEvent) => win(e.target);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") win(e.target);
    };
    document.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
