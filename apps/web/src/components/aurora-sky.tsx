"use client";

import { useEffect, useRef } from "react";

import { OPENING_TIME, skyDrift, skyState } from "@/components/aurora-activity";
import { H as LAND_H, W as LAND_W, Y_LAKE_BOTTOM, Y_WATER } from "@/components/boreal-backdrop";
import { galaxy } from "@/components/night-stars";

/*
 * The aurora over the home hero, rendered from the physics rather than drawn, on one WebGL canvas.
 *
 * Geometry. The observer stands above a lake at 65° N, looking north, the camera pitched 10° up,
 * with the Earth's curvature included (R = 6371 km). Each auroral arc is a thin sheet of light
 * hanging along the magnetic field: its foot runs east-west at a northward distance that folds
 * and sways with time, and with altitude it leans back toward the observer along field lines
 * dipping at I = 77° (cot I ≈ 0.23). Rays are field-aligned too, so in perspective they converge
 * toward the magnetic zenith. A ray from the eye finds every place it crosses a sheet; each
 * crossing adds the sheet's column emission there, which grows where the line of sight runs along
 * the sheet (the bright edges of folds).
 *
 * Activity. How bright, rayed and folded the arcs are, where they lie, the westward travelling
 * surge, the hardness of the electrons, the red tops and the pulsating patches all come from a
 * substorm cycle (components/aurora-activity.ts): growth, onset and breakup, recovery.
 *
 * Emission. What a curtain looks like follows from where the electrons stop:
 *   - a bright ribbon along the lower border, near 100–125 km (lower when the electrons are
 *     harder), sharp underneath and fading over ten or twenty km above: O(¹S) 557.7 nm green,
 *     quenched by collisions below ~96 km;
 *   - a tall, faint veil above it, to 250 km and more, where the softer electrons stop. The rays
 *     live here: the ribbon is nearly even, the veil is striated;
 *   - under hard electrons, a pink hem just below the green (N₂ first positive and N₂⁺, prompt and
 *     never quenched);
 *   - above ~200 km on a strong night, O(¹D) 630.0 nm red, which takes 110 s to radiate: long
 *     enough to drift and blur, so the red has no rays.
 * Green trails the nitrogen light by oxygen's 0.7 s. The diffuse aurora and pulsating patches are
 * thin layers near 110 km, sampled once where the line of sight crosses them.
 *
 * Seeing it. The lines are given the colours a camera records (green as emerald, the hem magenta,
 * the tops crimson), dimmed by extinction through the air mass at their elevation, and exposed on
 * a film-like curve, so the brightest cores pale toward mint instead of clipping. With them: the
 * glow a bright display puts in the low air, and the Milky Way with its dust lanes.
 *
 * Drawing it. The canvas holds only light. The night itself (the sky's gradient, the stars, the
 * land and the lake) is the illustration behind and in front of it (components/night-land.tsx),
 * there from the page's first paint; the aurora then comes up over a few seconds, as it does.
 *   1. the aurora, at a fraction of the screen's pixels (the costly part; only the rows above the
 *      far waterline are drawn);
 *   2. that picture shrunk and blurred twice: the glow bright aurora has in air and in a lens;
 *   3. the screen: the aurora scaled up plus its glow; below the far waterline, the same picture
 *      mirrored about the waterline, rippled and dimmed: its image in the lake. Where there is
 *      no light the canvas is clear, so the stars show through faint aurora and drown in bright.
 */

const QUAD_VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const SKY_FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uF;
uniform float uPitch;
uniform float uTime;
uniform float uExposure;
uniform float uCy;
uniform vec2 uPointer;
uniform float uStir;
uniform vec3 uZ;
uniform vec3 uI;
uniform float uRays;
uniform float uFolds;
uniform vec2 uDrift;
uniform float uFoldT;
uniform vec2 uSurge;
uniform float uHard;
uniform float uRed;
uniform float uPulse;
uniform float uDiffuse;
uniform float uLight;
uniform float uRise;
uniform float uSteps;
uniform vec3 uGalN;
uniform vec3 uGalC;

const float RE = 6371.0;
const float COTI = 0.2309;
const int MAX_STEPS = 16;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Altitude at distance s along a ray of vertical component dy, on a spherical Earth.
float altAt(float s, float dy) { return sqrt(RE * RE + s * s + 2.0 * RE * s * dy) - RE; }
// Distance along that ray to the altitude h.
float distTo(float h, float dy) {
  float b = RE * dy;
  return -b + sqrt(b * b + (RE + h) * (RE + h) - RE * RE);
}
// Distance along the ray to where its field line's footprint lies c km north: the footprint is
// s*dz + h(s)*cot I, with h(s) to second order in s (qa, qb are that quadratic's coefficients).
float distToFoot(float c, float qa, float qb) { return c <= 0.0 ? 0.0 : 2.0 * c / (qb + sqrt(qb * qb + 4.0 * qa * c)); }

// Where the pointer is, as a bearing (tan of its azimuth), and how stirred the sky is (0 to 1).
float gBearing = 0.0;
float gStir = 0.0;
// How far each scale of fold has travelled (radians).
vec3 gFold = vec3(0.0);
// What the line of sight has gathered: the pink hem, oxygen green, oxygen red.
vec3 gL = vec3(0.0);

// An arc's foot: northward distance (km) as a function of eastward distance x. A long undulation
// and folds (hundreds of km down to ~150 km) travel along it and grow with activity; each smaller
// one bunches up on a flank of the larger, as shear-driven folds do, so they lean and overlap
// rather than ripple evenly. Curls (a few km) are left out of the shape: they are thinner than the
// sheet itself and far finer than the steps it is traced in, so near a fold's edge they only made
// the line of sight touch the sheet once or three times from one pixel to the next (a ragged,
// flickering thread). The westward travelling surge bulges it equatorward, with a
// steep western head and a long tail. Near the pointer's bearing it leans toward the viewer.
float arcFoot(float x, float Z, float ph, float t) {
  float F = uFolds;
  float s1 = sin(x * 0.0042 + ph + t * 0.011);
  float s2 = sin(x * 0.0125 - ph * 1.7 - gFold.x + 0.7 * s1);
  float s3 = sin(x * 0.039 + ph * 3.1 + gFold.y + 1.1 * s2);
  float v = (x - uSurge.x) / 55.0;
  v *= v < 0.0 ? 1.0 : 0.45;
  float surge = uSurge.y * 55.0 * exp(-v * v);
  float u = (x / Z - gBearing) / 0.25;
  float lean = gStir * 0.05 * Z * exp(-u * u);
  return Z + 60.0 * s1 + (12.0 + 26.0 * F) * s2 + (2.5 + 8.0 * F) * s3 - surge - lean;
}

// Striation along an arc at the drifted position d (km), about 1 on average: rays a few km across,
// each flickering on a scale of seconds. Rays too fine for the pixels at that distance (fine → 0)
// fade to their mean instead of shimmering.
float rays(float d, float t, float ph, float fine) {
  float n = 0.5 * noise(d / 6.5 + ph) + 0.32 * mix(0.5, noise(d / 2.6 + ph * 2.3), fine) + 0.18 * noise(d / 18.0 - t * 0.04);
  float r = pow(2.0 * n, 1.0 + 1.6 * uRays);
  float flicker = noise2(vec2(d / 3.2 + ph * 5.0, t * 1.4));
  return r * (1.0 + uRays * fine * (1.2 * flicker - 0.6));
}

// Chapman-like layer: a sharp bottom (scale lo), a lengthening tail above (scale hi growing with height).
float layer(float h, float hm, float lo, float hi) {
  float y = h < hm ? (h - hm) / lo : (h - hm) / (hi + 0.1 * (h - hm));
  return exp(1.0 - y - exp(-y));
}

// Kasten-Young air mass for an elevation (radians).
float airMass(float el) {
  float deg = max(degrees(el), 0.0);
  return 1.0 / (sin(max(el, 0.0)) + 0.50572 * pow(deg + 6.07995, -1.6364));
}

// The light of one arc's sheet where the line of sight d crosses it, s km away; w counts the
// crossings (2 where the line of sight grazes a fold's edge, touching the sheet twice at once).
void sheet(float s, vec3 d, float Z, float ph, float strength, float t, float w) {
  float h = altAt(s, d.y);
  float x = s * d.x;
  // Column emission through a sheet ~4 km thick, seen at this angle: brightest where the line of
  // sight runs along it (the edges of folds).
  float slope = (arcFoot(x + 1.5, Z, ph, t) - arcFoot(x - 1.5, Z, ph, t)) / 3.0;
  float col = 4.0 / max(abs(dot(normalize(vec3(-slope, COTI, 1.0)), d)), 0.25);
  float fine = clamp(2.0 - s / uF, 0.0, 1.0);
  float dr = x + uDrift.x;
  // Nitrogen answers the electrons at once; oxygen's green takes 0.7 s to radiate, so it trails
  // where the rays were.
  float rNow = rays(dr, t, ph, fine);
  float rLag = 0.45 * rNow + 0.55 * rays(dr - 0.7 * uDrift.y, t - 0.7, ph, fine);
  float stretch = 0.35 + 0.65 * smoothstep(0.2, 0.85, noise(x / 170.0 - t * 0.010 + ph * 5.0));
  float near = (x / Z - gBearing) / 0.25;
  float stir = gStir * exp(-near * near);
  float sv = (x - uSurge.x) / 70.0;
  float inSurge = uSurge.y * exp(-sv * sv);
  float lum = w * col * strength * stretch * (1.0 + 0.9 * stir + 0.8 * inSurge);
  // Above ~500 km the air is too thin for much light at all: everything fades out by 700 km.
  lum *= 1.0 - smoothstep(480.0, 690.0, h);
  // The electrons' energy sets the curtain's height. Hard (around 10 keV) stops near 100 km in a
  // bright, compact ribbon; soft (below 1 keV) stops high, feeding the veil and the red. It
  // varies along the arc and hardens with the substorm.
  float E = clamp(0.2 + 0.5 * noise(x / 130.0 + ph * 3.0 - t * 0.007) + 0.45 * uHard + 0.25 * inSurge, 0.0, 1.0);
  float hm = 124.0 - 28.0 * E + 5.0 * (noise(x / 40.0 + ph + t * 0.01) - 0.5);
  float lo = mix(5.0, 2.8, E);
  float quench = 1.0 / (1.0 + exp(-(h - 96.0) / 2.5));
  // The ribbon: nearly even along the arc.
  float ribbon = layer(h, hm, lo, mix(13.0, 7.0, E)) * (0.55 + 0.85 * E) * mix(1.0, rLag, 0.22 + 0.3 * uRays);
  // The veil: rays come in bundles tens of km long with quiet stretches between, each ray its
  // own height, neighbours a few km apart differing by half.
  float bundle = smoothstep(0.25, 0.8, noise(dr / 48.0 + ph * 9.0 - t * 0.02));
  float reachUp = (16.0 + 34.0 * uRays * bundle) * (0.4 + 1.1 * noise(dr / 11.0 + ph * 7.0));
  float veil = layer(h, hm + 14.0, 11.0, reachUp) * (0.07 + 0.13 * bundle) * (1.2 - 0.5 * E) * mix(1.0, rLag, 0.5 + 0.5 * uRays);
  gL.y += lum * (ribbon + veil) * quench;
  gL.x += lum * layer(h, hm - 2.5, lo * 0.8, 3.5) * (0.12 + 0.75 * E * E) * mix(1.0, rNow, 0.4);
  float red = layer(h, 275.0, 40.0, 60.0) / (1.0 + exp(-(h - 220.0) / 16.0));
  gL.z += lum * 0.13 * red * (0.06 + uRed) * (1.4 - E);
}

// The light a camera gathers looking along d (y up, z north), tracing each arc in n steps.
vec3 scene(vec3 d, float t, float n) {
  float dy = d.y;
  float el = asin(clamp(dy, -1.0, 1.0));
  float X = airMass(max(el, 0.0));
  gL = vec3(0.0);

  // Airglow: van Rhijn brightening toward the horizon, layer at 95 km, with faint gravity-wave
  // bands (~60 km apart, drifting ~60 m/s) across it. A bright display lights the low air too.
  float k = RE / (RE + 95.0);
  float vr = 1.0 / sqrt(max(1.0 - k * k * (1.0 - dy * dy), 0.02));
  float sg = distTo(95.0, max(dy, 0.0));
  vec2 gp = vec2(sg * d.x, sg * d.z);
  float band = sin(dot(gp, vec2(0.6, 0.8)) * 0.1 - t * 0.006) * smoothstep(0.35, 0.8, noise2(gp / 300.0 + 4.0)) * smoothstep(0.12, 0.5, dy);
  // All of it comes up with the aurora (uRise), so nothing lights before it does.
  vec3 sky = (vec3(0.0, 0.0022, 0.0012) * vr * max(band, 0.0) + uLight * vec3(0.0004, 0.0032, 0.0020) * (vr - 1.0)) * uRise;

  // The Milky Way: a band about the galactic plane, brighter toward the centre, split by dust.
  if (dy > 0.0) {
    float gb = dot(d, uGalN);
    vec3 e1 = normalize(uGalC - uGalN * dot(uGalC, uGalN));
    vec3 e2 = cross(uGalN, e1);
    float gl = atan(dot(d, e2), dot(d, e1));
    float dust = smoothstep(0.42, 0.72, noise2(vec2(gl * 7.0, gb * 26.0))) * exp(-pow(gb / 0.07, 2.0));
    float mw = exp(-pow(gb / 0.17, 2.0)) * (0.5 + 0.5 * cos(gl)) * (1.0 - 0.65 * dust) * (0.7 + 0.3 * noise2(vec2(gl * 18.0, gb * 45.0)));
    sky += vec3(0.017, 0.021, 0.026) * mw * exp(-0.25 * X) * uRise;
  }

  float qb = d.z + dy * COTI;
  if (dy > -0.02 && qb > 0.02) {
    // Diffuse aurora and pulsating patches: thin layers near 110 km, sampled where the ray crosses them.
    float sd = distTo(110.0, dy);
    float mu = (sd + RE * dy) / (RE + 110.0);
    float slant = 1.0 / max(mu, 0.06);
    float zf = sd * d.z + 110.0 * COTI;
    float xd = sd * d.x;
    // Near the horizon a pixel spans hundreds of km of the layer: fade its detail to its mean there.
    float detail = smoothstep(0.08, 0.3, mu);
    float diff = exp(-pow((zf - 420.0) / 300.0, 2.0)) * (0.55 + 0.45 * mix(0.5, noise2(vec2(xd, zf) / 140.0 + t * 0.003), detail));
    float glow = uDiffuse * diff * slant * 0.07;
    // Each arc is the bright core of a wider band of precipitation, tens of km across and wider
    // on its equatorward side: the soft glow a curtain hangs in.
    vec3 off = zf - vec3(arcFoot(xd, uZ.x, 0.0, t), arcFoot(xd, uZ.y, 2.1, t), arcFoot(xd, uZ.z, 4.4, t));
    vec3 wide = mix(vec3(34.0), vec3(70.0), step(off, vec3(0.0)));
    glow += dot(uI, exp(-(off * off) / (wide * wide))) * slant * 0.03;
    // Patches tens of km across, each blinking on and off with its own period of 3 to 15 s.
    vec2 pp = vec2(xd, zf) / 48.0;
    pp += 0.7 * (vec2(noise2(pp * 0.7 + 3.1), noise2(pp * 0.7 + 8.7)) - 0.5);
    vec2 cell = floor(pp);
    vec2 jit = (vec2(hash2(cell + 7.1), hash2(cell + 3.3)) - 0.5) * 0.25;
    float rad = 0.2 + 0.2 * hash2(cell + 1.9);
    float blob = smoothstep(rad, rad * 0.45, length(fract(pp) - 0.5 - jit)) * step(0.42, hash2(cell));
    float period = 3.0 + 12.0 * hash2(cell + 5.5);
    float on = smoothstep(-0.3, 0.5, sin(6.2832 * (t / period + hash2(cell + 9.2))));
    glow += uPulse * mix(0.12, blob * on, detail) * exp(-pow((zf - 230.0) / 170.0, 2.0)) * slant * 0.1;
    gL.y += glow;

    // The arcs. Each is traced only along the stretch of the ray whose field lines can reach it
    // (its foot never strays more than reach km from its mean), between 88 and 700 km up: high
    // enough that even the red tops of the tallest rays have faded out on their own (traced only
    // to 420 km, they were still a third as bright there and ended in a hard edge overhead).
    float qa = COTI * (1.0 - dy * dy) / (2.0 * RE);
    float sLo = distTo(88.0, dy);
    float sHi = min(distTo(700.0, dy), 2600.0);
    float reach = 105.0 + 40.0 * uFolds + 60.0 * uSurge.y + 40.0 * gStir;
    for (int a = 0; a < 3; a++) {
      float Z = a == 0 ? uZ.x : (a == 1 ? uZ.y : uZ.z);
      float ph = a == 0 ? 0.0 : (a == 1 ? 2.1 : 4.4);
      float strength = a == 0 ? uI.x : (a == 1 ? uI.y : uI.z);
      float sa = max(sLo, distToFoot(Z - reach, qa, qb));
      float sb = min(sHi, distToFoot(Z + reach, qa, qb));
      if (sb <= sa || strength < 0.01) continue;
      float ds = (sb - sa) / n;
      float fp = 0.0;
      float fpp = 0.0;
      for (int i = 0; i <= MAX_STEPS; i++) {
        if (float(i) > n) break;
        float s = sa + ds * float(i);
        float fc = s * d.z + altAt(s, dy) * COTI - arcFoot(s * d.x, Z, ph, t);
        if (i > 0 && fp * fc < 0.0) {
          // A crossing in this step: close in on it, keeping it bracketed, until it is within a
          // fraction of a km. Looking steeply up, height changes almost as fast as distance along
          // the line of sight, so a crossing found only roughly puts the curtain's sharp lower
          // border at the wrong height from one step to the next: a sawtooth of scallops.
          float lo = s - ds, hi = s, flo = fp, fhi = fc;
          float sx = lo + ds * fp / (fp - fc);
          for (int k = 0; k < 4; k++) {
            float fx = sx * d.z + altAt(sx, dy) * COTI - arcFoot(sx * d.x, Z, ph, t);
            if (fx * flo < 0.0) { hi = sx; fhi = fx; flo *= 0.5; } else { lo = sx; flo = fx; fhi *= 0.5; }
            sx = lo + (hi - lo) * flo / (flo - fhi);
          }
          sheet(sx, d, Z, ph, strength, t, 1.0);
        } else if (i > 1 && fpp * fp > 0.0 && abs(fp) < abs(fpp) && abs(fp) <= abs(fc)) {
          // The line of sight came close to the sheet and turned away within two steps: at a fold's
          // edge it can touch the sheet twice between samples, or pass within its thickness. Fit a
          // parabola through the three samples; where its turn reaches the sheet, light both touches
          // at the turn, fading out within a km or two as it clears (any wider, and near misses
          // along the lower border light up as lobes). Without this, neighbouring pixels see two
          // crossings or none, and the edge breaks into a ragged thread.
          float qa2 = 0.5 * (fpp + fc) - fp;
          float qb2 = 0.5 * (fc - fpp);
          float u = -qb2 / (2.0 * qa2);
          float fv = fp - 0.25 * qb2 * qb2 / qa2;
          float graze = fv * sign(fp) < 0.0 ? 1.0 : 1.0 - smoothstep(0.0, 1.5, abs(fv));
          if (qa2 * sign(fp) > 0.0 && abs(u) <= 1.0 && graze > 0.0) sheet(s - ds + u * ds, d, Z, ph, strength, t, 2.0 * graze);
        }
        fpp = fp;
        fp = fc;
      }
    }
  }

  // Extinction through the air mass, then each line in the colour a camera gives it, on a
  // film-like curve: the brightest cores pale toward mint rather than clip.
  vec3 L = gL * vec3(exp(-0.20 * X), exp(-0.14 * X), exp(-0.09 * X));
  vec3 light = (L.y * vec3(0.12, 1.0, 0.34) + L.x * vec3(1.0, 0.2, 0.55) + L.z * vec3(1.0, 0.06, 0.17)) * uExposure;
  return sky + 1.0 - exp(-light);
}

void main() {
  float t = uTime;
  float cp = cos(uPitch), sp = sin(uPitch);
  gFold = vec3(0.02, 0.05, 0.12) * t + vec3(0.05, 0.16, 0.4) * uFoldT;

  // The pointer, through the same lens.
  vec2 pc = uPointer - vec2(0.5 * uRes.x, uCy);
  vec3 pcam = normalize(vec3(pc.x, pc.y, uF));
  vec3 pd = vec3(pcam.x, pcam.y * cp + pcam.z * sp, -pcam.y * sp + pcam.z * cp);
  gBearing = pd.x / max(pd.z, 0.1);
  gStir = uStir;

  vec2 c = gl_FragCoord.xy - vec2(0.5 * uRes.x, uCy);
  vec3 cam = normalize(vec3(c.x, c.y, uF));
  vec3 d = vec3(cam.x, cam.y * cp + cam.z * sp, -cam.y * sp + cam.z * cp);
  // Only the light is drawn (the night is the page behind this canvas): how much brighter it
  // makes a sky of the night's own brightness, so faint light adds as gently as it does there.
  vec3 night = vec3(0.004, 0.011, 0.015);
  gl_FragColor = vec4(pow(night + scene(d, t, uSteps), vec3(1.0 / 2.2)) - pow(night, vec3(1.0 / 2.2)), 1.0);
}
`;

// Shrink a picture to a quarter of its size, averaging 4×4 of its pixels; uCut keeps only what is
// brighter than the night sky, so only the aurora glows.
const BLUR_FRAG = `
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec2 uSize;
uniform float uCut;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 c = texture2D(uSrc, uv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(uSrc, uv + uTexel * vec2(1.0, -1.0)).rgb
    + texture2D(uSrc, uv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(uSrc, uv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(max(c * 0.25 - uCut, 0.0), 1.0);
}
`;

// The screen: the aurora and its glow; below the far waterline, their image in the lake.
const SCREEN_FRAG = `
precision highp float;
uniform sampler2D uSky;
uniform sampler2D uGlow;
uniform sampler2D uHaze;
uniform vec2 uRes;
uniform vec2 uWater;
uniform float uTime;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 lit(vec2 q) {
  vec2 uv = q / uRes;
  return texture2D(uSky, uv).rgb + 0.4 * texture2D(uGlow, uv).rgb + 0.55 * texture2D(uHaze, uv).rgb;
}

void main() {
  vec2 p = gl_FragCoord.xy;
  vec3 col = vec3(0.0);
  if (p.y >= uWater.x) {
    col = lit(p);
  } else if (p.y >= uWater.y) {
    // The lake is a mirror: each point shows the sky as far above the waterline as it lies below
    // it. Water is never quite flat, so the image shivers along rows of ripples, finer toward the
    // far shore, and every light is drawn out toward the viewer. Seen this low, calm water
    // reflects most of the light.
    float depth = (uWater.x - p.y) / (uWater.x - uWater.y);
    vec2 w = p / uRes.y;
    float ripple = noise2(vec2(w.x * (30.0 - 16.0 * depth) + uTime * 0.05, w.y * (260.0 - 150.0 * depth) + uTime * 0.4)) - 0.5;
    float amp = uRes.y * (0.001 + 0.006 * depth);
    vec2 q = vec2(p.x + ripple * amp * 0.6, min(2.0 * uWater.x - p.y + ripple * amp * 2.0, uRes.y - 1.0));
    float smear = uRes.y * 0.007 * (0.4 + depth);
    col = (0.5 * lit(q) + 0.3 * lit(q - vec2(0.0, smear)) + 0.2 * lit(q - vec2(0.0, 2.0 * smear))) * mix(0.92, 0.72, depth);
  }
  // Light over the page's own night, premultiplied: the stars behind show through faint aurora
  // and drown in bright aurora, as they do.
  float a = clamp(max(col.r, max(col.g, col.b)) * 1.15, 0.0, 1.0);
  col = clamp(col + (hash2(p) - 0.5) / 255.0 * step(0.01, a), 0.0, a);
  gl_FragColor = vec4(col, a);
}
`;

/** Where the horizon (elevation 0) falls, as a fraction of the height from the top. */
const HORIZON = 0.62;

/**
 * Quality of the aurora's own picture, highest first: its width and pixel budget, and the steps
 * each arc is traced in. It is soft, so it renders at a fraction of the screen's pixels and is
 * scaled up; slow frames step down a level, fast ones step back up.
 */
const LEVELS = [
  { w: 1040, px: 620_000, steps: 14 },
  { w: 880, px: 450_000, steps: 13 },
  { w: 740, px: 320_000, steps: 12 },
  { w: 620, px: 220_000, steps: 11 },
  { w: 500, px: 150_000, steps: 10 },
  { w: 400, px: 100_000, steps: 8 },
];

/**
 * The lens: pitched 10° up on wide screens; on narrow ones a wider lens (at least 64° across),
 * tilted further up so the horizon stays at the same height on the screen.
 */
function camera(width: number, height: number) {
  const tall = ((HORIZON - 0.5) * height) / Math.tan((10 * Math.PI) / 180);
  const f = Math.min(tall, width / (2 * Math.tan((32 * Math.PI) / 180)));
  return { f, pitch: Math.atan(((HORIZON - 0.5) * height) / f) };
}

/**
 * Where an SVG height in the land (night-land.tsx) falls, in pixels up from the bottom of the
 * first screen: the land is drawn `xMidYMax slice` in a box 40 px wider than the screen each side.
 */
function landUp(ySvg: number, cssW: number, screenH: number) {
  const s = Math.max((cssW + 80) / LAND_W, screenH / LAND_H);
  return (LAND_H - ySvg) * s;
}

/*
 * One sky clock for the whole site, in seconds of aurora time. The live sky advances it while it
 * is on screen; the still sky on other pages draws the moment it stopped, so both show the same
 * aurora, and coming back home resumes from there. Kept in memory across client navigations and
 * in sessionStorage across reloads; a first visit opens during a breakup (OPENING_TIME).
 */
const SKY_KEY = "boreal-sky-time-v2";
const SKY_PAUSED = "boreal:sky-paused";
let skyClock: number | null = null;

function skyTime(): number {
  if (skyClock !== null) return skyClock;
  try {
    const saved = Number(sessionStorage.getItem(SKY_KEY));
    if (saved > 0) return (skyClock = saved);
  } catch {
    // Storage blocked: start fresh.
  }
  return (skyClock = OPENING_TIME);
}

function setSkyTime(t: number, persist: boolean) {
  skyClock = t;
  if (!persist) return;
  try {
    sessionStorage.setItem(SKY_KEY, t.toFixed(2));
  } catch {
    // Storage blocked: memory still carries it within this visit.
  }
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

/** Compile and start linking a program without waiting for it; `attribs` fixes attribute slots. */
function program(gl: WebGLRenderingContext, vert: string, frag: string, attribs: string[]) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
  }
  attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  return p;
}

function uniforms(gl: WebGLRenderingContext, p: WebGLProgram): Uniforms {
  const out: Uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i)!.name;
    out[name] = gl.getUniformLocation(p, name);
  }
  return out;
}

/** A texture to render into, with its framebuffer; `size` (re)allocates it. */
function target(gl: WebGLRenderingContext) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const t = {
    tex,
    fbo,
    w: 0,
    h: 0,
    size(w: number, h: number) {
      if (w === t.w && h === t.h) return;
      t.w = w;
      t.h = h;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    },
  };
  return t;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * How far up to look (radians, over the hero's pitch) at a scroll position: nothing over the hero,
 * then gradually more, until (by the closing band, before the footer comes up) the horizon sits a
 * fifth of the screen below its bottom edge, so even the mountain tops have left the frame.
 */
function lookTarget(p: number, cssW: number, screenH: number) {
  const c = camera(cssW, screenH);
  const end = Math.atan((0.72 * screenH) / c.f) - c.pitch;
  return end * smooth(0.05, 0.8, p);
}

/**
 * Run the aurora on a canvas that is on screen. Returns how to stop it. The shaders compile off
 * the main thread where the browser allows; until its first frame the canvas is clear, so the
 * page never waits on it.
 */
function runSky(canvas: HTMLCanvasElement, live: boolean) {
  const calm = !live || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) return () => {};
  const root = canvas.closest<HTMLElement>(".night-root");
  let dead = false;
  let stop = () => {};
  // How far down the page the reader is, 0 to 1.
  const scrolled = () => {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    return room > 1 ? Math.min(1, Math.max(0, window.scrollY / room)) : 0;
  };
  // The words over the night get a shade once the hero is behind them, lifted a little at the
  // page's end so the aurora shines around the closing band; the hero's own scrim fades as it goes.
  // How much of the page's last screen (the finale, app/page.tsx) is in view, 0 to 1.
  const finale = () => {
    const el = document.querySelector("[data-finale]");
    if (!el) return 0;
    return Math.min(1, Math.max(0, 1 - el.getBoundingClientRect().top / window.innerHeight));
  };
  let shaded = -1;
  const shade = (p: number, end: number) => {
    // Past the hero the words get an even shade; it clears as the finale comes up, whose own
    // gradient (globals.css, .finale-shade) shades only where its words are.
    const read = 0.72 * smooth(0.015, 0.09, p) * (1 - 0.94 * smooth(0.2, 0.95, end));
    if (!root || Math.abs(read - shaded) < 0.004) return;
    shaded = read;
    root.style.setProperty("--read", read.toFixed(3));
    root.style.setProperty("--hero-scrim", (1 - smooth(0.015, 0.09, p)).toFixed(3));
  };

  const programs = {
    sky: program(gl, QUAD_VERT, SKY_FRAG, ["p"]),
    blur: program(gl, QUAD_VERT, BLUR_FRAG, ["p"]),
    screen: program(gl, QUAD_VERT, SCREEN_FRAG, ["p"]),
  };
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  const all = Object.values(programs);
  const wait = () => {
    if (dead) return;
    if (parallel && !all.every((p) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) return void setTimeout(wait, 20);
    // If a shader fails on this GPU, the CSS night stays.
    const failed = all.find((p) => !gl.getProgramParameter(p, gl.LINK_STATUS));
    if (failed) console.warn("The night sky's shaders did not link:", gl.getProgramInfoLog(failed));
    else stop = start();
  };

  const start = () => {
    const uni = { sky: uniforms(gl, programs.sky), blur: uniforms(gl, programs.blur), screen: uniforms(gl, programs.screen) };
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const sky = target(gl);
    const glow = target(gl);
    const haze = target(gl);
    gl.clearColor(0, 0, 0, 0);

    // Phones and tablets start a step or two down; the live loop adjusts from there.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let level = calm ? 0 : coarse ? 2 : 0;
    let cssW = 0;
    let screenH = 0;
    let scale = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      screenH = Math.max(1, rect.height);
      // The screen itself only scales the aurora up and ripples the lake: 1.5 pixels per CSS pixel
      // is as sharp as that gets, within a budget of about 2 megapixels.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (cssW * screenH)));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(screenH * dpr);
      const q = LEVELS[level];
      scale = Math.min(dpr, q.w / cssW, Math.sqrt(q.px / (cssW * screenH)));
      sky.size(Math.max(2, Math.round(cssW * scale)), Math.max(2, Math.round(screenH * scale)));
      glow.size(Math.ceil(sky.w / 4), Math.ceil(sky.h / 4));
      haze.size(Math.ceil(glow.w / 4), Math.ceil(glow.h / 4));
    };

    // The pointer and how stirred the sky is; the live sky eases toward them.
    let pointerX = 0.5;
    let pointerY = 0.7;
    let targetX = 0.5;
    let targetY = 0.7;
    let stir = 0;

    const fullScreen = (p: WebGLProgram) => {
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    };
    const shrink = (from: ReturnType<typeof target>, to: ReturnType<typeof target>, cut: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.viewport(0, 0, to.w, to.h);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform2f(uni.blur.uTexel, 1 / from.w, 1 / from.h);
      gl.uniform2f(uni.blur.uSize, to.w, to.h);
      gl.uniform1f(uni.blur.uCut, cut);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    let lightShown = -1;
    let shown = false;
    // The aurora comes up over a few seconds from its first frame, as a real one does, and with it
    // everything it lights: the glow in the low air, the lake, the snow. The rise counts frames,
    // not the wall clock, at most 1/20 s each: a page busy hydrating can't make it leap ahead.
    let rise = calm ? 1 : 0;
    let lastNow = -1;
    // Looking up (live, on the home page): the night stays behind the whole page, and as it
    // scrolls the camera tilts up, so the land sinks out of the frame and the sky above comes into
    // it; by the page's end there is only the aurora. `look` is the extra pitch (radians); the
    // land follows through --look, the horizon's drop in CSS pixels, so the two never part.
    let look = 0;
    // The reward for reading to the end: as the page's last screen comes up, a substorm breaks out
    // overhead, as a real one does: the arcs sweep in and flash bright, break into rays and folds,
    // a surge runs west along them, the hem turns pink under the hardest electrons, the tallest
    // rays take on oxygen's red a few seconds later, and the arcs spread poleward. The camera tilts
    // a little further up toward the magnetic zenith, where the rays converge. It lets go slowly
    // on the way back up.
    // `reward` runs 0 to 1; what is drawn uses its eased value.
    let reward = 0;
    let breakAt = -1;
    const lookShift = (a: number) => {
      const c = camera(cssW, screenH);
      return c.f * (Math.tan(c.pitch + a) - Math.tan(c.pitch));
    };
    const draw = (t: number, now: number) => {
      if (!calm && lastNow >= 0) rise = Math.min(1, rise + Math.min(Math.max(now - lastNow, 0), 0.05) / 4.5);
      lastNow = now;
      const up = rise * rise * (3 - 2 * rise);
      const r = reward * reward * (3 - 2 * reward);
      const base = skyState(t);
      // The breakup's own clock, in sky seconds since it began: a flash within a few seconds that
      // overshoots and settles, arcs spreading poleward over half a minute, a surge running west
      // at 3 km/s, and oxygen's red coming in last, over about 8 s, as its slow light does.
      const since = breakAt >= 0 ? Math.max(0, t - breakAt) : 0;
      const flash = 1 - Math.exp(-since / 2.5);
      const burst = flash * (1 + 0.45 * Math.exp(-since / 9));
      const spread = 1 - Math.exp(-since / 30);
      const mix = (a: number, b: number) => a + (b - a) * r;
      const state =
        r > 0
          ? {
              ...base,
              arcZ: [mix(base.arcZ[0], 115 - 25 * flash + 45 * spread), mix(base.arcZ[1], 210 + 30 * spread), mix(base.arcZ[2], 330 + 60 * spread)] as [number, number, number],
              arcI: [mix(base.arcI[0], 2.5 * burst), mix(base.arcI[1], 1.6 * burst), mix(base.arcI[2], 1.05 * burst)] as [number, number, number],
              rays: mix(base.rays, 1),
              folds: mix(base.folds, 1),
              surgeX: mix(base.surgeX, 260 - 3 * since),
              surge: mix(base.surge, 0.9 * flash * Math.exp(-since / 45)),
              hard: mix(base.hard, 0.9 * flash * (1 - 0.3 * spread)),
              red: mix(base.red, 0.62 * (1 - Math.exp(-since / 8))),
              diffuse: mix(base.diffuse, 0.75),
              light: mix(base.light, Math.min(1, 0.85 * burst)),
            }
          : base;
      const drift = skyDrift(t);
      const g = galaxy(t);
      const W = canvas.width;
      const H = canvas.height;
      const drop = lookShift(look);
      const water = landUp(Y_WATER, cssW, screenH) - drop;
      const lakeBottom = landUp(Y_LAKE_BOTTOM, cssW, screenH) - drop;

      // 1. The aurora, small, above the far waterline only.
      const cam = camera(sky.w, sky.h);
      const u = uni.sky;
      fullScreen(programs.sky);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sky.fbo);
      gl.viewport(0, 0, sky.w, sky.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, Math.max(0, Math.floor(water * scale) - 2), sky.w, sky.h);
      gl.uniform2f(u.uRes, sky.w, sky.h);
      gl.uniform1f(u.uCy, sky.h / 2);
      gl.uniform1f(u.uF, cam.f);
      gl.uniform1f(u.uPitch, cam.pitch + look);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uExposure, 0.06 * up);
      gl.uniform1f(u.uRise, up);
      gl.uniform2f(u.uPointer, pointerX * sky.w, pointerY * sky.h);
      gl.uniform1f(u.uStir, stir);
      gl.uniform3f(u.uZ, ...state.arcZ);
      gl.uniform3f(u.uI, ...state.arcI);
      gl.uniform1f(u.uRays, state.rays);
      gl.uniform1f(u.uFolds, state.folds);
      gl.uniform2f(u.uDrift, drift.rayKm, drift.raySpeed);
      gl.uniform1f(u.uFoldT, drift.foldT);
      gl.uniform2f(u.uSurge, state.surgeX, state.surge);
      gl.uniform1f(u.uHard, state.hard);
      gl.uniform1f(u.uRed, state.red);
      gl.uniform1f(u.uPulse, state.pulse);
      gl.uniform1f(u.uDiffuse, state.diffuse);
      gl.uniform1f(u.uLight, state.light * up);
      gl.uniform1f(u.uSteps, LEVELS[level].steps);
      gl.uniform3f(u.uGalN, ...g.pole);
      gl.uniform3f(u.uGalC, ...g.centre);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);

      // 2. Its glow: the brighter light, blurred near and far.
      gl.useProgram(programs.blur);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uni.blur.uSrc, 0);
      shrink(sky, glow, 0.1);
      shrink(glow, haze, 0);

      // 3. The screen: aurora, glow, and the lake mirroring both.
      gl.useProgram(programs.screen);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      [sky, glow, haze].forEach((tx, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, tx.tex);
      });
      gl.uniform1i(uni.screen.uSky, 0);
      gl.uniform1i(uni.screen.uGlow, 1);
      gl.uniform1i(uni.screen.uHaze, 2);
      gl.uniform2f(uni.screen.uRes, W, H);
      gl.uniform2f(uni.screen.uWater, Math.max(water, -1) * dpr, Math.max(lakeBottom, -2) * dpr);
      gl.uniform1f(uni.screen.uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);

      if (!shown) {
        shown = true;
        canvas.dataset.ready = "1";
      }
      // The snow's share of the aurora's light, rising with it from the illustration's own 0.35.
      // A style change repaints the land, so only on a change the eye would notice; the browser
      // glides between values (globals.css: @property --aurora-light), so the steps don't show.
      const snow = 0.35 + (state.light - 0.35) * up;
      if (root && Math.abs(snow - lightShown) > 0.06) {
        lightShown = snow;
        root.style.setProperty("--aurora-light", snow.toFixed(2));
      }
    };

    resize();
    draw(skyTime(), calm ? 0 : performance.now() / 1000);

    // Still (less motion): the sky as it was when the live one last stopped. It doesn't look up
    // as the page scrolls, but the words over it still get their shade.
    if (calm) {
      const ro = new ResizeObserver(() => {
        resize();
        draw(skyTime(), 0);
      });
      ro.observe(canvas);
      const onPause = () => draw(skyTime(), 0);
      window.addEventListener(SKY_PAUSED, onPause);
      const onScroll = () => live && shade(scrolled(), finale());
      if (live) {
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
      }
      return () => {
        ro.disconnect();
        window.removeEventListener(SKY_PAUSED, onPause);
        window.removeEventListener("scroll", onScroll);
      };
    }

    // Live: the clock only runs while the sky is on screen, so leaving and coming back resumes it.
    let t = skyTime();
    const ro = new ResizeObserver(() => {
      resize();
      draw(t, performance.now() / 1000);
    });
    ro.observe(canvas);
    let visible = true;
    const pause = () => {
      setSkyTime(t, true);
      window.dispatchEvent(new Event(SKY_PAUSED));
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) pause();
    });
    io.observe(canvas);

    // The aurora answers the pointer: where it moves, the arcs brighten and lean toward the
    // viewer, then settle over a couple of seconds. Mouse and pen only, and only over the hero:
    // everywhere below it, where people read, the sky keeps to itself.
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (!(e.target instanceof Element) || !e.target.closest("[data-hero]")) return;
      const rect = canvas.getBoundingClientRect();
      if (e.clientY > rect.bottom || e.clientY < rect.top) return;
      const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const y = (rect.bottom - e.clientY) / Math.max(rect.height, 1);
      const now = performance.now();
      const speed = Math.hypot(x - targetX, y - targetY) / Math.max(now - lastMove, 8);
      lastMove = now;
      targetX = x;
      targetY = y;
      stir = Math.min(1, stir + Math.min(speed * 600, 2) * 0.11);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // Quality: every couple of seconds, time one frame through to the GPU's finish (a one-pixel
    // read waits for it). Over ~13 ms, a level down; under ~5 ms, a level up (a level costs about
    // 1.4× the one below, so that still leaves room). The median of three samples decides, so a
    // single hiccup (page load, a tab switch) doesn't.
    let pinned = false;
    const probe = new Uint8Array(4);
    const samples: number[] = [];
    let gpuMs = 0;
    const measure = (t: number, now: number) => {
      const begun = performance.now();
      draw(t, now);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
      samples.push(performance.now() - begun);
      if (samples.length < 3) return;
      gpuMs = [...samples].sort((a, b) => a - b)[1];
      samples.length = 0;
      const next = pinned ? level : gpuMs > 13 ? level + 1 : gpuMs < 5 ? level - 1 : level;
      if (next !== level && next >= 0 && next < LEVELS.length) {
        level = next;
        resize();
      }
    };

    let raf = 0;
    let last = 0;
    let frames = 0;
    let lookAt = -1;
    let lookShown = "";
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      // The look follows the scroll every frame, eased like a camera on a slow head, so the land
      // moves as smoothly as the page; the aurora redraws for it at its own 30 frames a second.
      const p = scrolled();
      // The reward builds over about 3.5 s once the page's end is reached, and fades over 7 s after.
      const tick = lookAt < 0 ? 0 : Math.min((now - lookAt) / 1000, 0.1);
      // It starts as soon as the finale is half way up the screen, so the sky above its words is
      // already lighting as it comes into view, and it builds over about 3 s.
      const end = finale();
      reward = Math.min(1, Math.max(0, reward + (end > 0.5 ? tick / 3 : -tick / 7)));
      if (reward > 0 && breakAt < 0) breakAt = t;
      if (reward === 0) breakAt = -1;
      const rw = reward * reward * (3 - 2 * reward);
      const base = lookTarget(p, cssW, screenH);
      const cam0 = camera(cssW, screenH);
      const want = base + rw * Math.max(0, Math.min(0.18, (56 * Math.PI) / 180 - cam0.pitch - base));
      const step = lookAt < 0 ? 1 : Math.min(1, (now - lookAt) / 1000 / 0.35);
      lookAt = now;
      look += (want - look) * step;
      if (Math.abs(want - look) < 1e-4) look = want;
      const px = lookShift(look).toFixed(1);
      if (root && px !== lookShown) {
        lookShown = px;
        root.style.setProperty("--look", `${px}px`);
      }
      shade(p, end);
      if (last && now - last < 30) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      frames++;
      t += dt;
      setSkyTime(t, false);
      // Ease toward the pointer; the stir dies away over a couple of seconds.
      pointerX += (targetX - pointerX) * Math.min(1, dt * 3);
      pointerY += (targetY - pointerY) * Math.min(1, dt * 3);
      stir *= Math.exp(-dt / 1.8);
      // Sample the GPU on frames 10, 20, 30, then every 50 (a second and a half).
      if (frames % (frames < 40 ? 10 : 50) === 0) measure(t, now / 1000);
      else draw(t, now / 1000);
    };
    raf = requestAnimationFrame(loop);
    const onHide = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onHide);
    // For measuring: the current quality and GPU time, and a way to pin a level.
    Object.assign(canvas, {
      skyStats: () => ({ level, gpuMs, dpr, screen: [canvas.width, canvas.height], aurora: [sky.w, sky.h], steps: LEVELS[level].steps }),
      skyLevel: (n: number | null) => {
        pinned = n !== null;
        if (n !== null) level = Math.max(0, Math.min(LEVELS.length - 1, n));
        resize();
        draw(t, performance.now() / 1000);
      },
    });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onHide);
      pause();
    };
  };

  wait();
  return () => {
    dead = true;
    stop();
  };
}

/**
 * The aurora and its image in the lake, over the home hero's first screen, as a layer of light
 * between the illustration's sky and its land (components/night-land.tsx). Up to 30 frames a
 * second while it's on screen and the tab is visible, at a quality that adapts to the device; it
 * answers the pointer. For people who ask for less motion: one frame, at the sky clock's moment.
 * Where WebGL isn't available, the illustration stands as it is. It also sets `--aurora-light`
 * (0–1) on its night root, which the snow in the land uses to catch the aurora's light.
 */
export function AuroraSky({ live = false, className = "" }: { live?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // While the live night is up, the page says so (globals.css: the footer lets it show through).
    // An effect, not a :has() rule: a home page Next keeps mounted but hidden runs no effects.
    const html = document.documentElement;
    if (live) html.setAttribute("data-night-live", "");
    let stop: (() => void) | null = null;
    const begin = () => {
      if (!stop && canvas.getBoundingClientRect().width > 1) stop = runSky(canvas, live);
    };
    const shown = new ResizeObserver(begin);
    shown.observe(canvas);
    begin();
    return () => {
      shown.disconnect();
      stop?.();
      if (live) html.removeAttribute("data-night-live");
    };
  }, [live]);

  return (
    <div className={className}>
      <canvas ref={ref} className="absolute inset-0 size-full" />
    </div>
  );
}
