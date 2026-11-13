import { AuroraSky } from "@/components/aurora-sky";
import { NightLand } from "@/components/night-land";

/*
 * The site's night: the rendered sky (components/aurora-sky.tsx, which also draws the lake) behind
 * the land in silhouette (components/night-land.tsx, shapes from components/boreal-backdrop.tsx),
 * under a scrim that keeps the words readable.
 *
 * Two uses:
 *   - live, in the home hero: the sky moves and the pointer stirs the aurora; the land's layers
 *     drift apart as the page scrolls (globals.css: .bb-par), the only parallax;
 *   - still, at the top of every other page (from the layout): the same sky, framed the same
 *     way, at the moment the live one last stopped (the shared clock in aurora-sky.tsx).
 */

export function NightBackdrop({ live = false, className = "" }: { live?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`night-root pointer-events-none absolute inset-x-0 -z-10 overflow-hidden ${className}`}>
      {/* The camera frames the first screen: the sky (and the lake) are drawn over exactly that. */}
      <AuroraSky live={live} className="absolute inset-x-0 top-0 h-[min(100%,100svh)]" />
      <NightLand live={live} id={live ? "night-live" : "night-still"} />
      {/* Over the sky and the land, under the words, so text stays readable over the brightest
          aurora and the snow it lights. */}
      <div className={`absolute inset-0 ${live ? "sky-scrim-hero" : "sky-scrim-page"}`} />
      {/* The land fills the first screen, as the camera does; a taller hero (phones) stands on the
          ground below it, drawn over the far layers as they slide down with the scroll. */}
      <div className="absolute inset-x-0 top-[min(100%,100svh)] bottom-0 bg-[#0f2023]" />
    </div>
  );
}
