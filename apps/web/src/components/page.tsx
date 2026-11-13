import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";

import { BandMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The site's page kit: full-width bands, a wide container, large light headings, and one rule
// for everything you can press. Navigation is a whole tile or a "Title ›" row; an action is a
// solid button with an arrow chip. Status is only ever a small pill, never shaped like either.

/** The site's width: wide enough for dashboards, with generous gutters. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-12", className)}>{children}</div>;
}

/** A small label above a heading: the mark's person band, then the words. */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2.5 font-mono text-xs font-medium tracking-[0.18em] text-primary uppercase", className)}>
      <BandMark />
      {children}
    </p>
  );
}

/**
 * The top of a page: a full-width band with a large, light title. `aside` sits to the right on
 * wide screens (a summary, a number, a call to action); `children` runs under the title, still
 * inside the band (tabs, filters).
 */
export function PageHero({
  kicker,
  title,
  lede,
  actions,
  aside,
  children,
  size = "default",
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  /** `display` for landing pages: a larger title and more air. */
  size?: "default" | "display";
}) {
  return (
    <section>
      <Container className={cn("flex flex-col gap-8", size === "display" ? "py-16 md:py-28" : "pt-12 pb-10 md:pt-16 md:pb-12", children && "pb-0 md:pb-0")}>
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex max-w-3xl flex-col gap-5">
            {kicker && <Kicker>{kicker}</Kicker>}
            <h1
              className={cn(
                "font-light tracking-[-0.035em] text-balance",
                size === "display" ? "text-5xl leading-[1.02] sm:text-6xl lg:text-7xl" : "text-4xl leading-[1.05] sm:text-5xl",
              )}
            >
              {title}
            </h1>
            {lede && <div className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{lede}</div>}
            {actions && <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div>}
          </div>
          {aside && <div className="lg:justify-self-end">{aside}</div>}
        </div>
        {children}
      </Container>
    </section>
  );
}

/**
 * A full-width section with a heading row: the title on the left, an optional "View all ›" style
 * action on the right. `band` gives it the card surface, to alternate with the page background.
 */
export function Section({
  id,
  title,
  kicker,
  description,
  action,
  band = false,
  className,
  children,
}: {
  id?: string;
  title?: React.ReactNode;
  kicker?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  band?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", band && "border-y bg-card")}>
      <Container className={cn("flex flex-col gap-8 py-12 md:py-16", className)}>
        {(title || kicker || action) && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              {kicker && <Kicker>{kicker}</Kicker>}
              {title && <h2 className="text-3xl font-light tracking-[-0.03em] sm:text-4xl">{title}</h2>}
              {description && <p className="leading-relaxed text-muted-foreground">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}

/** The main action on a screen: a solid button with an arrow chip that moves on hover. */
export function Cta({
  href,
  children,
  variant = "default",
  external = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
  /** A full navigation (route handlers, other sites): a plain <a>. */
  external?: boolean;
  className?: string;
}) {
  const classes = cn(buttonVariants({ variant, size: "lg" }), "group gap-3 pr-2", className);
  const inner = (
    <>
      {children}
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-md transition-transform group-hover:translate-x-0.5",
          variant === "default" ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        <ArrowRight className="size-4" />
      </span>
    </>
  );
  return external ? (
    <a href={href} className={classes}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  );
}

/** A quiet text link that reads as navigation: words, then a chevron that slides on hover. */
export function MoreLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {children}
      <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/**
 * A whole tile that goes somewhere: the entire surface is the link, the title carries a chevron,
 * and hover lifts the border, so it never reads as a status.
 */
export function LinkTile({
  href,
  title,
  description,
  icon: Icon,
  meta,
  external = false,
  className,
}: {
  href: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Something on the right: a number, a count, a status pill. */
  meta?: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const classes = cn(
    "group flex items-start gap-4 rounded-2xl border bg-card p-6 transition-all hover:-translate-y-px hover:border-primary/50 hover:shadow-[0_8px_30px_-12px] hover:shadow-primary/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    className,
  );
  const inner = (
    <>
      {Icon && (
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 text-lg font-medium tracking-tight">
          {title}
          <ChevronRight className="size-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" aria-hidden />
        </span>
        {description && <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>}
      </span>
      {meta && <span className="shrink-0 self-center">{meta}</span>}
    </>
  );
  return external ? (
    <a href={href} className={classes} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  );
}

/** A panel: the plain surface for content that isn't a link. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border bg-card p-6 md:p-8", className)}>{children}</div>;
}

/** A large figure with its label: money, counts. */
export function Figure({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-4xl font-light tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The heading of a block inside a page (a tab's content, a group): light title, a line of help, an action on the right. */
export function BlockHeading({
  title,
  description,
  action,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <Tag className="text-2xl font-light tracking-[-0.025em]">{title}</Tag>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** An empty state that tells you what to do next, with the button to do it. */
export function EmptyState({ title, children, action }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed bg-card/60 p-8 md:p-10">
      <p className="text-xl font-light tracking-tight">{title}</p>
      {children && <div className="max-w-xl text-sm leading-relaxed text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}
