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
 * The home page's closing band: the two ways in, to earn or to hire. By the time it is reached the
 * home page's night has looked all the way up (components/aurora-sky.tsx), so the band is a pane of
 * dark glass over the live aurora itself rather than a picture of one.
 */
export function ClosingBand() {
  return (
    <div className="relative isolate overflow-hidden rounded-3xl border border-white/12 bg-[#03141a]/55 text-white shadow-[0_0_0_1px_rgb(255_255_255/0.02)_inset]">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-12 lg:p-12">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-light tracking-[-0.03em] md:text-4xl">Earn, or get it done.</h2>
          <p className="max-w-sm leading-relaxed text-white/75">
            Take a task and get paid when your work passes. Or post one, and its money is held until it does.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PATHS.map(({ href, icon: Icon, label, title, body }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-2xl border border-white/15 bg-[#0e3640]/70 p-5 transition-colors hover:border-white/30 hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-lg bg-white/10 text-teal-200">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-xs font-medium tracking-wide text-teal-200 uppercase">{label}</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-2 text-lg font-medium">
                  {title}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </p>
                <p className="text-sm leading-relaxed text-white/70">{body}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
