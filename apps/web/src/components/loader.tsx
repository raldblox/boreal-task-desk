import { MARK_PATHS } from "@/components/brand";
import { cn } from "@/lib/utils";

/**
 * The loader: the mark itself, with light running along its seven needles from west to east, the
 * way brightness runs along an auroral arc. The needles never move, turn or part (brand.md, "Logo"):
 * only how much light each one holds changes. Still, at full ink, for people who ask for less
 * motion. Sized by className like BorealMark; `label` is read out and, unless `quiet`, shown.
 */
export function MarkLoader({
  className = "size-8",
  label = "Loading",
  quiet = false,
  tone = "primary",
}: {
  className?: string;
  label?: string;
  quiet?: boolean;
  /** `current` takes the text colour, for use on a filled button. */
  tone?: "primary" | "current";
}) {
  return (
    <span role="status" className="inline-flex items-center gap-3">
      <svg viewBox="0 0 32 32" className={cn("mark-loader shrink-0", className)} aria-hidden="true">
        {MARK_PATHS.needles.map((d, i) => (
          <path key={d} d={d} className={tone === "current" ? "fill-current" : "fill-primary"} style={{ "--n": i } as React.CSSProperties} />
        ))}
      </svg>
      {quiet ? <span className="sr-only">{label}</span> : <span className="text-sm whitespace-nowrap text-muted-foreground">{label}</span>}
    </span>
  );
}

/**
 * What a section shows while its data arrives: its own space kept (so nothing jumps when it lands),
 * a quiet card, and the mark loading in the middle.
 */
export function LoadingPanel({ className = "h-40", label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-2xl border border-dashed bg-card/40", className)}>
      <MarkLoader label={label} />
    </div>
  );
}

/** A small loader for a button that is working: sits before its "Posting…" label. */
export function ButtonLoader() {
  return <MarkLoader className="size-4" quiet label="Working" tone="current" />;
}
