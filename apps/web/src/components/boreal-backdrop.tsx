// The shapes of the site's northern scene: spruce rows and mountain ridges, seeded so server and
// client draw the same. Drawn at night by components/night-backdrop.tsx and the closing band.

export const W = 1600;
export const H = 640;

/** A small seeded random, so the forest is the same on every render (and server and client agree). */
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

/** One spruce: a narrow, tiered silhouette from its base at (x, base). */
function spruce(x: number, base: number, h: number, rand: () => number) {
  const w = h * (0.17 + rand() * 0.06);
  const tiers = Math.max(5, Math.round(h / 11));
  const left: string[] = [`${r1(x)},${r1(base - h)}`];
  for (let i = 1; i <= tiers; i++) {
    const f = i / tiers;
    const y = base - h + h * f * 0.94;
    const reach = w * (0.15 + 0.85 * f) * (0.85 + rand() * 0.3);
    left.push(`${r1(x - reach)},${r1(y + 2)}`);
    if (i < tiers) left.push(`${r1(x - reach * 0.38)},${r1(y - 1)}`);
  }
  left.push(`${r1(x - w * 0.08)},${r1(base)}`);
  const right = left
    .slice(1)
    .reverse()
    .map((p) => {
      const [px, py] = p.split(",").map(Number);
      return `${r1(2 * x - px + (rand() - 0.5) * 2)},${py}`;
    });
  return `M${left.join("L")}L${right.join("L")}Z`;
}

/** A row of spruces between x0 and x1, heights in [hMin, hMax], as one path (also drawn in the home page's closing band). */
export function forest(seed: number, { base, hMin, hMax, gap, x0 = -40, x1 = W + 40, keepOut }: { base: number; hMin: number; hMax: number; gap: number; x0?: number; x1?: number; keepOut?: [number, number] }) {
  const rand = seeded(seed);
  let d = "";
  for (let x = x0; x < x1; x += gap * (0.55 + rand() * 0.9)) {
    if (keepOut && x > keepOut[0] && x < keepOut[1]) continue;
    const h = hMin + (hMax - hMin) * rand() ** 1.4;
    d += spruce(x, base + rand() * 10, h, rand);
  }
  return d;
}

/** The two mountain ridges and the snow on the far one (also drawn at night by the home hero). */
export const RIDGE_FAR = "M0 400 L60 425 L140 415 L230 445 L360 380 L470 420 L560 400 L700 330 L790 370 L880 350 L990 300 L1080 345 L1180 320 L1300 360 L1420 330 L1520 370 L1600 350 L1600 640 L0 640 Z";
export const SNOW_CAPS = "M990 300 L1030 322 L1012 324 L1050 338 L1080 345 L1040 333 Z M700 330 L735 350 L718 352 L760 362 Z";
export const RIDGE_NEAR = "M0 470 L90 492 L170 468 L300 485 L420 450 L560 470 L700 440 L860 465 L1000 430 L1140 460 L1280 440 L1440 470 L1600 450 L1600 640 L0 640 Z";

export const FAR = forest(7, { base: 520, hMin: 26, hMax: 58, gap: 13 });
export const MID = forest(19, { base: 580, hMin: 48, hMax: 110, gap: 22 });
export const NEAR = forest(31, { base: 650, hMin: 150, hMax: 290, gap: 38, keepOut: [90, 1120] });
