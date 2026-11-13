"use client";

import { useEffect } from "react";

/**
 * Opens the FAQ answer a link points at (/faq#when-paid) and brings it into view, on arrival and
 * whenever the hash changes, so a "Questions about this" link lands on an open answer.
 */
export function FaqHashOpener() {
  useEffect(() => {
    function open() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    }
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
