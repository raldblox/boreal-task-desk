/*
 * The stars over the hero, where they really are: the observer stands at 65° N looking north on an
 * autumn evening, so the Plough (the seven stars of the mark) hangs low in the north and Capella
 * rises in the north-east. The brightest stars come from a small catalogue (position, magnitude,
 * colour index); fainter ones, down to the naked-eye limit near 6.3, are scattered with the real
 * counts per magnitude and crowd toward the Milky Way. They are part of the illustration, drawn
 * as they stand at the start of the night; the Milky Way behind the aurora turns with sidereal
 * time on the sky clock.
 */

/** Right ascension (hours), declination (degrees), V magnitude, B−V colour index. */
type CatalogStar = readonly [number, number, number, number];

// Bright stars of the northern sky (Yale Bright Star Catalogue values, rounded).
const BRIGHT: CatalogStar[] = [
  // The Plough (Ursa Major) and the rest of the Great Bear
  [11.062, 61.75, 1.79, 1.07], [11.031, 56.38, 2.37, -0.02], [11.897, 53.69, 2.44, 0.04], [12.257, 57.03, 3.31, 0.08],
  [12.9, 55.96, 1.77, -0.02], [13.399, 54.93, 2.27, 0.02], [13.42, 54.99, 4.01, 0.16], [13.792, 49.31, 1.86, -0.19],
  [10.285, 42.91, 3.45, 0.03], [10.372, 41.5, 3.05, 1.59], [8.987, 48.04, 3.14, 0.19], [9.06, 47.16, 3.6, 0.0],
  [8.505, 60.72, 3.36, 0.85], [11.161, 44.5, 3.01, 1.14], [11.308, 33.09, 3.48, 1.4], [11.768, 47.78, 3.71, 1.18],
  [9.548, 51.68, 3.17, 0.46], [9.849, 59.04, 3.8, 0.28],
  // Ursa Minor
  [2.53, 89.26, 1.98, 0.6], [14.845, 74.16, 2.08, 1.47], [15.345, 71.83, 3.05, 0.05], [16.766, 82.04, 4.21, 0.9], [17.537, 86.59, 4.36, 0.02], [15.734, 77.79, 4.29, 0.04],
  // Draco
  [17.943, 51.49, 2.23, 1.52], [17.507, 52.3, 2.79, 0.98], [16.4, 61.51, 2.73, 0.91], [14.073, 64.38, 3.65, -0.05], [15.415, 58.97, 3.29, 1.16],
  [17.146, 65.71, 3.17, -0.12], [19.209, 67.66, 3.07, 1.0], [18.351, 72.73, 3.55, 0.49], [11.523, 69.33, 3.84, 1.62], [12.558, 69.79, 3.87, -0.12], [17.892, 56.87, 3.75, 1.18],
  // Boötes, Canes Venatici, Corona Borealis
  [14.261, 19.18, -0.05, 1.23], [14.535, 38.31, 3.03, 0.19], [15.032, 40.39, 3.5, 0.97], [14.75, 27.07, 2.35, 0.97], [13.911, 18.4, 2.68, 0.58],
  [12.934, 38.32, 2.89, -0.12], [15.578, 26.71, 2.23, -0.02],
  // Lyra, Cygnus
  [18.616, 38.78, 0.03, 0.0], [20.69, 45.28, 1.25, 0.09], [20.37, 40.26, 2.23, 0.67], [20.77, 33.97, 2.48, 1.03], [19.75, 45.13, 2.87, -0.03], [19.512, 27.96, 3.08, 1.13],
  // Cassiopeia, Cepheus
  [0.675, 56.54, 2.24, 1.17], [0.153, 59.15, 2.28, 0.34], [0.945, 60.72, 2.15, -0.15], [1.43, 60.24, 2.68, 0.13], [1.907, 63.67, 3.35, -0.15],
  [21.31, 62.59, 2.45, 0.22], [23.656, 77.63, 3.21, 1.03], [21.478, 70.56, 3.23, -0.22], [22.181, 58.2, 3.35, 1.57],
  // Perseus, Auriga, Gemini, Andromeda, Lynx
  [3.405, 49.86, 1.79, 0.48], [3.136, 40.96, 2.12, -0.05], [3.902, 31.88, 2.85, 0.12], [3.964, 40.01, 2.89, -0.18], [3.08, 53.51, 2.93, 0.7], [3.715, 47.79, 3.01, -0.13],
  [5.278, 46.0, 0.08, 0.8], [5.992, 44.95, 1.9, 0.03], [5.995, 37.21, 2.62, -0.08], [4.95, 33.17, 2.69, 1.53], [5.033, 43.82, 2.99, 0.54],
  [7.577, 31.89, 1.58, 0.03], [7.755, 28.03, 1.14, 1.0],
  [0.14, 29.09, 2.06, -0.11], [1.163, 35.62, 2.05, 1.58], [2.065, 42.33, 2.1, 1.37],
  [9.351, 34.39, 3.13, 1.55],
];

/** The observer's latitude and the sidereal time (hours) at sky time 0. */
const LAT = (65 * Math.PI) / 180;
const LST0 = 22.4;

const RAD = Math.PI / 180;
/** Galactic north pole and centre (J2000), in equatorial coordinates. */
const GAL_POLE = [192.859 * RAD, 27.128 * RAD] as const;
const GAL_CENTRE = [266.405 * RAD, -28.936 * RAD] as const;

export type Star = {
  ra: number; // radians
  dec: number; // radians
  flux: number; // relative to a 6.2 magnitude star
  tint: [number, number, number]; // linear-ish 0 to 1
  phase: number;
  speed: number;
  speed2: number;
};

/** A star's colour to the eye from its B−V index; faint stars read white (only the cones see colour). */
function tint(bv: number, mag: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [-0.3, [170, 191, 255]], [0, [202, 215, 255]], [0.3, [248, 247, 255]], [0.6, [255, 244, 234]],
    [0.9, [255, 228, 196]], [1.2, [255, 210, 161]], [1.6, [255, 190, 130]],
  ];
  let c = stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (bv <= stops[i][0]) {
      const [b0, c0] = stops[i - 1];
      const [b1, c1] = stops[i];
      const f = Math.max(0, (bv - b0) / (b1 - b0));
      c = [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * f) as [number, number, number];
      break;
    }
  }
  const sat = Math.min(1, Math.max(0, (3.5 - mag) / 3)); // colour fades with brightness
  return c.map((v) => (255 - (255 - v) * sat) / 255) as [number, number, number];
}

/** Equatorial unit vector. */
const eq = (ra: number, dec: number) => [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];

export function catalog(): Star[] {
  let seed = 9001;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const stars: Star[] = [];
  const add = (ra: number, dec: number, mag: number, bv: number) =>
    stars.push({
      ra,
      dec,
      flux: Math.pow(10, -0.4 * (mag - 6.2)),
      tint: tint(bv, mag),
      phase: rand() * Math.PI * 2,
      speed: 5 + rand() * 7,
      speed2: 13 + rand() * 9,
    });
  for (const [ra, dec, mag, bv] of BRIGHT) add(ra * 15 * RAD, dec * RAD, mag, bv);

  // Fainter stars, magnitude 3.9 to 6.3, over the northern two thirds of the sky. Counts grow about
  // 10^0.5 per magnitude; three times denser along the galactic plane than at its poles.
  const pole = eq(...GAL_POLE);
  let placed = 0;
  while (placed < 2400) {
    const ra = rand() * Math.PI * 2;
    const dec = Math.asin(-0.35 + rand() * 1.35);
    const v = eq(ra, dec);
    const b = Math.asin(v[0] * pole[0] + v[1] * pole[1] + v[2] * pole[2]);
    if (rand() * 3.2 > 1 + 2.2 * Math.exp(-((b / (14 * RAD)) ** 2))) continue;
    const lo = Math.pow(10, 0.5 * 3.9);
    const hi = Math.pow(10, 0.5 * 6.3);
    const mag = Math.log10(lo + rand() * (hi - lo)) / 0.5;
    add(ra, dec, mag, -0.2 + rand() * 1.6);
    placed++;
  }
  return stars;
}

/** Local sidereal time (radians) at a moment of sky time (seconds). */
export const siderealAngle = (t: number) => ((LST0 + (t * 1.0027379) / 3600) * 15 * RAD) % (Math.PI * 2);

/** A direction in the observer's frame: x east, y up, z north. */
export function horizontal(ra: number, dec: number, lst: number): [number, number, number] {
  const H = lst - ra;
  const cd = Math.cos(dec);
  const sd = Math.sin(dec);
  return [-cd * Math.sin(H), Math.sin(LAT) * sd + Math.cos(LAT) * cd * Math.cos(H), Math.cos(LAT) * sd - Math.sin(LAT) * cd * Math.cos(H)];
}

/** The galactic north pole and centre in the observer's frame, for the Milky Way in the shader. */
export function galaxy(t: number) {
  const lst = siderealAngle(t);
  return { pole: horizontal(GAL_POLE[0], GAL_POLE[1], lst), centre: horizontal(GAL_CENTRE[0], GAL_CENTRE[1], lst) };
}

/**
 * The stars as the land's SVG draws them (components/night-land.tsx), so they are on the page from
 * its first paint: every star above the horizon at the start of the night, through a lens pitched
 * 10° up with the horizon at `horizonY`, dimmed by extinction low down (0.2 mag per air mass).
 * Grouped by brightness (and the few warm giants apart) into one path each.
 */
export function starField(width: number, height: number, horizonY: number): { opacity: number; warm: boolean; d: string }[] {
  const pitch = 10 * RAD;
  const f = (horizonY - height / 2) / Math.tan(pitch);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const lst = siderealAngle(0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const groups = new Map<string, { opacity: number; warm: boolean; d: string }>();
  for (const s of catalog()) {
    const [x, y, z] = horizontal(s.ra, s.dec, lst);
    const depth = y * sp + z * cp;
    if (y < 0.02 || depth <= 0.05) continue;
    const px = width / 2 + (f * x) / depth;
    const py = height / 2 - (f * (y * cp - z * sp)) / depth;
    if (px < -20 || px > width + 20 || py < -4 || py > horizonY) continue;
    const el = Math.asin(y);
    const X = 1 / (Math.sin(el) + 0.50572 * Math.pow(el / RAD + 6.07995, -1.6364));
    const flux = s.flux * Math.pow(10, -0.08 * X);
    const a = Math.min(1, 0.075 * flux);
    if (a < 0.06) continue;
    const opacity = a < 0.14 ? 0.14 : a < 0.26 ? 0.26 : a < 0.45 ? 0.45 : a < 0.7 ? 0.7 : 1;
    const warm = s.tint[2] < 0.8;
    const key = `${opacity}${warm}`;
    const group = groups.get(key) ?? { opacity, warm, d: "" };
    const r = Math.min(0.42 + 0.17 * Math.sqrt(flux), 2.4) / 1.4;
    group.d +=
      r < 0.55
        ? `M${r1(px - r)},${r1(py - r)}h${r1(2 * r)}v${r1(2 * r)}h${r1(-2 * r)}z`
        : `M${r1(px - r)},${r1(py)}a${r1(r)},${r1(r)} 0 1,0 ${r1(2 * r)},0a${r1(r)},${r1(r)} 0 1,0 ${r1(-2 * r)},0z`;
    groups.set(key, group);
  }
  return [...groups.values()];
}
