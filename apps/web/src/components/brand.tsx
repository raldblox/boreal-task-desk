import Link from "next/link";

/** boreal's mark: three arcs, like the northern lights over a horizon. */
export function BorealMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M7 22c3-7 6-10 9-10s6 3 9 10" fill="none" strokeWidth="2.2" strokeLinecap="round" className="stroke-primary-foreground" />
      <path d="M10 22c2-4.5 4-6.5 6-6.5s4 2 6 6.5" fill="none" strokeWidth="2.2" strokeLinecap="round" className="stroke-primary-foreground/70" />
      <path d="M13 22c1-2 2-3 3-3s2 1 3 3" fill="none" strokeWidth="2.2" strokeLinecap="round" className="stroke-primary-foreground/45" />
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
    <p className="flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-primary uppercase">
      <span aria-hidden className="h-px w-6 bg-primary/60" />
      {children}
    </p>
  );
}
