"use client";

import { useEffect, useRef } from "react";

import { OPENING_TIME, skyState } from "@/components/aurora-activity";
import { H as LAND_H, W as LAND_W, Y_LAKE_BOTTOM, Y_WATER } from "@/components/boreal-backdrop";
import { catalog, drawStars, galaxy } from "@/components/night-stars";

/*
 * The home page's night sky, rendered from the physics rather than drawn.
 *
 * Geometry. The observer stands on a fell above a lake at 65° N, looking north, the camera pitched
 * 10° up, with the Earth's curvature included (R = 6371 km). Each auroral arc is a thin sheet of
 * light hanging along the magnetic field: its foot runs east-west at a northward distance that
 * folds, curls and sways with time, and with altitude it leans back toward the observer along field
 * lines dipping at I = 77° (cot I ≈ 0.23). Rays are field-aligned too, so in perspective they
 * converge toward the magnetic zenith. A ray from the eye finds every place it crosses a sheet;
 * each crossing adds the sheet's column emission there, which grows where the line of sight runs
 * along the sheet (the bright edges of folds).
 *
 * Activity. How bright, rayed and folded the arcs are, where they lie, the westward travelling
 * surge, the hardness of the electrons, the red tops and the pulsating patches all come from a
 * substorm cycle (components/aurora-activity.ts): growth, onset and breakup, recovery.
 *
 * Emission. Precipitating electrons deposit their energy in a Chapman-like layer with a sharp lower
 * border near 100–110 km (lower when the electrons are harder) and a long tail above it:
 *   - O(¹S) 557.7 nm green, the bulk of the light, quenched by collisions below ~96 km;
 *   - N₂⁺ 427.8 nm violet and the N₂ first positive bands (red, ~670 nm), prompt and never
 *     quenched, so when hard electrons push the border below 96 km a violet-pink hem shows under
 *     the green;
 *   - O(¹D) 630.0 nm red, only above ~200 km, where the atom lives long enough (110 s) to radiate;
 *     the eye only sees it on the tallest rays of a strong substorm.
 * The diffuse aurora and pulsating patches are thin layers near 110 km, sampled once where the
 * line of sight crosses them (so they brighten toward the horizon, like the airglow).
 *
 * Seeing it. Each line is converted with the CIE 1931 colour-matching functions, dimmed by
 * extinction through the air mass at its elevation (Rayleigh: blue loses most), then mixed with
 * what the rods see (scotopic V′), which is why faint aurora reads pale teal to the eye while
 * bright cores turn yellow-green. Behind it: airglow brighter toward the horizon (van Rhijn) with
 * faint gravity-wave bands, and the Milky Way with its dust lanes, placed by sidereal time.
 *
 * The lake. Below the far waterline, each pixel shows the sky mirrored in still water, scaled by the
 * Fresnel reflectance (most of the light at grazing angles, a few percent looking down), with a
 * slight ripple. The land in front (components/night-backdrop.tsx) is SVG; the lake band is placed
 * from the same framing so its waterline meets the far shore.
 *
 * Stars are drawn separately at full resolution and added on top, since aurora is optically thin.
 */

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
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
uniform vec2 uSurge;
uniform float uHard;
uniform float uRed;
uniform float uPulse;
uniform float uDiffuse;
uniform float uSteps;
uniform vec3 uGalN;
uniform vec3 uGalC;
uniform vec2 uWater;

const float RE = 6371.0;
const float COTI = 0.2309;
const int MAX_STEPS = 48;

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

// Where the pointer is, as a bearing (tan of its azimuth), and how stirred the sky is (0 to 1).
float gBearing = 0.0;
float gStir = 0.0;

// An arc's foot: northward distance (km) as a function of eastward distance x. Long undulations,
// folds (hundreds of km) and curls (tens of km) drift along it, growing with activity. The
// westward travelling surge bulges it equatorward, with a steep western head and a long tail;
// near the pointer's bearing it bulges as a local surge would.
float arcFoot(float x, float Z, float ph, float t, out float slope) {
  float F = uFolds;
  float a1 = x * 0.0042 + ph + t * 0.011;
  float a2 = x * 0.0125 - ph * 1.7 - t * (0.02 + 0.05 * F);
  float a3 = x * 0.039 + ph * 3.1 + t * (0.05 + 0.16 * F);
  float a4 = x * 0.105 - ph * 2.3 - t * (0.12 + 0.4 * F);
  float A2 = 12.0 + 26.0 * F;
  float A3 = 2.5 + 8.0 * F;
  float A4 = 0.4 + 2.8 * F;
  float u = (x / Z - gBearing) / 0.22;
  float bulge = gStir * 0.18 * Z * exp(-u * u);
  float v = (x - uSurge.x) / 55.0;
  float k = v < 0.0 ? 1.0 : 0.45;
  float sv = v * k;
  float surge = uSurge.y * 55.0 * exp(-sv * sv);
  slope = 60.0 * 0.0042 * cos(a1) + A2 * 0.0125 * cos(a2) + A3 * 0.039 * cos(a3) + A4 * 0.105 * cos(a4)
    + bulge * 2.0 * u / (0.22 * Z) + surge * 2.0 * sv * k / 55.0;
  return Z + 60.0 * sin(a1) + A2 * sin(a2) + A3 * sin(a3) + A4 * sin(a4) - bulge - surge;
}

// Brightness along an arc: rays a few km across drifting along it, each flickering on a scale of
// seconds, inside slower bright and dark stretches. A quiet arc is nearly homogeneous.
float rays(float u, float t, float ph) {
  float d = u + t * (1.2 + 2.2 * uRays);
  float r = 0.5 * noise(d / 6.5 + ph) + 0.32 * noise(d / 2.6 + ph * 2.3) + 0.18 * noise(d / 18.0 - t * 0.04);
  float k = 1.0 + 1.7 * uRays;
  r = 0.5 * pow(2.0 * r, k);
  float flicker = noise2(vec2(d / 3.2 + ph * 5.0, t * 1.4));
  r *= 1.0 + uRays * (1.5 * flicker - 0.75);
  float stretch = smoothstep(0.2, 0.85, noise(u / 170.0 - t * 0.010 + ph * 5.0));
  return r * (0.32 + 0.68 * stretch);
}

// Chapman-like layer: a sharp bottom (scale lo), a lengthening tail above (scale hi growing with height).
float layer(float h, float hm, float lo, float hi) {
  float y = h < hm ? (h - hm) / lo : (h - hm) / (hi + 0.16 * (h - hm));
  return exp(1.0 - y - exp(-y));
}

// Kasten-Young air mass for an elevation (radians).
float airMass(float el) {
  float deg = max(degrees(el), 0.0);
  return 1.0 / (sin(max(el, 0.0)) + 0.50572 * pow(deg + 6.07995, -1.6364));
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// What the eye sees looking along d (y up, z north), scaled by gain (the lake's reflectance).
vec3 scene(vec3 d, float gain, float t) {
  float dy = d.y;
  float el = asin(clamp(dy, -1.0, 1.0));
  float X = airMass(max(el, 0.0));

  // Airglow: van Rhijn brightening toward the horizon, layer at 95 km, with faint gravity-wave
  // bands (~60 km apart, drifting ~60 m/s) across it.
  float k = RE / (RE + 95.0);
  float vr = 1.0 / sqrt(max(1.0 - k * k * (1.0 - dy * dy), 0.02));
  float sg = distTo(95.0, max(dy, 0.0));
  vec2 gp = vec2(sg * d.x, sg * d.z);
  float band = sin(dot(gp, vec2(0.6, 0.8)) * 0.1 - t * 0.006) * smoothstep(0.35, 0.8, noise2(gp / 300.0 + 4.0)) * smoothstep(0.12, 0.5, dy);
  vec3 sky = vec3(0.0055, 0.0185, 0.0235) * (0.6 + 0.1 * vr) + vec3(0.0, 0.0022, 0.0012) * vr * band;

  // The Milky Way: a band about the galactic plane, brighter toward the centre, split by dust.
  if (dy > 0.0) {
    float gb = dot(d, uGalN);
    vec3 e1 = normalize(uGalC - uGalN * dot(uGalC, uGalN));
    vec3 e2 = cross(uGalN, e1);
    float gl = atan(dot(d, e2), dot(d, e1));
    float dust = smoothstep(0.42, 0.72, noise2(vec2(gl * 7.0, gb * 26.0))) * exp(-pow(gb / 0.07, 2.0));
    float mw = exp(-pow(gb / 0.17, 2.0)) * (0.5 + 0.5 * cos(gl)) * (1.0 - 0.65 * dust) * (0.7 + 0.3 * noise2(vec2(gl * 18.0, gb * 45.0)));
    sky += vec3(0.0085, 0.0105, 0.0125) * mw * exp(-0.25 * X);
  }

  float L428 = 0.0, L557 = 0.0, L630 = 0.0, L670 = 0.0;
  if (dy > -0.02) {
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
    // Patches tens of km across, each blinking on and off with its own period of 3 to 15 s.
    vec2 pp = vec2(xd, zf) / 48.0;
    pp += 0.7 * (vec2(noise2(pp * 0.7 + 3.1), noise2(pp * 0.7 + 8.7)) - 0.5);
    vec2 cell = floor(pp);
    vec2 off = (vec2(hash2(cell + 7.1), hash2(cell + 3.3)) - 0.5) * 0.25;
    float rad = 0.2 + 0.2 * hash2(cell + 1.9);
    float blob = smoothstep(rad, rad * 0.45, length(fract(pp) - 0.5 - off)) * step(0.42, hash2(cell));
    float period = 3.0 + 12.0 * hash2(cell + 5.5);
    float on = smoothstep(-0.3, 0.5, sin(6.2832 * (t / period + hash2(cell + 9.2))));
    glow += uPulse * mix(0.12, blob * on, detail) * exp(-pow((zf - 230.0) / 170.0, 2.0)) * slant * 0.1;
    L557 += glow;
    L428 += glow * 0.28;
    L670 += glow * 0.3;

    // The arcs.
    float s0 = distTo(86.0, dy);
    float s1 = min(distTo(430.0, dy), 2200.0);
    float ds = (s1 - s0) / uSteps;
    float pA = 0.0, pB = 0.0, pC = 0.0;
    for (int i = 0; i <= MAX_STEPS; i++) {
      if (float(i) > uSteps) break;
      float s = s0 + ds * float(i);
      float h = altAt(s, dy);
      float x = s * d.x;
      float zt = s * d.z + h * COTI; // the field line's footprint
      float slA, slB, slC;
      float fA = zt - arcFoot(x, uZ.x, 0.0, t, slA);
      float fB = zt - arcFoot(x, uZ.y, 2.1, t, slB);
      float fC = zt - arcFoot(x, uZ.z, 4.4, t, slC);
      if (i > 0) {
        for (int a = 0; a < 3; a++) {
          float fp = a == 0 ? pA : (a == 1 ? pB : pC);
          float fc = a == 0 ? fA : (a == 1 ? fB : fC);
          if (fp * fc < 0.0) {
            float sx = s - ds + ds * fp / (fp - fc);
            float hx = altAt(sx, dy);
            float xx = sx * d.x;
            float Z = a == 0 ? uZ.x : (a == 1 ? uZ.y : uZ.z);
            float ph = a == 0 ? 0.0 : (a == 1 ? 2.1 : 4.4);
            float strength = a == 0 ? uI.x : (a == 1 ? uI.y : uI.z);
            float sl;
            arcFoot(xx, Z, ph, t, sl);
            // Column emission through a sheet ~4 km thick, seen at this angle.
            vec3 n = normalize(vec3(-sl, COTI, 1.0));
            float col = 4.0 / max(abs(dot(n, d)), 0.25);
            float r = rays(xx, t, ph);
            float near = (xx / Z - gBearing) / 0.22;
            float stir = gStir * exp(-near * near);
            float sv = (xx - uSurge.x) / 70.0;
            float inSurge = uSurge.y * exp(-sv * sv);
            r *= 1.0 + 1.4 * stir + 0.8 * inSurge;
            float hm = 107.0 + 8.0 * noise(xx / 45.0 + ph + t * 0.01) + 6.0 * noise(xx / 160.0 - ph) - 12.0 * uHard - 8.0 * stir - 4.0 * inSurge;
            float tall = 0.6 + (0.8 + 1.0 * uRays) * clamp(r, 0.0, 1.5);
            float q = layer(hx, hm, 3.6, 6.0 * tall);
            float quench = 1.0 / (1.0 + exp(-(hx - 96.0) / 2.5));
            float n2 = layer(hx, hm - 1.0, 3.4, 5.0 * tall);
            float red = layer(hx, 235.0, 26.0, 40.0) / (1.0 + exp(-(hx - 205.0) / 18.0));
            float e = col * strength * r;
            L557 += e * q * quench;
            L428 += e * 0.33 * n2;
            L670 += e * 0.6 * n2;
            L630 += e * 0.1 * red * (0.25 + 2.6 * uRed) * (0.15 + smoothstep(0.5, 1.3, r));
          }
        }
      }
      pA = fA; pB = fB; pC = fC;
    }
  }

  // Extinction through the air mass (Rayleigh-dominated: violet loses the most).
  L428 *= exp(-0.30 * X); L557 *= exp(-0.14 * X); L630 *= exp(-0.09 * X); L670 *= exp(-0.08 * X);

  // CIE 1931 2° colour matching at each line, then XYZ to linear sRGB.
  vec3 XYZ = L428 * vec3(0.2535, 0.0097, 1.2346) + L557 * vec3(0.5566, 0.9973, 0.0047) + L630 * vec3(0.6424, 0.2650, 0.0) + L670 * vec3(0.0874, 0.0320, 0.0);
  mat3 toRGB = mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570);
  vec3 cone = toRGB * XYZ;
  // What the rods add (scotopic V′ at each line); they win where the light is faint.
  float rod = L428 * 0.177 + L557 * 0.364 + L630 * 0.0033 + L670 * 0.0006;
  float Y = XYZ.y * uExposure * gain;
  float w = 1.0 / (1.0 + Y / 0.35);
  vec3 seen = (cone * (1.0 - w) + vec3(0.34, 0.66, 0.74) * rod * 2.1 * w) * uExposure * gain;
  // Pure spectral green lies outside sRGB: pull it toward its own luminance until it fits.
  float lum = dot(seen, vec3(0.2126, 0.7152, 0.0722));
  float lo = min(seen.r, min(seen.g, seen.b));
  if (lo < 0.0) seen = lum + (seen - lum) * (lum / max(lum - lo, 1e-5));
  return sky * gain + aces(max(seen, 0.0));
}

void main() {
  float t = uTime;
  float cp = cos(uPitch), sp = sin(uPitch);

  // The pointer, through the same lens.
  vec2 pc = uPointer - vec2(0.5 * uRes.x, uCy);
  vec3 pcam = normalize(vec3(pc.x, pc.y, uF));
  vec3 pd = vec3(pcam.x, pcam.y * cp + pcam.z * sp, -pcam.y * sp + pcam.z * cp);
  gBearing = pd.x / max(pd.z, 0.1);
  gStir = uStir;

  vec2 c = gl_FragCoord.xy - vec2(0.5 * uRes.x, uCy);
  vec3 cam = normalize(vec3(c.x, c.y, uF));
  vec3 d = vec3(cam.x, cam.y * cp + cam.z * sp, -cam.y * sp + cam.z * cp);

  vec3 col;
  if (gl_FragCoord.y >= uWater.x) {
    col = scene(d, 1.0, t);
  } else if (gl_FragCoord.y >= uWater.y && d.y < 0.0) {
    // Still water: the sky mirrored, with a faint ripple that stretches reflections downward.
    float dep = -d.y;
    float rp = noise2(vec2(gl_FragCoord.x * 0.02, gl_FragCoord.y * 0.55 + t * 0.7)) - 0.5;
    vec3 r = normalize(vec3(d.x + rp * 0.006 * dep, dep + rp * 0.03 * dep, d.z));
    float fres = 0.02 + 0.98 * pow(1.0 - dep, 5.0);
    col = scene(r, fres, t) + vec3(0.002, 0.006, 0.007);
  } else {
    col = vec3(0.004, 0.012, 0.014);
  }
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Where the horizon (elevation 0) falls, as a fraction of the height from the top. */
const HORIZON = 0.62;

/**
 * Render quality, highest first. The sky is soft, so it renders at a fraction of the screen's
 * pixels and the browser scales it up; slow frames step down a level, fast ones step back up.
 */
const LEVELS = [
  { w: 760, px: 380_000, steps: 44 },
  { w: 640, px: 270_000, steps: 36 },
  { w: 540, px: 190_000, steps: 30 },
  { w: 440, px: 130_000, steps: 24 },
  { w: 360, px: 85_000, steps: 20 },
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
 * Where an SVG height in the land (night-backdrop.tsx) falls, in pixels up from the bottom of the
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

const UNIFORMS = ["uRes", "uF", "uPitch", "uTime", "uExposure", "uCy", "uPointer", "uStir", "uZ", "uI", "uRays", "uFolds", "uSurge", "uHard", "uRed", "uPulse", "uDiffuse", "uSteps", "uGalN", "uGalC", "uWater"];

/**
 * The night sky and its stars, over the first screen. Live (the home hero): up to 30 frames a
 * second while it's on screen and the tab is visible, at a quality that adapts to the device, and
 * the pointer stirs the aurora. Still (every other page), and for people who ask for less motion:
 * one frame, at the shared clock's moment. The CSS night gradient behind it stays when WebGL isn't
 * available. It also sets `--aurora-light` (0–1) on its night root, which the snow in the land
 * uses to catch the aurora's light.
 */
export function AuroraSky({ live = false, className = "" }: { live?: boolean; className?: string }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const starRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = glRef.current;
    const starCanvas = starRef.current;
    if (!canvas || !starCanvas) return;
    const calm = !live || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    const ctx = starCanvas.getContext("2d");
    const stars = catalog();
    const root = canvas.closest<HTMLElement>(".night-root");

    let program: WebGLProgram | null = null;
    const uni: Record<string, WebGLUniformLocation | null> = {};
    if (gl) {
      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vs = shader(gl.VERTEX_SHADER, VERT);
      const fs = shader(gl.FRAGMENT_SHADER, FRAG);
      if (vs && fs) {
        program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) program = null;
      }
      if (program) {
        gl.useProgram(program);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const name of UNIFORMS) uni[name] = gl.getUniformLocation(program, name);
        canvas.dataset.ready = "1";
      }
    }

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
      const q = LEVELS[level];
      scale = Math.min(1, q.w / cssW, Math.sqrt(q.px / (cssW * screenH)));
      canvas.width = Math.round(cssW * scale);
      canvas.height = Math.round(screenH * scale);
      dpr = Math.min(window.devicePixelRatio || 1, level >= 3 ? 1.5 : 2);
      starCanvas.width = Math.round(cssW * dpr);
      starCanvas.height = Math.round(screenH * dpr);
    };

    // Pointer and stir, in canvas pixels (GL's y runs up). The live sky eases toward them.
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let stir = 0;

    let lightShown = -1;
    const draw = (t: number, now: number) => {
      const state = skyState(t);
      if (gl && program) {
        const W = canvas.width;
        const Hh = canvas.height;
        gl.viewport(0, 0, W, Hh);
        const cam = camera(W, Hh);
        const g = galaxy(t);
        gl.uniform2f(uni.uRes, W, Hh);
        gl.uniform1f(uni.uCy, Hh / 2);
        gl.uniform1f(uni.uF, cam.f);
        gl.uniform1f(uni.uPitch, cam.pitch);
        gl.uniform1f(uni.uTime, t);
        gl.uniform1f(uni.uExposure, 0.13);
        gl.uniform2f(uni.uPointer, pointerX || W / 2, pointerY || Hh * 0.7);
        gl.uniform1f(uni.uStir, stir);
        gl.uniform3f(uni.uZ, ...state.arcZ);
        gl.uniform3f(uni.uI, ...state.arcI);
        gl.uniform1f(uni.uRays, state.rays);
        gl.uniform1f(uni.uFolds, state.folds);
        gl.uniform2f(uni.uSurge, state.surgeX, state.surge);
        gl.uniform1f(uni.uHard, state.hard);
        gl.uniform1f(uni.uRed, state.red);
        gl.uniform1f(uni.uPulse, state.pulse);
        gl.uniform1f(uni.uDiffuse, state.diffuse);
        gl.uniform1f(uni.uSteps, LEVELS[level].steps);
        gl.uniform3f(uni.uGalN, ...g.pole);
        gl.uniform3f(uni.uGalC, ...g.centre);
        gl.uniform2f(uni.uWater, landUp(Y_WATER, cssW, screenH) * scale, landUp(Y_LAKE_BOTTOM, cssW, screenH) * scale);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (ctx) {
        const w = starCanvas.width;
        const h = starCanvas.height;
        const cam = camera(w, h);
        drawStars(ctx, stars, w, h, { ...cam, cx: w / 2, cy: h / 2 }, dpr, t, now);
      }
      // The snow's share of the aurora's light; a style change repaints the land, so only on a real change.
      if (root && Math.abs(state.light - lightShown) > 0.03) {
        lightShown = state.light;
        root.style.setProperty("--aurora-light", state.light.toFixed(2));
      }
    };

    resize();
    draw(skyTime(), 0);

    // Still (other pages, or less motion): the sky as it was when the live one last stopped.
    if (calm) {
      const ro = new ResizeObserver(() => {
        resize();
        draw(skyTime(), 0);
      });
      ro.observe(canvas);
      const onPause = () => draw(skyTime(), 0);
      window.addEventListener(SKY_PAUSED, onPause);
      return () => {
        ro.disconnect();
        window.removeEventListener(SKY_PAUSED, onPause);
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

    // The pointer stirs the aurora (mouse and pen; a tap on touch screens does too).
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (e.clientY > rect.bottom || e.clientY < rect.top) return;
      const k = canvas.width / Math.max(rect.width, 1);
      const x = (e.clientX - rect.left) * k;
      const y = (rect.bottom - e.clientY) * k;
      const now = performance.now();
      const speed = Math.hypot(x - targetX, y - targetY) / Math.max(now - lastMove, 8);
      lastMove = now;
      if (!pointerX) {
        pointerX = x;
        pointerY = y;
      }
      targetX = x;
      targetY = y;
      stir = Math.min(1, stir + Math.min(speed, 2) * 0.12);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // Quality: every couple of seconds, time one frame through to the GPU's finish (a one-pixel
    // read waits for it). Over ~13 ms, a level down; under ~5 ms, a level up (a level costs about
    // 1.5× the one below, so that still leaves room). The median of three samples decides, so a
    // single hiccup (page load, a tab switch) doesn't.
    let pinned = false;
    const probe = new Uint8Array(4);
    const samples: number[] = [];
    let gpuMs = 0;
    const measure = (t: number, now: number) => {
      if (!gl || !program) return draw(t, now);
      const start = performance.now();
      draw(t, now);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
      samples.push(performance.now() - start);
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
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      if (last && now - last < 30) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      frames++;
      t += dt;
      setSkyTime(t, false);
      // Ease toward the pointer; the stir dies away over a couple of seconds.
      pointerX += (targetX - pointerX) * Math.min(1, dt * 4);
      pointerY += (targetY - pointerY) * Math.min(1, dt * 4);
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
      skyStats: () => ({ level, gpuMs, scale, size: [canvas.width, canvas.height], steps: LEVELS[level].steps }),
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
  }, [live]);

  return (
    <div className={className}>
      <canvas ref={glRef} className="absolute inset-0 size-full" />
      <canvas ref={starRef} className="absolute inset-0 size-full" style={{ mixBlendMode: "plus-lighter" }} />
    </div>
  );
}
