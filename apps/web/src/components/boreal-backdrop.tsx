// The shapes of the site's northern scene, seeded so server and client draw the same. Drawn at night
// by components/night-backdrop.tsx (the hero and the still sky) and the home page's closing band.
//
// The view: from a fell above a lake, looking north. Snow-capped mountains on the horizon, a
// forested ridge in front of them, a row of spruce along the far shore, the lake (rendered in the
// sky's shader, so it reflects the live aurora), then the near shore and tall spruces framing it.

export const W = 1600;
export const H = 640;

/** The far waterline, and the lowest point of the near shore's edge: the lake lies between. */
export const Y_WATER = 452;
export const Y_LAKE_BOTTOM = 606;

/** A small seeded random, so the land is the same on every render (and server and client agree). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

/** Smooth 1D noise from a seeded table, in [-1, 1]. */
function noise1(seed: number) {
  const rand = seeded(seed);
  const table = Array.from({ length: 256 }, () => rand() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return table[i & 255] * (1 - u) + table[(i + 1) & 255] * u;
  };
}

/** Fractal noise: a few octaves of noise1. */
function fbm(seed: number, octaves = 4) {
  const n = noise1(seed);
  return (x: number) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * n(x * 2 ** o + o * 31.7);
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

/**
 * One spruce, from its base at (x, base): a narrow spire of short, drooping branches, each side
 * drawn on its own so no two trees (or sides) match. Some carry the dense club crown of black
 * spruce; some have gaps where branches died; most lean a little.
 */
function spruce(x: number, base: number, h: number, rand: () => number, round = r1) {
  // Far away (a few pixels tall) a spruce is a spire with one or two shoulders; no need for more.
  if (h < 12) {
    const w = h * (0.14 + rand() * 0.06);
    return `M${r0(x)},${r0(base - h)}L${r0(x - w)},${r0(base)}L${r0(x + w)},${r0(base)}Z`;
  }
  if (h < 26) {
    const w = h * (0.13 + rand() * 0.06);
    const m = base - h * (0.45 + rand() * 0.1);
    return `M${r0(x)},${r0(base - h)}L${r0(x - w * 0.6)},${r0(m)}L${r0(x - w * 0.25)},${r0(m)}L${r0(x - w)},${r0(base)}L${r0(x + w)},${r0(base)}L${r0(x + w * 0.25)},${r0(m + 1)}L${r0(x + w * 0.6)},${r0(m + 1)}Z`;
  }
  const wmax = h * (0.1 + rand() * 0.07);
  const lean = (rand() - 0.5) * 0.05 * h;
  const club = rand() < 0.45;
  const tiers = Math.max(4, Math.round(h / (h > 80 ? 7.5 : 6)));
  const side = (dir: number) => {
    const pts: string[] = [];
    for (let i = 1; i <= tiers; i++) {
      const f = i / tiers;
      const y = base - h + h * 0.93 * f;
      let reach = wmax * Math.pow(f, 0.85) * (0.55 + 0.9 * rand());
      if (f > 0.25 && rand() < 0.12) reach *= 0.3;
      if (club && f > 0.05 && f < 0.2) reach = Math.max(reach, wmax * (0.42 + 0.2 * rand()));
      const droop = h * 0.012 * (1 + f) + 0.4;
      const cx = x + lean * (1 - f);
      pts.push(`${round(cx + dir * reach)},${round(y + droop)}`);
      if (h > 9) pts.push(`${round(cx + dir * Math.max(reach * 0.28, 0.4))},${round(y + droop + h * 0.014 + 0.4)}`);
    }
    pts.push(`${round(x + dir * Math.max(0.5, h * 0.012))},${round(base)}`);
    return pts;
  };
  const left = side(-1);
  const right = side(1).reverse();
  return `M${round(x + lean)},${round(base - h * 1.03)}L${left.join("L")}L${right.join("L")}Z`;
}

/** A dead spruce: a bare, slightly bent stem with a few broken stubs. */
function snag(x: number, base: number, h: number, rand: () => number) {
  const bend = (rand() - 0.5) * 0.06 * h;
  const w = Math.max(0.8, h * 0.012);
  let d = `M${r1(x - w)},${r1(base)}L${r1(x + bend - w * 0.3)},${r1(base - h)}L${r1(x + bend + w * 0.3)},${r1(base - h)}L${r1(x + w)},${r1(base)}Z`;
  const stubs = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < stubs; i++) {
    const f = 0.2 + rand() * 0.7;
    const y = base - h * f;
    const sx = x + bend * f;
    const dir = rand() < 0.5 ? -1 : 1;
    const len = h * (0.04 + rand() * 0.07) * (1.2 - f);
    d += `M${r1(sx)},${r1(y)}L${r1(sx + dir * len)},${r1(y + len * 0.5)}L${r1(sx + dir * len)},${r1(y + len * 0.5 + 0.9)}L${r1(sx)},${r1(y + 1.6)}Z`;
  }
  return d;
}

/** A row of spruces between x0 and x1, heights in [hMin, hMax], as one path (also drawn in the home page's closing band). */
export function forest(seed: number, { base, hMin, hMax, gap, x0 = -40, x1 = W + 40, keepOut, ground, snags = 0 }: { base: number; hMin: number; hMax: number; gap: number; x0?: number; x1?: number; keepOut?: [number, number]; ground?: (x: number) => number; snags?: number }) {
  const rand = seeded(seed);
  const round = hMax < 200 ? r0 : r1;
  let d = "";
  for (let x = x0; x < x1; x += gap * (0.45 + rand() * 1.1)) {
    if (keepOut && x > keepOut[0] && x < keepOut[1]) continue;
    const h = hMin + (hMax - hMin) * rand() ** 1.4;
    const b = (ground ? ground(x) : base) + rand() * 6;
    d += rand() < snags ? snag(x, b, h * 0.85, rand) : spruce(x, b, h, rand, round);
  }
  return d;
}

/** A closed shape under a line y(x), sampled every `step`, down to the bottom of the scene. */
function under(y: (x: number) => number, step: number, x0 = -60, x1 = W + 60, bottom = H) {
  let d = `M${x0},${bottom}`;
  for (let x = x0; x <= x1; x += step) d += `L${r0(x)},${r1(y(x))}`;
  return `${d}L${x1},${bottom}Z`;
}

// ---------------------------------------------------------------- far mountains, with snow above the treeline
// Peaks as [x, height, half-width]: steep, uneven flanks, with a ridged texture of arêtes and gullies.
const peaks: [number, number, number][] = [
  [120, 18, 90], [300, 30, 110], [455, 44, 95], [560, 26, 70], [705, 56, 120], [860, 38, 80],
  [985, 66, 130], [1110, 34, 75], [1240, 48, 105], [1400, 28, 90], [1540, 36, 100],
];
const mtnDetail = fbm(11, 5);
const ridged = noise1(17);
const mountainY = (x: number) => {
  let lift = 0;
  for (const [px, ph, pw] of peaks) {
    const u = (x - px) / pw;
    // A steeper east face than west, as glaciers carve them.
    const fall = u < 0 ? -u : u * 1.35;
    lift = Math.max(lift, ph * Math.max(0, 1 - fall) ** 1.25);
  }
  const arete = 1 - Math.abs(ridged(x / 14));
  return 393 - lift - 5 * mtnDetail(x / 40) - (2 + lift * 0.09) * arete;
};
// Everything beyond the lake stops at the waterline, so the water (drawn by the sky) shows below.
export const MOUNTAINS = under(mountainY, 6, -60, W + 60, Y_WATER + 4);

// Snow lies above a ragged line, with tongues down the gullies and bare rock on the ribs between.
const snowEdge = fbm(23, 4);
const gully = noise1(29);
const snowLine = (x: number) => 362 + 8 * snowEdge(x / 26) + 13 * Math.max(0, gully(x / 5.5)) ** 2 - 9 * Math.max(0, -gully(x / 3.7 + 40)) ** 3;
export const SNOW = (() => {
  let top = "";
  let bottom = "";
  for (let x = -60; x <= W + 60; x += 5) {
    const y = mountainY(x);
    top += `L${r0(x)},${r1(y)}`;
    bottom = `L${r0(x)},${r0(Math.max(y, snowLine(x)))}` + bottom;
  }
  return `M${top.slice(1)}${bottom}Z`;
})();

// ---------------------------------------------------------------- the forested ridge across the lake
const ridgeNoise = fbm(37, 4);
const ridgeY = (x: number) => 428 - 16 * Math.sin(x / 210 + 0.8) - 9 * Math.sin(x / 97 + 2.1) - 6 * ridgeNoise(x / 60);
/** The ridge's bare shape (its reflection uses only this). */
export const RIDGE_BASE = under(ridgeY, 8, -60, W + 60, Y_WATER + 4);
export const RIDGE = RIDGE_BASE + forest(41, { base: 0, hMin: 4, hMax: 11, gap: 4.2, ground: (x) => ridgeY(x) + 3 });

// ---------------------------------------------------------------- the far shore, at the waterline
const shoreNoise = fbm(53, 3);
const farShoreY = (x: number) => Y_WATER - 4 - 3 * shoreNoise(x / 40);
export const FAR_SHORE = `${under(farShoreY, 10, -60, W + 60, Y_WATER)}${forest(59, { base: 0, hMin: 7, hMax: 24, gap: 5.4, ground: (x) => farShoreY(x) + 1 })}`;

// ---------------------------------------------------------------- the near shore: a snowy bank and spruce stands
const nearNoise = fbm(67, 4);
const nearShoreY = (x: number) => 586 - 18 * Math.exp(-(((x - 300) / 260) ** 2)) - 12 * Math.exp(-(((x - 1300) / 220) ** 2)) + 14 * Math.exp(-(((x - 820) / 300) ** 2)) + 5 * nearNoise(x / 45);
export const NEAR_SHORE = under(nearShoreY, 6);

/** Low willow and birch scrub along the water's edge: a crisp, uneven shoreline. */
export const SHORE_SCRUB = (() => {
  const rand = seeded(89);
  let d = "";
  for (let x = -50; x < W + 50; x += 5 + rand() * 12) {
    const y = nearShoreY(x) + 1.5;
    const w = 4 + rand() * 10;
    const h = 1.5 + rand() * 4.5;
    d += `M${r0(x)},${r0(y + 2)}Q${r0(x + w * 0.2)},${r1(y - h)} ${r0(x + w * 0.5)},${r1(y - h * 0.8)}Q${r0(x + w * 0.85)},${r1(y - h * 1.1)} ${r0(x + w)},${r0(y + 2)}Z`;
  }
  return d;
})();

/** Shadowed hollows between snow drifts on the near shore, following the slope. */
export const SHORE_DRIFTS = (() => {
  const rand = seeded(97);
  const lane = noise1(101);
  let d = "";
  for (let row = 0; row < 4; row++) {
    const drop = 10 + row * 9 + rand() * 4;
    let x = -60;
    while (x < W + 60) {
      const len = 40 + rand() * 160;
      if (lane(x / 90 + row * 7) > -0.1) {
        let top = "";
        let bottom = "";
        for (let u = 0; u <= len; u += 10) {
          const xx = x + u;
          const y = nearShoreY(xx) + drop + 3 * lane(xx / 35 + row);
          const th = 1.4 * Math.sin((Math.PI * u) / len) * (1 + row * 0.5);
          top += `L${r0(xx)},${r1(y)}`;
          bottom = `L${r0(xx)},${r1(y + th)}` + bottom;
        }
        d += `M${top.slice(1)}${bottom}Z`;
      }
      x += len + 30 + rand() * 120;
    }
  }
  return d;
})();
export const NEAR_STANDS =
  forest(71, { base: 0, hMin: 26, hMax: 74, gap: 15, x0: -40, x1: 640, ground: (x) => nearShoreY(x) + 4, snags: 0.06 }) +
  forest(73, { base: 0, hMin: 22, hMax: 60, gap: 17, x0: 1020, x1: W + 40, ground: (x) => nearShoreY(x) + 4, snags: 0.06 }) +
  forest(79, { base: 0, hMin: 16, hMax: 40, gap: 22, x0: 640, x1: 1020, keepOut: [740, 900], ground: (x) => nearShoreY(x) + 5 });

// ---------------------------------------------------------------- the foreground: tall spruces framing the view
const groundY = (x: number) => 624 - 8 * Math.sin(x / 180) - 3 * nearNoise(x / 30 + 9);
export const FOREGROUND = under(groundY, 10);
export const NEAR_TREES =
  forest(31, { base: 0, hMin: 120, hMax: 250, gap: 34, x0: -40, x1: 430, ground: (x) => groundY(x) + 6, snags: 0.08 }) +
  forest(83, { base: 0, hMin: 140, hMax: 300, gap: 36, x0: 1160, x1: W + 40, ground: (x) => groundY(x) + 6, snags: 0.06 });
