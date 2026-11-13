import { AuroraSky } from "@/components/aurora-sky";
import { FAR, H, MID, NEAR, RIDGE_FAR, RIDGE_NEAR, SNOW_CAPS, W } from "@/components/boreal-backdrop";

/*
 * The home hero's night: the rendered sky (components/aurora-sky.tsx) behind the same ridges and
 * spruce rows as the daylight backdrop, now in silhouette. Farther layers sit closer to the sky's
 * own colour (the air between scatters a little airglow), and the snow on the far ridge catches a
 * trace of the aurora's green. It reaches up behind the header, which goes dark over it.
 *
 * Moving the pointer moves the viewer's head a little: near trees shift the most, the ridges
 * barely, the sky and stars not at all, as real parallax does (globals.css: .depth-layer). The
 * scroll parallax is the daylight backdrop's (.bb-par).
 */

const LAYERS = [
  { d: RIDGE_FAR, fill: "#11292d", depth: 3, scroll: 0.32, extra: <path d={SNOW_CAPS} fill="#21443f" /> },
  { d: RIDGE_NEAR, fill: "#0c2124", depth: 7, scroll: 0.28 },
  { d: FAR, fill: "#091b1e", depth: 12, scroll: 0.18 },
  { d: MID, fill: "#061316", depth: 20, scroll: 0.12 },
  { d: NEAR, fill: "#020a0c", depth: 34, scroll: 0, extra: <rect x={-200} y={608} width={W + 400} height={40} fill="#020a0c" /> },
];

export function NightBackdrop() {
  return (
    <div
      aria-hidden
      className="night-root pointer-events-none absolute inset-x-0 bottom-0 -z-10 overflow-hidden"
    >
      <AuroraSky className="absolute inset-0" />
      {LAYERS.map((layer) => (
        <div key={layer.depth} className="bb-par absolute inset-x-0 top-0 h-[min(100%,100svh)]" style={{ "--d": layer.scroll } as React.CSSProperties}>
          <div className="depth-layer absolute -inset-x-10 inset-y-0" style={{ "--k": layer.depth } as React.CSSProperties}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="size-full">
              <path d={layer.d} fill={layer.fill} />
              {layer.extra}
            </svg>
          </div>
        </div>
      ))}
      {/* The land fills the first screen, as the camera does; a taller hero (phones) stands on the
          ground below it, drawn over the far layers as they slide down with the scroll. */}
      <div className="absolute inset-x-0 top-[min(100%,100svh)] bottom-0 bg-[#020a0c]" />
    </div>
  );
}
