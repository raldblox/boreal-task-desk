"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

const MAX_TILT = 3; // degrees

/**
 * Tilts its child toward the pointer in 3D, with a soft glare that follows it. Mouse and pen only
 * (touch scrolls as usual), written straight to CSS variables so React doesn't re-render, and
 * still for people who ask for less motion.
 */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType === "touch" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * MAX_TILT * 2}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * MAX_TILT * 2}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
    el.dataset.tilting = "";
  }

  function leave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    delete el.dataset.tilting;
  }

  return (
    <div className={cn("[perspective:1100px]", className)} onPointerMove={move} onPointerLeave={leave}>
      <div
        ref={ref}
        className="group/tilt relative [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-transform duration-500 ease-out data-tilting:duration-100"
      >
        {children}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-data-tilting/tilt:opacity-100 [background:radial-gradient(420px_circle_at_var(--gx,50%)_var(--gy,50%),rgb(255_255_255/0.3),transparent_45%)] mix-blend-soft-light"
        />
      </div>
    </div>
  );
}
