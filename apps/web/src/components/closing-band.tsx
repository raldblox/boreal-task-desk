import { ArrowRight, Briefcase, Camera } from "lucide-react";
import Link from "next/link";

const PATHS = [
  {
    href: "/tasks",
    icon: Camera,
    label: "Earn",
    title: "Find a task",
    body: "Photos, checks and visits, with the money held before you see them. Paid when your work passes.",
  },
  {
    href: "/post",
    icon: Briefcase,
    label: "Hire",
    title: "Post a task",
    body: "For you or your agent. Set the checks; a verified person does the work, and every result is held to them.",
  },
];

/**
 * The home page's closing words: the two ways in, to earn or to hire. They sit at the foot of the
 * page's last full screen (app/page.tsx, the finale), on the dark the aurora fades into, with no
 * box of their own, so the sky above them stays clear.
 */
export function ClosingBand() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-end lg:gap-12">
      <div className="flex flex-col gap-3">
        <h2 className="text-3xl font-light tracking-[-0.03em] md:text-4xl">Earn, or get it done.</h2>
        <p className="max-w-sm leading-relaxed text-foreground/80">
          Take a task and get paid when your work passes. Or post one, and its money is held until it does.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PATHS.map(({ href, icon: Icon, label, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-background/60 p-5 transition-colors hover:border-primary/40 hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-lg bg-primary-soft/10 text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="font-mono text-xs font-medium tracking-[0.18em] text-primary uppercase">{label}</span>
            </div>
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-lg font-medium">
                {title}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
