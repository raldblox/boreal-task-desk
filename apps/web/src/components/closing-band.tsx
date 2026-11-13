import { ArrowRight, Briefcase, Camera } from "lucide-react";
import Link from "next/link";

import { forest } from "@/components/boreal-backdrop";

const W = 1600;
const H = 560;

// The same spruces as the hero backdrop, at night: two rows along the band's bottom edge.
const BACK = forest(43, { base: 500, hMin: 40, hMax: 96, gap: 18 });
const FRONT = forest(57, { base: 575, hMin: 90, hMax: 210, gap: 34 });

// A few fixed stars, so server and client draw the same sky.
const STARS = [
  [120, 60, 1.6], [260, 130, 1.1], [410, 48, 1.3], [560, 110, 0.9], [720, 40, 1.5], [880, 140, 1], [1010, 70, 1.2],
  [1150, 35, 1.6], [1290, 120, 1], [1420, 58, 1.3], [1530, 150, 1], [340, 210, 0.8], [980, 220, 0.8], [1360, 230, 0.9],
] as const;

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

/** The home page's closing band: a night-time boreal scene with the two ways in, to earn or to hire. */
export function ClosingBand() {
  return (
    <div className="relative isolate overflow-hidden rounded-3xl bg-[#0c2a33] text-white">
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        className="pointer-events-none absolute inset-0 -z-10 size-full"
      >
        <defs>
          <linearGradient id="cb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a2330" />
            <stop offset="0.6" stopColor="#0f3a42" />
            <stop offset="1" stopColor="#14504f" />
          </linearGradient>
          <linearGradient id="cb-aurora-a" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5eead4" stopOpacity="0" />
            <stop offset="0.35" stopColor="#5eead4" stopOpacity="0.55" />
            <stop offset="0.7" stopColor="#86efac" stopOpacity="0.4" />
            <stop offset="1" stopColor="#86efac" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cb-aurora-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#67e8f9" stopOpacity="0" />
            <stop offset="0.5" stopColor="#67e8f9" stopOpacity="0.35" />
            <stop offset="1" stopColor="#5ac6bd" stopOpacity="0" />
          </linearGradient>
          <filter id="cb-blur" x="-200" y="-200" width={W + 400} height={H + 400} filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="28" />
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#cb-sky)" />
        {STARS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#ffffff" opacity="0.7" />
        ))}
        {/* Static on purpose: animating paths under an SVG blur re-blurs them every frame and makes scrolling stutter. */}
        <g filter="url(#cb-blur)">
          <path
            d="M-100 250 C 250 120, 520 330, 820 200 S 1350 90, 1700 230 L 1700 330 C 1350 200, 1100 360, 820 300 S 250 240, -100 360 Z"
            fill="url(#cb-aurora-a)"
          />
          <path
            d="M-100 170 C 300 260, 600 90, 950 170 S 1450 260, 1700 140 L 1700 210 C 1400 310, 1100 220, 900 250 S 300 330, -100 250 Z"
            fill="url(#cb-aurora-b)"
          />
        </g>
        <path d={BACK} fill="#0c3a3d" />
        <rect y={505} width={W} height={H - 505} fill="#0c3a3d" />
        <path d={FRONT} fill="#07242a" />
        <rect y={580} width={W} height={H} fill="#07242a" />
      </svg>

      <div className="grid gap-8 p-6 pb-28 sm:p-10 sm:pb-36 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-12 lg:p-12 lg:pb-40">
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
