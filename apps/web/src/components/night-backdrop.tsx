import { AuroraSky } from "@/components/aurora-sky";
import { BackdropPointer } from "@/components/backdrop-pointer";
import { FAR, H, MID, NEAR, RIDGE_FAR, RIDGE_NEAR, SNOW_CAPS, W } from "@/components/boreal-backdrop";

/*
 * The site's night: the rendered sky (components/aurora-sky.tsx) behind ridges and spruce rows in
 * silhouette. Farther layers sit closer to the sky's own colour (the air between scatters a little
 * airglow), and the snow on the far ridge catches a trace of the aurora's green.
 *
 * Two uses:
 *   - live, in the home hero: the sky moves, and the pointer moves the viewer's head a little
 *     (near trees shift the most, the ridges barely, the sky not at all, as real parallax does;
 *     globals.css: .depth-layer), and the layers drift apart as the page scrolls (.bb-par);
 *   - still, at the top of every other page (from the layout): one frame of the same sky, no
 *     motion, fading into the page.
 */

const LAYERS = [
  { d: RIDGE_FAR, fill: "#11292d", depth: 3, scroll: 0.32, extra: <path d={SNOW_CAPS} fill="#21443f" /> },
  { d: RIDGE_NEAR, fill: "#0c2124", depth: 7, scroll: 0.28 },
  { d: FAR, fill: "#091b1e", depth: 12, scroll: 0.18 },
  { d: MID, fill: "#061316", depth: 20, scroll: 0.12 },
  { d: NEAR, fill: "#020a0c", depth: 34, scroll: 0, extra: <rect x={-200} y={608} width={W + 400} height={40} fill="#020a0c" /> },
];

export function NightBackdrop({ live = false, className = "" }: { live?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`night-root pointer-events-none absolute inset-x-0 -z-10 overflow-hidden ${className}`}>
      <AuroraSky live={live} className="absolute inset-0" />
      {/* Between the sky and the words, so text stays readable over the brightest aurora. */}
      <div className={`absolute inset-0 ${live ? "sky-scrim-hero" : "sky-scrim-page"}`} />
      {live && <BackdropPointer />}
      {LAYERS.map((layer) => {
        const land = (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="size-full">
            <path d={layer.d} fill={layer.fill} />
            {layer.extra}
          </svg>
        );
        return (
          <div
            key={layer.depth}
            className={`absolute inset-x-0 top-0 h-[min(100%,100svh)] ${live ? "bb-par" : ""}`}
            style={live ? ({ "--d": layer.scroll } as React.CSSProperties) : undefined}
          >
            {live ? (
              <div className="depth-layer absolute -inset-x-10 inset-y-0" style={{ "--k": layer.depth } as React.CSSProperties}>
                {land}
              </div>
            ) : (
              <div className="absolute -inset-x-10 inset-y-0">{land}</div>
            )}
          </div>
        );
      })}
      {/* The land fills the first screen, as the camera does; a taller hero (phones) stands on the
          ground below it, drawn over the far layers as they slide down with the scroll. */}
      <div className="absolute inset-x-0 top-[min(100%,100svh)] bottom-0 bg-[#020a0c]" />
    </div>
  );
}
