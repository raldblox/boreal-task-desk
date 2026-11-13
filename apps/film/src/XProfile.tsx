import { AbsoluteFill } from "remotion";

import { FONT, MONO } from "./theme";

// The @borealwork profile on X: a 400×400 avatar (X crops it to a circle) and a 1500×500 banner.
// Hand-built SVG in the brand's Aurora Teal. Render with:
//   npx remotion still src/index.ts XAvatar out/x-avatar.png
//   npx remotion still src/index.ts XBanner out/x-banner.png

const TEAL = "#00696a";
const TEAL_LIGHT = "#5ac6bd";
const NIGHT = "#0b2326";
const NIGHT_DEEP = "#061416";
const SNOW = "#f3fbfa";

/** The site's mark (apps/web/src/components/brand.tsx, MARK_PATHS): seven compass needles, one tone. */
const Mark = ({ color = SNOW }: { color?: string }) => (
  <g fill={color}>
    <path d="M4.2 22.83L2.7 12.33L4.2 5.33L5.7 12.33Z" />
    <path d="M8.13 27.52L6.63 17.02L8.13 10.02L9.63 17.02Z" />
    <path d="M12.07 26.69L10.57 16.19L12.07 9.19L13.57 16.19Z" />
    <path d="M16 22.27L14.5 11.77L16 4.77L17.5 11.77Z" />
    <path d="M19.93 26.69L18.43 16.19L19.93 9.19L21.43 16.19Z" />
    <path d="M23.87 27.52L22.37 17.02L23.87 10.02L25.37 17.02Z" />
    <path d="M27.8 22.83L26.3 12.33L27.8 5.33L29.3 12.33Z" />
  </g>
);

export const XAvatar = () => (
  <AbsoluteFill>
    <svg viewBox="0 0 400 400" width={400} height={400}>
      {/* Flat Aurora Teal; X crops to a circle, so the mark sits centred with room to breathe. */}
      <rect width="400" height="400" fill={TEAL} />
      <g transform="translate(200 200) scale(7.4) translate(-16 -16)">
        <Mark />
      </g>
    </svg>
  </AbsoluteFill>
);

/** A soft aurora ribbon: a filled band between two curves, blurred. */
const Ribbon = ({ d, color, opacity, blur }: { d: string; color: string; opacity: number; blur: number }) => (
  <path d={d} fill={color} opacity={opacity} filter={`blur(${blur}px)`} />
);

/** A row of pines along a ridge, deterministic so every render matches. */
function pines(baseY: number, count: number, seed: number, minH: number, maxH: number) {
  const out: string[] = [];
  let x = -20;
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    x += 14 + rand() * 26;
    const h = minH + rand() * (maxH - minH);
    const w = h * 0.34;
    const y = baseY + Math.sin(x / 140) * 10;
    out.push(`M${x - w / 2} ${y} L${x} ${y - h} L${x + w / 2} ${y} Z`);
  }
  return out.join(" ");
}

export const XBanner = () => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    <svg viewBox="0 0 1500 500" width={1500} height={500} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={NIGHT_DEEP} />
          <stop offset="70%" stopColor={NIGHT} />
          <stop offset="100%" stopColor="#0f3236" />
        </linearGradient>
        <linearGradient id="aurora-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={TEAL_LIGHT} stopOpacity={0} />
          <stop offset="35%" stopColor={TEAL_LIGHT} />
          <stop offset="75%" stopColor="#8fe3c9" />
          <stop offset="100%" stopColor="#8fe3c9" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="aurora-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2aa39b" stopOpacity={0} />
          <stop offset="50%" stopColor="#2aa39b" />
          <stop offset="100%" stopColor="#5ac6bd" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect width="1500" height="500" fill="url(#sky)" />

      {/* Stars, sparse and fixed. */}
      {Array.from({ length: 70 }, (_, i) => {
        const x = (i * 211.7) % 1500;
        const y = (i * 97.3) % 260;
        return <circle key={i} cx={x} cy={y} r={i % 7 === 0 ? 1.4 : 0.8} fill={SNOW} opacity={0.25 + ((i * 13) % 50) / 100} />;
      })}

      {/* Aurora ribbons sweeping across the sky. */}
      <Ribbon d="M-50 230 C 250 120, 520 90, 820 150 S 1300 230, 1560 120 L 1560 170 C 1300 280, 1050 210, 820 200 S 300 190, -50 290 Z" color="url(#aurora-a)" opacity={0.7} blur={14} />
      <Ribbon d="M-50 170 C 300 60, 600 60, 900 110 S 1350 160, 1560 60 L 1560 90 C 1350 190, 1100 150, 900 140 S 350 110, -50 205 Z" color="url(#aurora-b)" opacity={0.55} blur={20} />
      <Ribbon d="M200 260 C 450 200, 700 190, 950 220 S 1350 250, 1560 200 L 1560 225 C 1350 275, 1150 255, 950 250 S 450 240, 200 285 Z" color="url(#aurora-a)" opacity={0.3} blur={8} />

      {/* Ridges and pines, darkest in front. */}
      <path d="M0 400 C 200 360, 380 380, 560 350 S 950 330, 1150 360 S 1400 340, 1500 350 L1500 500 L0 500 Z" fill="#0d2b2f" />
      <path d={pines(395, 70, 7, 26, 52)} fill="#0a2326" />
      <path d="M0 450 C 260 420, 520 440, 760 425 S 1200 430, 1500 415 L1500 500 L0 500 Z" fill="#071a1c" />
      <path d={pines(455, 60, 31, 34, 70)} fill="#05130f" />
    </svg>

    {/* Wordmark and line, kept right of centre: X's avatar covers the bottom-left corner. */}
    <div
      style={{
        position: "absolute",
        left: 560,
        top: 150,
        width: 860,
        color: SNOW,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg viewBox="0 0 32 32" width={80} height={80}>
          <Mark color={TEAL_LIGHT} />
        </svg>
        <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2.5 }}>boreal.work</span>
      </div>
      <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: -0.6, lineHeight: 1.15 }}>
        Verified humans for AI agents.
      </div>
      <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 2.2, textTransform: "uppercase", color: TEAL_LIGHT, marginTop: 6 }}>
        Real-world tasks · held in escrow · paid when it passes
      </div>
    </div>
  </AbsoluteFill>
);
