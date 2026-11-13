/*
 * How active the aurora is at a moment of sky time, as a substorm cycle rather than a loop.
 *
 * A real substorm runs in three phases (Akasofu 1964; McPherron 1970):
 *   - growth: a quiet, homogeneous arc slowly brightens and drifts equatorward (toward us, so
 *     higher in the sky) as the magnetotail loads with energy;
 *   - expansion: at onset the most equatorward arc brightens within seconds and breaks up into
 *     rays, folds and curls; a westward travelling surge runs along it, new arcs light up
 *     poleward (farther north, lower in the sky), harder electrons push the lower border down
 *     toward 95 km (where nitrogen's violet and pink outlast quenched oxygen green) and, when the
 *     substorm is strong, the tallest rays turn red on top (O 630.0 nm, which takes ~110 s to
 *     radiate, so it lags);
 *   - recovery: the arcs fade and drift back poleward, the sky fills with diffuse aurora and
 *     pulsating patches, and quiet arcs re-form.
 * Real cycles take one to three hours; here each takes 8 to 14 minutes, and each cycle has its own
 * length and strength (seeded by its number), so the sequence never repeats. Slow noise on every
 * quantity keeps a phase from looking scripted.
 *
 * Pure and deterministic in t: the still sky on other pages draws exactly the moment the live one
 * stopped.
 */

export type SkyState = {
  /** Northward distance (km) of each arc's foot, equatorward first. */
  arcZ: [number, number, number];
  /** Brightness of each arc (1 ≈ a bright quiet arc). */
  arcI: [number, number, number];
  /** 0: a homogeneous arc; 1: fully rayed, flickering. */
  rays: number;
  /** Amplitude of folds and curls, 0 to 1. */
  folds: number;
  /** The westward travelling surge: its eastward position along the arcs (km) and strength (0–1). */
  surgeX: number;
  surge: number;
  /** Electron hardness, 0 to 1: lowers the lower border and brings out the violet-pink hem. */
  hard: number;
  /** O 630.0 nm on the tallest rays, 0 to 1; only strong substorms reach it. */
  red: number;
  /** Pulsating patches, 0 to 1. */
  pulse: number;
  /** Diffuse aurora brightness. */
  diffuse: number;
  /** Rough brightness of the whole display, 0 to 1, for the light it casts on snow. */
  light: number;
  phase: "growth" | "expansion" | "recovery";
};

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth value noise in [0, 1]. */
function noise(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type Cycle = { k: number; start: number; length: number; growth: number; expansion: number; strength: number };

function cycleAt(k: number, start: number): Cycle {
  const length = 480 + 360 * hash(k + 0.11);
  // Most substorms are moderate; about one in four is strong enough for red tops.
  const strength = 0.4 + 0.6 * Math.pow(hash(k + 0.37), 0.75);
  return { k, start, length, growth: length * (0.4 + 0.12 * hash(k + 0.73)), expansion: 95 + 60 * hash(k + 0.91), strength };
}

// Walking the cycles from t = 0 is cheap, and cached: sky time only moves forward a little at a time.
// Pulsating patches come in after the breakup and stay while the rest fades; the diffuse glow peaks
// early in recovery and decays slowly.
const recoveryPulse = (M: number, r: number, span: number) => M * (1 - Math.exp(-r / 30)) * Math.exp(-r / (1.6 * span));
const recoveryDiffuse = (M: number, r: number) => 0.3 + (0.35 * M + 0.25 * M * (1 - Math.exp(-r / 40))) * Math.exp(-r / 220);

let cache: Cycle = cycleAt(0, 0);
function cycleFor(t: number): Cycle {
  let c = t >= cache.start ? cache : cycleAt(0, 0);
  while (t >= c.start + c.length) c = cycleAt(c.k + 1, c.start + c.length);
  cache = c;
  return c;
}

/** The quiet sky between substorms: where growth begins and recovery returns to. */
const QUIET = { z: 330, i: 0.42, rays: 0.12, folds: 0.18 };

export function skyState(t: number): SkyState {
  const c = cycleFor(Math.max(0, t));
  const u = t - c.start;
  const M = c.strength;
  const wobble = (seed: number, scale: number) => noise(t / scale + seed * 13.7) - 0.5;
  const onsetAt = c.growth;
  const recoverAt = c.growth + c.expansion;

  let arcZ: [number, number, number];
  let arcI: [number, number, number];
  let rays: number, folds: number, surge: number, hard: number, red: number, pulse: number, diffuse: number;
  let surgeX = 0;
  let phase: SkyState["phase"];

  // What the previous cycle's recovery left behind (pulsating patches, diffuse glow) as this one grows.
  const p = c.k > 0 ? cycleAt(c.k - 1, 0) : null;
  const pSpan = p ? p.length - p.growth - p.expansion : 1;
  const leftPulse = p ? recoveryPulse(p.strength, pSpan, pSpan) : 0;
  const leftDiffuse = p ? recoveryDiffuse(p.strength, pSpan) : 0.3;

  if (u < onsetAt) {
    phase = "growth";
    const g = u / onsetAt;
    const z = mix(QUIET.z, 215, smooth(0, 1, g));
    arcZ = [z, 470 - 30 * g, 700];
    arcI = [mix(QUIET.i, 0.62 + 0.15 * M, g * g), 0.16 + 0.08 * g, 0.08];
    rays = QUIET.rays + 0.08 * g;
    folds = QUIET.folds + 0.12 * g;
    surge = 0;
    hard = 0;
    red = 0;
    pulse = leftPulse * Math.exp(-u / 70);
    diffuse = 0.3 + (leftDiffuse - 0.3) * Math.exp(-u / 120);
  } else if (u < recoverAt) {
    phase = "expansion";
    const s = u - onsetAt;
    const e = s / c.expansion;
    const flash = 1 - Math.exp(-s / 7);
    const spread = smooth(0, 1, e);
    arcZ = [215 - 20 * flash + 30 * spread, mix(440, 400, spread), mix(700, 620, spread)];
    arcI = [
      mix(0.62 + 0.15 * M, 0.7 + 1.9 * M, flash) * (1 - 0.3 * e),
      0.24 + (1.26 * M - 0.04) * smooth(0.08, 0.4, e),
      0.08 + (0.87 * M + 0.02) * smooth(0.3, 0.7, e),
    ];
    rays = mix(0.2, 0.45 + 0.55 * M, flash);
    folds = mix(0.3, 0.55 + 0.45 * M, flash);
    // The surge starts east of the onset and runs west at about 2.5 km/s.
    surgeX = 160 - 2.5 * s;
    surge = M * flash * (1 - 0.6 * e);
    hard = M * flash * (1 - 0.4 * e);
    red = smooth(0.62, 0.95, M) * (1 - Math.exp(-s / 35));
    pulse = 0;
    diffuse = 0.3 + 0.35 * M * spread;
  } else {
    phase = "recovery";
    const r = u - recoverAt;
    const span = c.length - recoverAt;
    const settle = smooth(0.55, 1, r / span); // the last part blends into the next growth phase
    const fade = Math.exp(-r / 110);
    const endI = [(0.7 + 1.9 * M) * 0.7, 0.2 + 1.3 * M, 0.1 + 0.85 * M];
    arcZ = [mix(225, QUIET.z, smooth(0, 1, r / span)), mix(400, 470, smooth(0, 1, r / span)), mix(620, 700, settle)];
    arcI = [
      mix(QUIET.i + (endI[0] - QUIET.i) * fade, QUIET.i, settle),
      mix(0.16 + (endI[1] - 0.16) * fade * fade, 0.16, settle),
      mix(0.08 + (endI[2] - 0.08) * fade * fade, 0.08, settle),
    ];
    const peakRays = 0.45 + 0.55 * M;
    rays = mix(QUIET.rays + (peakRays - QUIET.rays) * Math.exp(-r / 60), QUIET.rays, settle);
    folds = mix(QUIET.folds + (0.55 + 0.45 * M - QUIET.folds) * Math.exp(-r / 80), QUIET.folds, settle);
    surgeX = 160 - 2.5 * (c.expansion + r);
    surge = M * 0.4 * Math.exp(-r / 25);
    hard = M * 0.6 * Math.exp(-r / 40);
    red = smooth(0.62, 0.95, M) * (1 - Math.exp(-c.expansion / 35)) * Math.exp(-r / 100) * (1 - settle);
    pulse = recoveryPulse(M, r, span);
    diffuse = recoveryDiffuse(M, r);
  }

  // Slow, independent wandering, so no two minutes look alike.
  arcI = [arcI[0] * (1 + 0.22 * wobble(1, 17)), arcI[1] * (1 + 0.3 * wobble(2, 23)), arcI[2] * (1 + 0.3 * wobble(3, 29))];
  arcZ = [arcZ[0] + 18 * wobble(4, 41), arcZ[1] + 25 * wobble(5, 37), arcZ[2] + 30 * wobble(6, 53)];
  rays = Math.min(1, Math.max(0, rays + 0.08 * wobble(7, 11)));
  folds = Math.min(1, Math.max(0, folds + 0.1 * wobble(8, 13)));

  const light = Math.min(1, (arcI[0] + 0.6 * arcI[1] + 0.4 * arcI[2] + 0.6 * diffuse + 0.4 * pulse) / 3.4);
  return { arcZ, arcI, rays, folds, surgeX, surge, hard, red, pulse, diffuse, light, phase };
}

/**
 * Where a first visit opens: 40 seconds into the breakup of the first strong substorm, so the
 * sky is at its most alive and then settles. Coming back later resumes the shared clock instead.
 */
export const OPENING_TIME = (() => {
  let c = cycleAt(0, 0);
  while (c.strength < 0.8) c = cycleAt(c.k + 1, c.start + c.length);
  return c.start + c.growth + 40;
})();
