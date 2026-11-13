import Link from "next/link";

/**
 * The boreal.work mark: seven compass needles, the seven stars of the Plough that point travellers
 * north. Each needle is sharp at both ends, widest 40% below its north point, all the same length
 * (17.5 units). Their feet stand on a smooth w and their points repeat it higher up: grouped they
 * stand like spruce, and they hang like an aurora curtain. One tone. Rebalanced on the 32 grid so
 * it sits in the optical centre (box centre and mass centre averaged). See brand.md, "Logo".
 * Also in icon.svg, opengraph-image.tsx and apps/film/src/XProfile.tsx: keep the paths in sync.
 */
export const MARK_PATHS = {
  needles: [
    "M4.2 22.83L2.7 12.33L4.2 5.33L5.7 12.33Z",
    "M8.13 27.52L6.63 17.02L8.13 10.02L9.63 17.02Z",
    "M12.07 26.69L10.57 16.19L12.07 9.19L13.57 16.19Z",
    "M16 22.27L14.5 11.77L16 4.77L17.5 11.77Z",
    "M19.93 26.69L18.43 16.19L19.93 9.19L21.43 16.19Z",
    "M23.87 27.52L22.37 17.02L23.87 10.02L25.37 17.02Z",
    "M27.8 22.83L26.3 12.33L27.8 5.33L29.3 12.33Z",
  ],
} as const;

export function BorealMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path className="fill-primary" d={MARK_PATHS.needles.join("")} />
    </svg>
  );
}

/**
 * The eyebrow mark: one needle from the logo, laid on its side so it points at the label, the way
 * the work moves. Same proportions as the mark's needles (17.5 long, 3 wide, widest 7 from the point).
 * On arrival it slides out from its tail, once (globals.css: .needle-mark); still for less motion.
 */
export function NeedleMark({ className = "h-auto w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 17.5 3" className={`needle-mark ${className}`} aria-hidden="true">
      <path d="M0 1.5L10.5 0L17.5 1.5L10.5 3Z" fill="currentColor" />
    </svg>
  );
}

/** A bullet: the needle's north point alone, a short compass diamond. */
export function PointMark({ className = "h-2.5 w-1.25" }: { className?: string }) {
  return (
    <svg viewBox="0 0 4 8" className={className} aria-hidden="true">
      <path d="M2 8L0 3.2L2 0L4 3.2Z" className="fill-current" />
    </svg>
  );
}

export function BorealLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="boreal.work home">
      <BorealMark />
      <span>boreal.work</span>
    </Link>
  );
}

/** A small uppercase label above a heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 font-mono text-xs font-medium tracking-[0.18em] text-primary uppercase">
      <NeedleMark />
      {children}
    </p>
  );
}
