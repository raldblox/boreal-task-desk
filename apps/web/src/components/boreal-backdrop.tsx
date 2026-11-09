// The site's top backdrop: a boreal forest under a daylight sky with a soft aurora, drawn as SVG.
// Purely decorative, rendered once on the server; it fades out into the page background.

const W = 1600;
const H = 640;

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

const FAR = forest(7, { base: 520, hMin: 26, hMax: 58, gap: 13 });
const MID = forest(19, { base: 580, hMin: 48, hMax: 110, gap: 22 });
const NEAR = forest(31, { base: 650, hMin: 150, hMax: 290, gap: 38, keepOut: [90, 1120] });

export function BorealBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)] md:h-[640px]"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="bb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cfe4ee" />
            <stop offset="0.45" stopColor="#e4f0f2" />
            <stop offset="0.8" stopColor="#f4f9f8" />
          </linearGradient>
          <radialGradient id="bb-sun" cx="0.78" cy="0.18" r="0.45">
            <stop offset="0" stopColor="#fffaf0" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fffaf0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bb-aurora" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#3fd99a" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#2fbfae" stopOpacity="0.6" />
            <stop offset="1" stopColor="#7aa8f0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bb-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f9f8" stopOpacity="0" />
            <stop offset="0.6" stopColor="#f4f9f8" stopOpacity="0.85" />
            <stop offset="1" stopColor="#f4f9f8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="bb-wash" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f4f9f8" stopOpacity="0.8" />
            <stop offset="0.4" stopColor="#f4f9f8" stopOpacity="0.6" />
            <stop offset="0.68" stopColor="#f4f9f8" stopOpacity="0" />
          </linearGradient>
          {/* Fades the wash in from above, so it has no top edge. */}
          <linearGradient id="bb-wash-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.3" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="bb-wash-mask" maskContentUnits="userSpaceOnUse">
            <rect width={W} height={H} fill="url(#bb-wash-fade)" />
          </mask>
          <linearGradient id="bb-aurora-violet" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#5fe0c0" stopOpacity="0.7" />
            <stop offset="0.5" stopColor="#9b8cf0" stopOpacity="0.35" />
            <stop offset="1" stopColor="#9b8cf0" stopOpacity="0" />
          </linearGradient>
          <filter id="bb-soft" filterUnits="userSpaceOnUse" x="-300" y="-300" width={W + 600} height={H + 600}>
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="bb-haze" filterUnits="userSpaceOnUse" x="-300" y="-300" width={W + 600} height={H + 600}>
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#bb-sky)" />
        <rect width={W} height={H} fill="url(#bb-sun)" />

      </svg>

      {/* Aurora: soft curtains, faint as it would be by day. Each sits on its own layer and drifts
          slowly (globals.css: .bb-aurora-*), moved by the compositor so the blur isn't redrawn. */}
      <div className="bb-par absolute inset-0 [--d:0.55]">
      <div className="bb-aurora bb-aurora-a absolute inset-y-0 -inset-x-[6%]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="size-full">
          <path d="M-60 250 C 220 150, 420 300, 700 200 S 1150 110, 1380 190 S 1620 150, 1700 120 L 1700 -40 L -60 -40 Z" fill="url(#bb-aurora)" filter="url(#bb-soft)" opacity="0.95" transform="translate(0 -30) scale(1 0.8)" />
          <path d="M-60 150 C 260 230, 520 120, 820 170 S 1200 240, 1700 150 L 1700 -40 L -60 -40 Z" fill="url(#bb-aurora-violet)" filter="url(#bb-soft)" opacity="0.6" />
        </svg>
      </div>
      <div className="bb-aurora bb-aurora-b absolute inset-y-0 -inset-x-[6%]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="size-full">
          <path d="M520 240 C 760 170, 960 250, 1160 190 S 1460 150, 1660 210 L 1660 20 L 520 20 Z" fill="url(#bb-aurora)" filter="url(#bb-soft)" opacity="0.7" />
          <g opacity="0.55" filter="url(#bb-haze)" stroke="#6fd8b2" strokeWidth="5" fill="none">
            {Array.from({ length: 26 }, (_, i) => {
              const x = 560 + i * 34;
              const top = 60 + Math.sin(i * 0.7) * 30;
              return <path key={i} d={`M${x} ${top} L${x + 30} ${top + 120 + Math.cos(i) * 25}`} />;
            })}
          </g>
        </svg>
      </div>
      </div>

      {/* Parallax: each layer below slides at its own rate as the page scrolls (globals.css: .bb-par),
          far layers slowest, so the scene has depth. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="bb-par absolute inset-0 size-full [--d:0.45]">
        {/* Clouds */}
        <g fill="#ffffff" filter="url(#bb-soft)" opacity="0.8">
          <ellipse cx="260" cy="120" rx="220" ry="34" />
          <ellipse cx="1180" cy="90" rx="260" ry="30" />
          <ellipse cx="760" cy="60" rx="180" ry="22" />
        </g>
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="bb-par absolute inset-0 size-full [--d:0.32]">
        {/* Mountains */}
        <path d="M0 400 L60 425 L140 415 L230 445 L360 380 L470 420 L560 400 L700 330 L790 370 L880 350 L990 300 L1080 345 L1180 320 L1300 360 L1420 330 L1520 370 L1600 350 L1600 640 L0 640 Z" fill="#c2d8de" />
        <path d="M990 300 L1030 322 L1012 324 L1050 338 L1080 345 L1040 333 Z M700 330 L735 350 L718 352 L760 362 Z" fill="#eef5f6" />
        <path d="M0 470 L90 492 L170 468 L300 485 L420 450 L560 470 L700 440 L860 465 L1000 430 L1140 460 L1280 440 L1440 470 L1600 450 L1600 640 L0 640 Z" fill="#b2cdd2" />

        <rect y="400" width={W} height="160" fill="url(#bb-mist)" />
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="bb-par absolute inset-0 size-full [--d:0.16]">
        <path d={FAR} fill="#93b8b8" />
        <rect y="470" width={W} height="140" fill="url(#bb-mist)" opacity="0.8" />
        <path d={MID} fill="#6e9c9a" />
        <rect y="540" width={W} height="120" fill="url(#bb-mist)" opacity="0.6" />
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
        {/* Keep the left, where the headline and text sit, calm and readable. */}
        <rect width={W} height={H} fill="url(#bb-wash)" mask="url(#bb-wash-mask)" />
        <path d={NEAR} fill="#4a7b78" />
      </svg>
    </div>
  );
}
