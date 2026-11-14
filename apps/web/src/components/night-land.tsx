"use client";

import type { CSSProperties, ReactNode } from "react";

import { FAR_SHORE, FOREGROUND, H, MOUNTAINS, NEAR_SHORE, NEAR_STANDS, NEAR_TREES, RIDGE, RIDGE_BASE, SHORE_DRIFTS, SHORE_SCRUB, SNOW, W, Y_WATER } from "@/components/boreal-backdrop";
import { starField } from "@/components/night-stars";

/*
 * The night as an illustration (components/night-backdrop.tsx): the stars and the land, in SVG,
 * on the page from its first paint. A client component only so its long path data is sent once,
 * in the HTML, and not again in the RSC payload; the shapes are seeded, so server and client draw
 * the same.
 *
 * Depth. Four groups, far to near, drift apart as the page scrolls (globals.css: .bb-par): the
 * stars; everything across the lake (mountains, ridge, far shore, and with them the water's
 * images and the aurora, so the far waterline and what it mirrors never part); the near shore;
 * the foreground, which stays put.
 *
 * Atmospheric perspective: the farther a layer, the closer it sits to the colour of the sky behind
 * it (the air between scatters airglow and aurora light), and mist gathers in the valleys. Snow on
 * the mountains and the shores catches the aurora: the sky sets --aurora-light (0 to 1) from how
 * bright the display is, and a mint wash over the snow follows it.
 *
 * The lake is a mirror about the far waterline. The mountains, the ridge and the far shore are
 * mirrored here, dark against the water; the aurora's image is the shader's
 * (components/aurora-sky.tsx), so it shows in the water where it shows above the land.
 */

const lit = (k: number): CSSProperties => ({ opacity: `calc(var(--aurora-light, 0.35) * ${k})` });
const SNOW_LIGHT = "#a4f2cf";
const mirror = (about: number) => `matrix(1 0 0 -1 0 ${2 * about})`;

/** Where the horizon falls in the scene: the camera's level, just below the mountains' feet. */
const Y_HORIZON = 397;
const STARS = starField(W, H, Y_HORIZON);
// The home page looks up as it scrolls (components/aurora-sky.tsx): it needs the stars above the
// first frame too.
const STARS_ABOVE = starField(W, H, Y_HORIZON, -560);

/**
 * One depth of the scene. On most pages it slides down by `depth` of the scroll over the first
 * screen, so it seems that much farther (.bb-par). On the home page, where the camera looks up as
 * the page scrolls, it drops with the horizon instead (aurora-sky.tsx sets its translate to the
 * horizon's drop × `follow`), nearer layers a little faster, as if the camera also rose.
 */
function Layer({ depth, follow, children }: { depth: number; follow: number; children: ReactNode }) {
  return (
    <div className={`look absolute inset-0 ${depth ? "bb-par" : ""}`} style={{ "--d": depth, "--k": follow } as CSSProperties}>
      {children}
    </div>
  );
}

function Art({ children, overflow = false }: { children: ReactNode; overflow?: boolean }) {
  return (
    <div className="absolute -inset-x-10 inset-y-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="size-full" overflow={overflow ? "visible" : undefined}>
        {children}
      </svg>
    </div>
  );
}

/** `sky` is the aurora's canvas on the home page: behind the far land; it does its own looking up. */
export function NightLand({ id, sky }: { id: string; sky?: ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-0 h-[min(100%,100svh)]">
      <Layer depth={0.38} follow={0.9}>
        <Art overflow={!!sky}>
          {(sky ? STARS_ABOVE : STARS).map((group) => (
            <path key={`${group.opacity}${group.warm}`} d={group.d} fill={group.warm ? "#ffdcb8" : "#e6eefb"} opacity={group.opacity} />
          ))}
        </Art>
      </Layer>

      {sky}
      <Layer depth={0.18} follow={1}>
        <Art>
          <defs>
            <linearGradient id={`${id}-haze`} x1="0" y1="360" x2="0" y2={Y_WATER} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1d3a3e" stopOpacity="0" />
              <stop offset="1" stopColor="#1d3a3a" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`${id}-mist`} x1="0" y1="400" x2="0" y2={Y_WATER} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#0c1f23" />
              <stop offset="0.65" stopColor="#0f2528" />
              <stop offset="1" stopColor="#1a3535" />
            </linearGradient>
            <path id={`${id}-mountains`} d={MOUNTAINS} />
            <path id={`${id}-snow`} d={SNOW} />
            <path id={`${id}-shore`} d={FAR_SHORE} />
            <clipPath id={`${id}-water`}>
              <rect x={-60} y={Y_WATER} width={W + 120} height={H - Y_WATER} />
            </clipPath>
          </defs>

          {/* The far mountains, with snow above the treeline, and haze at their feet. */}
          <use href={`#${id}-mountains`} fill="#0f2328" />
          <use href={`#${id}-snow`} fill="#1f3639" />
          <use href={`#${id}-snow`} fill={SNOW_LIGHT} style={lit(0.28)} />
          <rect x={-60} y={360} width={W + 120} height={Y_WATER - 360} fill={`url(#${id}-haze)`} />

          {/* The forested ridge across the lake. */}
          <path d={RIDGE} fill={`url(#${id}-mist)`} />

          {/* Their images in the water, far to near. Ripples scatter some of the sky's light
              into the mountains' image, so it is not quite opaque. */}
          <g clipPath={`url(#${id}-water)`}>
            <g opacity={0.78}>
              <use href={`#${id}-mountains`} transform={mirror(Y_WATER)} fill="#0a191c" />
              <use href={`#${id}-snow`} transform={mirror(Y_WATER)} fill="#122528" />
            </g>
            <path d={RIDGE_BASE} transform={mirror(Y_WATER - 1)} fill="#0a1a1d" />
            <use href={`#${id}-shore`} transform={mirror(Y_WATER)} fill="#071416" />
          </g>

          {/* The far shore, at the waterline. */}
          <use href={`#${id}-shore`} fill="#081719" />
        </Art>
      </Layer>

      {/* The near shore: a snowy bank and spruce stands. */}
      <Layer depth={0.1} follow={1.12}>
        <Art>
          <path d={NEAR_SHORE} fill="#162a2e" />
          <path d={NEAR_SHORE} fill={SNOW_LIGHT} style={lit(0.16)} />
          <path d={SHORE_DRIFTS} fill="#0d1d20" />
          <path d={SHORE_SCRUB} fill="#081416" />
          <path d={NEAR_STANDS} fill="#040e10" />
        </Art>
      </Layer>

      {/* The foreground: tall spruces framing the view. */}
      <Layer depth={0} follow={1.3}>
        <Art>
          <path d={FOREGROUND} fill="#0f2023" />
          <path d={FOREGROUND} fill={SNOW_LIGHT} style={lit(0.1)} />
          <path d={NEAR_TREES} fill="#020a0c" />
        </Art>
      </Layer>
    </div>
  );
}
