import { AuroraSky } from "@/components/aurora-sky";
import { NightLand } from "@/components/night-land";

/*
 * The site's night: an illustration (components/night-land.tsx: the stars and the land in SVG,
 * over a CSS sky), under a scrim that keeps the words readable. It is on the page from the first
 * paint, and its depths drift apart as the page scrolls.
 *
 * Two uses:
 *   - at the top of every page (from the layout): the illustration alone;
 *   - live, in the home hero: the same illustration with the aurora added as a layer of light
 *     (components/aurora-sky.tsx) that comes up over a few seconds, shows in the lake and answers
 *     the pointer. The layout's steps aside on the home page (globals.css).
 */

export function NightBackdrop({ live = false, className = "" }: { live?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`night-root pointer-events-none absolute inset-x-0 -z-10 overflow-hidden ${className}`}>
      <NightLand id={live ? "night-live" : "night-still"} sky={live ? <AuroraSky live className="absolute inset-0" /> : undefined} />
      {/* Over the sky and the land, under the words, so text stays readable over the brightest
          aurora and the snow it lights. */}
      <div className={`absolute inset-0 ${live ? "sky-scrim-hero" : "sky-scrim-page"}`} />
      {/* The land fills the first screen; a taller hero (phones) stands on the ground below it. */}
      <div className="absolute inset-x-0 top-[min(100%,100svh)] bottom-0 bg-[#0f2023]" />
    </div>
  );
}
