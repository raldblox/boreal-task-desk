import Link from "next/link";

/**
 * The boreal.work mark: two rockets moving forward in step. The top band is the AI agent (square head),
 * the bottom band is the person (a load and a round head, flying out ahead). Bodies light, heads solid.
 * Every gap is 1.75 units on the 32 grid; see brand.md, "Logo". Also in icon.svg, opengraph-image.tsx
 * and apps/film/src/XProfile.tsx: keep the paths in sync.
 */
export const MARK_PATHS = {
  topTail: "M2.44 3.5H14.44V15.125H2.44L8.25 9.31Z",
  topHead: "M16.19 3.5H22V15.125H16.19Z",
  botTail: "M2.44 16.875H14.44V28.5H2.44L8.25 22.69Z",
  botLoad: "M16.19 16.875H22V28.5H16.19Z",
  botHead: "M23.75 16.875A5.81 5.81 0 0 1 23.75 28.5Z",
} as const;

export function BorealMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g className="fill-primary">
        <path d={MARK_PATHS.topTail} opacity={0.45} />
        <path d={MARK_PATHS.topHead} />
        <path d={MARK_PATHS.botTail} opacity={0.45} />
        <path d={MARK_PATHS.botLoad} opacity={0.45} />
        <path d={MARK_PATHS.botHead} />
      </g>
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
