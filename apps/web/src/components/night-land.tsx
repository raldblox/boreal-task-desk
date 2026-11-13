"use client";

import type { CSSProperties, ReactNode } from "react";

import { FAR_SHORE, FOREGROUND, H, MOUNTAINS, NEAR_SHORE, NEAR_STANDS, NEAR_TREES, RIDGE, RIDGE_BASE, SHORE_DRIFTS, SHORE_SCRUB, SNOW, W, Y_WATER } from "@/components/boreal-backdrop";

/*
 * The land in the night scene (components/night-backdrop.tsx), as layers from far to near. A client
 * component only so its long path data is sent once, in the HTML, and not again in the RSC payload;
 * the shapes are seeded, so server and client draw the same.
 *
 * Atmospheric perspective: the farther a layer, the closer it sits to the colour of the sky behind
 * it (the air between scatters airglow and aurora light), and mist gathers in the valleys. Snow on
 * the mountains and the shores catches the aurora: the sky sets --aurora-light (0 to 1) from how
 * bright the display is, and a mint wash over the snow follows it. The ridge and the far shore are
 * mirrored in the lake about their own waterline (the sky's reflection is the shader's). Seen from
 * the fell, the far mountains are a few degrees up, so their reflections fall a few degrees down,
 * behind the far shore: there are none to draw.
 */

const lit = (k: number): CSSProperties => ({ opacity: `calc(var(--aurora-light, 0.35) * ${k})` });
const SNOW_LIGHT = "#a4f2cf";

function layers(id: string): { depth: number; scroll: number; art: ReactNode }[] {
  return [
    {
      depth: 1,
      scroll: 0.32,
      art: (
        <>
          <defs>
            <linearGradient id={`${id}-haze`} x1="0" y1="360" x2="0" y2={Y_WATER} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1d3a3e" stopOpacity="0" />
              <stop offset="1" stopColor="#1d3a3a" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path d={MOUNTAINS} fill="#0f2328" />
          <path d={SNOW} fill="#1f3639" />
          <path d={SNOW} fill={SNOW_LIGHT} style={lit(0.28)} />
          <rect x={-60} y={360} width={W + 120} height={Y_WATER - 360} fill={`url(#${id}-haze)`} />
        </>
      ),
    },
    {
      depth: 2,
      scroll: 0.26,
      art: (
        <>
          <defs>
            <linearGradient id={`${id}-mist`} x1="0" y1="400" x2="0" y2={Y_WATER} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#0c1f23" />
              <stop offset="0.65" stopColor="#0f2528" />
              <stop offset="1" stopColor="#1a3535" />
            </linearGradient>
          </defs>
          <path d={RIDGE} fill={`url(#${id}-mist)`} />
        </>
      ),
    },
    {
      depth: 3,
      scroll: 0.18,
      art: (
        <>
          <defs>
            <path id={`${id}-shore`} d={FAR_SHORE} />
            <clipPath id={`${id}-water`}>
              <rect x={-60} y={Y_WATER} width={W + 120} height={H - Y_WATER} />
            </clipPath>
          </defs>
          {/* Reflections: each shape mirrored about the water at its own distance. (The far
              mountains, a few degrees up, reflect a few degrees down: behind the far shore.) */}
          <g clipPath={`url(#${id}-water)`} opacity={0.9}>
            <path d={RIDGE_BASE} transform={`matrix(1 0 0 -1 0 ${2 * (Y_WATER - 1)})`} fill="#0a1a1d" />
            <use href={`#${id}-shore`} transform={`matrix(1 0 0 -1 0 ${2 * Y_WATER})`} fill="#071416" />
          </g>
          <use href={`#${id}-shore`} fill="#081719" />
        </>
      ),
    },
    {
      depth: 4,
      scroll: 0.1,
      art: (
        <>
          <path d={NEAR_SHORE} fill="#162a2e" />
          <path d={NEAR_SHORE} fill={SNOW_LIGHT} style={lit(0.16)} />
          <path d={SHORE_DRIFTS} fill="#0d1d20" />
          <path d={SHORE_SCRUB} fill="#081416" />
          <path d={NEAR_STANDS} fill="#040e10" />
        </>
      ),
    },
    {
      depth: 5,
      scroll: 0,
      art: (
        <>
          <path d={FOREGROUND} fill="#0f2023" />
          <path d={FOREGROUND} fill={SNOW_LIGHT} style={lit(0.1)} />
          <path d={NEAR_TREES} fill="#020a0c" />
        </>
      ),
    },
  ];
}


export function NightLand({ live, id }: { live: boolean; id: string }) {
  return layers(id).map((layer) => (
    <div
      key={layer.depth}
      className={`absolute inset-x-0 top-0 h-[min(100%,100svh)] ${live ? "bb-par" : ""}`}
      style={live ? ({ "--d": layer.scroll } as CSSProperties) : undefined}
    >
      <div className="absolute -inset-x-10 inset-y-0">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="size-full">
          {layer.art}
        </svg>
      </div>
    </div>
  ));
}
