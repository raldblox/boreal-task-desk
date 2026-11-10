import { createContext, type CSSProperties, type ReactNode, useContext } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { C, FONT, MONO } from "./theme";

// The edited cut (Clipchamp, VO already in) with motion graphics, camera moves, music and sound.
// Times are seconds in that cut; the VO cues were found by matching its audio to public/vo.

const FPS = 30;
const s = (t: number) => Math.round(t * FPS);
export const FINAL_FRAMES = s(179.5);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Where each VO line plays in the cut [start, end], for ducking the music. */
const VO_AT: [number, number][] = [
  [0.8, 8.2], [9, 13.6], [16.2, 25.8], [39.1, 45.3], [46.3, 53.8], [55.2, 65.3], [65.7, 71.2], [78.8, 89.6],
  [104.3, 110.6], [115.7, 116.8], [128.9, 131.6], [137.6, 143.3], [154.1, 159.5], [160.6, 170.3], [171.9, 177.2],
];

/* ---------- Liquid glass ---------- */

export const MINT = "#7fe0d6";

/**
 * How visible the surrounding beat is. Glass applies it to itself: opacity or filter on a parent
 * would cut the glass off from the video behind it, and the blur would have nothing to blur.
 */
export const Fade = createContext(1);

/** A liquid-glass panel: blurred, saturated backdrop, a bright rim and a soft specular sheen. */
export const Glass = ({ tone = "dark", children, style }: { tone?: "dark" | "light"; children: ReactNode; style?: CSSProperties }) => {
  const dark = tone === "dark";
  const fade = useContext(Fade);
  return (
    <div
      style={{
        opacity: fade,
        position: "relative",
        borderRadius: 30,
        overflow: "hidden",
        color: dark ? "#fff" : C.ink,
        // A tinted base under the frost keeps text readable whatever is behind the card.
        backgroundImage: dark
          ? "linear-gradient(150deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.04) 45%, rgba(120,220,210,.08) 100%)"
          : "linear-gradient(150deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.2) 60%, rgba(200,236,232,.25) 100%)",
        backgroundColor: dark ? "rgba(8,26,28,.62)" : "rgba(246,252,251,.82)",
        backdropFilter: "blur(28px) saturate(185%)",
        WebkitBackdropFilter: "blur(28px) saturate(185%)",
        border: `1px solid ${dark ? "rgba(255,255,255,.30)" : "rgba(255,255,255,.95)"}`,
        boxShadow: dark
          ? "inset 0 1px 1px rgba(255,255,255,.55), inset 0 -18px 40px rgba(255,255,255,.04), 0 40px 90px -30px rgba(0,0,0,.7)"
          : "inset 0 1px 1px rgba(255,255,255,1), 0 40px 90px -36px rgba(10,50,55,.45), 0 0 0 1px rgba(20,90,95,.06)",
        ...style,
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 70% at 12% -10%, rgba(255,255,255,.35), transparent 55%)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
};

export const Kicker = ({ children, color }: { children: ReactNode; color: string }) => (
  <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: 3, textTransform: "uppercase", color }}>{children}</div>
);

export const Pill = ({ children, tone }: { children: ReactNode; tone: "mint" | "paypal" | "red" | "ghost" | "teal" }) => {
  const look = {
    mint: { color: "#0d3b3a", background: MINT },
    teal: { color: "#fff", background: C.teal },
    paypal: { color: "#fff", background: C.paypal },
    red: { color: "#fff", background: "rgba(225,80,70,.92)" },
    ghost: { color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.12)" },
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, fontSize: 20, fontWeight: 700, ...look }}>{children}</span>;
};

/** Shows children from `from` for `dur` seconds: springs in, drifts slightly, fades out. */
export const Beat = ({ from, dur, children, style, whoosh = false }: { from: number; dur: number; children: ReactNode; style?: CSSProperties; whoosh?: boolean }) => (
  <Sequence from={s(from)} durationInFrames={s(dur)} layout="none">
    <Pop dur={dur} style={style}>
      {children}
    </Pop>
    {whoosh && <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.3} />}
  </Sequence>
);

export const Pop = ({ dur, children, style }: { dur: number; children: ReactNode; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 20, mass: 0.8 } });
  const out = interpolate(frame, [s(dur) - 12, s(dur)], [1, 0], clamp);
  const drift = interpolate(frame, [0, s(dur)], [0, -8]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", fontFamily: FONT, ...style }}>
      <Fade.Provider value={Math.min(t, 1) * out}>
        <div style={{ transform: `translateY(${(1 - t) * 30 + drift}px) scale(${0.94 + 0.06 * t})` }}>{children}</div>
      </Fade.Provider>
    </AbsoluteFill>
  );
};

export const place = (where: "bl" | "br" | "tr" | "rc" | "lc" | "bc"): CSSProperties =>
  ({
    bl: { justifyContent: "flex-end", alignItems: "flex-start", padding: "0 0 150px 170px" },
    br: { justifyContent: "flex-end", alignItems: "flex-end", padding: "0 170px 150px 0" },
    tr: { justifyContent: "flex-start", alignItems: "flex-end", padding: "120px 170px 0 0" },
    rc: { justifyContent: "center", alignItems: "flex-end", padding: "0 170px 0 0" },
    lc: { justifyContent: "center", alignItems: "flex-start", padding: "0 0 0 190px" },
    bc: { justifyContent: "flex-end", alignItems: "center", padding: "0 0 140px 0" },
  })[where];

/* ---------- Camera ---------- */

/** Slow push-ins on the moments that matter: [from, to, scale, focusX, focusY] in 1920×1080 pixels. */
const PUSHES: [number, number, number, number, number][] = [
  [34.4, 38.8, 1.22, 960, 560], // PayPal "Set it up just once"
  [90.4, 101, 1.3, 1290, 520], // the worker's $5.00 task and notes
  [148.9, 150.5, 1.45, 1250, 400], // the task page: Paid, "Paid $5.00 to your PayPal"
];

const Camera = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  let scale = 1;
  let ox = 960;
  let oy = 540;
  for (const [a, b, k, x, y] of PUSHES) {
    const ramp = Math.min(1.2, (b - a) / 3);
    const p = interpolate(frame, [s(a), s(a + ramp), s(b - ramp / 2), s(b)], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    const grow = interpolate(frame, [s(a), s(b)], [0, 1], clamp);
    if (p > 0) {
      scale = 1 + (k - 1) * p * (0.85 + 0.15 * grow);
      ox = x;
      oy = y;
    }
  }
  return <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox}px ${oy}px` }}>{children}</AbsoluteFill>;
};

/* ---------- Cards ---------- */

const JiWoo = () => (
  <Glass style={{ width: 600, padding: 30 }}>
    <div style={{ display: "flex", gap: 26, alignItems: "center" }}>
      <div style={{ width: 132, height: 132, borderRadius: 66, overflow: "hidden", boxShadow: "0 0 0 3px rgba(255,255,255,.55), 0 14px 30px -10px rgba(0,0,0,.5)", flexShrink: 0 }}>
        <Img src={staticFile("art/jiwoo.png")} style={{ width: "150%", marginLeft: "-25%", marginTop: "-6%" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Kicker color={MINT}>Meet</Kicker>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>Ji-woo Kim</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,.78)" }}>Founder of a K-beauty brand</div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <Pill tone="ghost">Seoul</Pill>
          <Pill tone="mint">Launching in Manila</Pill>
        </div>
      </div>
    </div>
  </Glass>
);

const STACK = [
  { at: 0.3, k: "Skill", v: "Learns boreal work from agents.md" },
  { at: 2.4, k: "MCP", v: "Posts, funds and reviews as tools" },
  { at: 4.6, k: "Owner", v: "One approval from Ji-woo" },
  { at: 6.8, k: "PayPal", v: "$10 a task, $50 a day, her limits" },
];
const Stack = () => {
  const frame = useCurrentFrame();
  return (
    <Glass style={{ width: 560, padding: "28px 30px" }}>
      <Kicker color={MINT}>What Hermes plugs into</Kicker>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 20 }}>
        {STACK.map((row, i) => {
          const t = interpolate(frame, [s(row.at), s(row.at) + 12], [0, 1], clamp);
          return (
            <div key={row.k} style={{ display: "flex", gap: 18, alignItems: "center", opacity: 0.25 + 0.75 * t, transform: `translateX(${(1 - t) * 14}px)` }}>
              <span style={{ width: 92, flexShrink: 0 }}>
                <Pill tone={i === 3 ? "paypal" : t > 0.5 ? "mint" : "ghost"}>{row.k}</Pill>
              </span>
              <span style={{ fontSize: 24, fontWeight: 650 }}>{row.v}</span>
            </div>
          );
        })}
      </div>
    </Glass>
  );
};

const PayPalSaved = () => (
  <Glass tone="light" style={{ width: 470, padding: "28px 30px" }}>
    <Kicker color={C.paypal}>PayPal, once</Kicker>
    <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6, marginTop: 12, lineHeight: 1.15 }}>Saved once. Every task after funds itself.</div>
    <div style={{ fontSize: 21, color: C.muted, marginTop: 12 }}>Only within the limits Ji-woo set.</div>
  </Glass>
);

const TRIAGE = [
  { q: "K-beauty in Cebu malls", online: true },
  { q: "Korean dog jerky in Manila", online: true },
  { q: "Sunscreen prices, store A", online: false },
  { q: "Sunscreen prices, store B", online: false },
  { q: "K-beauty shelf count", online: false },
];
const Triage = () => {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [s(3.2), s(3.2) + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <Glass style={{ width: 600, padding: "28px 30px" }}>
      <Kicker color={MINT}>Five questions, sorted</Kicker>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
        {TRIAGE.map((r) => (
          <div key={r.q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, opacity: r.online ? 1 - split * 0.35 : 1 }}>
            <span style={{ fontSize: 23, fontWeight: 600 }}>{r.q}</span>
            <span style={{ opacity: split, transform: `translateX(${(1 - split) * 10}px)` }}>{r.online ? <Pill tone="ghost">Found online</Pill> : <Pill tone="mint">To boreal work</Pill>}</span>
          </div>
        ))}
      </div>
    </Glass>
  );
};

const Funded = () => (
  <Glass style={{ width: 480, padding: "26px 30px" }}>
    <Kicker color={MINT}>Funded in one step</Kicker>
    <div style={{ fontFamily: MONO, fontSize: 58, fontWeight: 500, marginTop: 10, letterSpacing: -1 }}>$23.52</div>
    <div style={{ fontSize: 22, fontWeight: 650, marginTop: 4 }}>held by PayPal for 3 Manila tasks</div>
    <div style={{ fontSize: 19, color: "rgba(255,255,255,.72)", marginTop: 8 }}>Charged only when the work passes.</div>
  </Glass>
);

/** Manila: a full-frame illustration while the VO meets the workers. */
const Manila = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 14, s(dur) - 14, s(dur)], [0, 1, 1, 0], clamp);
  const zoom = interpolate(frame, [0, s(dur)], [1.04, 1.12]);
  const card = spring({ frame: frame - 16, fps: FPS, config: { damping: 20 } });
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AbsoluteFill style={{ overflow: "hidden", opacity: o }}>
        <Img src={staticFile("art/manila.png")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transformOrigin: "70% 40%" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: o, background: "linear-gradient(90deg, rgba(8,30,32,.55) 0%, rgba(8,30,32,.15) 45%, transparent 70%)" }} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 140 }}>
        <Fade.Provider value={Math.min(card, 1) * o}>
        <div style={{ transform: `translateY(${(1 - card) * 30}px)` }}>
          <Glass style={{ width: 560, padding: "32px 34px" }}>
            <Kicker color={MINT}>Meanwhile in Manila</Kicker>
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1, marginTop: 14, lineHeight: 1.1 }}>3 tasks just went live nearby.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <Pill tone="mint">Makati</Pill>
              <Pill tone="mint">BGC</Pill>
              <Pill tone="paypal">$5 to $8 each</Pill>
            </div>
          </Glass>
        </div>
        </Fade.Provider>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A light scan across the frame while Hermes checks the proof. */
export const Scan = () => {
  const frame = useCurrentFrame();
  const y = interpolate(frame, [0, s(2.2)], [-10, 110], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const o = interpolate(frame, [0, 6, s(2.2) - 6, s(2.2)], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent ${y - 7}%, rgba(127,224,214,.20) ${y}%, transparent ${y + 1}%)`, opacity: o }} />;
};

const Verdicts = () => (
  <Glass style={{ width: 470, padding: "26px 28px" }}>
    <Kicker color={MINT}>The review</Kicker>
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
      {(
        [
          ["Sunscreen, store A", false],
          ["Sunscreen, store B", false],
          ["K-beauty shelf count", true],
        ] as const
      ).map(([label, pass]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 23, fontWeight: 600, opacity: pass ? 1 : 0.8 }}>{label}</span>
          {pass ? <Pill tone="mint">Passed</Pill> : <Pill tone="red">Failed</Pill>}
        </div>
      ))}
    </div>
  </Glass>
);

const Money = () => {
  const frame = useCurrentFrame();
  const labels = ["Held by PayPal", "Approved", "Paid $5.00"];
  return (
    <Glass style={{ padding: "24px 34px" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        {labels.map((l, i) => {
          const on = interpolate(frame, [s(0.4 + i * 0.9), s(0.4 + i * 0.9) + 8], [0, 1], clamp);
          const last = i === 2;
          return (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              {i > 0 && (
                <span style={{ width: 60, height: 3, borderRadius: 2, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${on * 100}%`, height: "100%", background: MINT }} />
                </span>
              )}
              <span style={{ fontSize: last ? 36 : 28, fontWeight: 800, color: on > 0.5 ? (last ? "#fff" : MINT) : "rgba(255,255,255,.4)", padding: last ? "6px 16px" : 0, borderRadius: 14, background: last && on > 0.5 ? C.paypal : "transparent" }}>{l}</span>
            </span>
          );
        })}
      </div>
    </Glass>
  );
};

/* ---------- The ending: one continuous backdrop from the line to the end card ---------- */

const END_FROM = 153.9;

const Backdrop = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 16], [0, 0.9], clamp);
  const solid = interpolate(frame, [s(171.4 - END_FROM), s(172.2 - END_FROM)], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity: Math.max(o, solid), background: "radial-gradient(120% 90% at 30% 20%, #134a4b 0%, #0a2a2c 45%, #051314 100%)" }} />;
};

const NeverLeft = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const a = spring({ frame: frame - 6, fps: FPS, config: { damping: 22 } });
  const b = spring({ frame: frame - s(2.4), fps: FPS, config: { damping: 22 } });
  const out = interpolate(frame, [s(dur) - 12, s(dur)], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff", opacity: out, textAlign: "center" }}>
      <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2, opacity: a, transform: `translateY(${(1 - a) * 20}px)`, filter: `blur(${(1 - Math.min(a, 1)) * 10}px)` }}>Ji-woo never left Seoul.</div>
      <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2, color: MINT, opacity: b, transform: `translateY(${(1 - b) * 20}px)`, filter: `blur(${(1 - Math.min(b, 1)) * 10}px)` }}>She had many hands.</div>
    </AbsoluteFill>
  );
};

const FIGURES = [
  { n: "$7.8B → $52.6B", label: "AI agent market, 2025 to 2030", src: "MarketsandMarkets, 2025" },
  { n: "154–435M", label: "people already work online", src: "World Bank, Working Without Borders, 2023" },
  { n: "$35.6B", label: "sent home to the Philippines in 2025", src: "Bangko Sentral ng Pilipinas, 2026" },
];
const Figures = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [s(dur) - 12, s(dur)], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 46, fontFamily: FONT, color: "#fff" }}>
      <div style={{ opacity: interpolate(frame, [4, 18], [0, 1], clamp) * out }}>
        <Kicker color={MINT}>Agentic commerce, with real work behind it</Kicker>
      </div>
      <div style={{ display: "flex", gap: 30 }}>
        {FIGURES.map((f, i) => {
          const t = spring({ frame: frame - s(0.6 + i * 1.5), fps: FPS, config: { damping: 20 } });
          return (
            <Fade.Provider key={f.n} value={Math.min(t, 1) * out}>
            <div style={{ transform: `translateY(${(1 - t) * 30}px)` }}>
              <Glass style={{ width: 470, height: 228, padding: "34px 34px", boxSizing: "border-box" }}>
                <div style={{ fontFamily: MONO, fontSize: 44, color: MINT, whiteSpace: "nowrap", letterSpacing: -1.5 }}>{f.n}</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 12 }}>{f.label}</div>
                <div style={{ fontSize: 16, color: "rgba(255,255,255,.6)", marginTop: 12 }}>{f.src}</div>
              </Glass>
            </div>
            </Fade.Provider>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCard = () => {
  const frame = useCurrentFrame();
  const a = spring({ frame: frame - 4, fps: FPS, config: { damping: 22 } });
  const b = spring({ frame: frame - s(1.3), fps: FPS, config: { damping: 22 } });
  const c = interpolate(frame, [s(2.6), s(3.2)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 24, fontFamily: FONT, color: "#fff" }}>
      <div
        style={{
          fontSize: 120,
          fontWeight: 800,
          letterSpacing: -4,
          background: `linear-gradient(120deg, #ffffff 10%, ${MINT} 90%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: a,
          transform: `translateY(${(1 - a) * 24}px)`,
          filter: `blur(${(1 - Math.min(a, 1)) * 10}px)`,
        }}
      >
        boreal work
      </div>
      <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1, opacity: b, transform: `translateY(${(1 - b) * 18}px)` }}>AI agents can think. We give them hands.</div>
      <div style={{ opacity: c, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 26 }}>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,.75)" }}>boreal.work · Built with PayPal · PayPal AI Hackathon 2026</div>
        <div style={{ fontSize: 16, color: "rgba(255,255,255,.5)" }}>Some task photos and counts are illustrative.</div>
      </div>
    </AbsoluteFill>
  );
};

/** The cut itself, blurred behind the ending. */
const Cut = () => {
  const frame = useCurrentFrame();
  const blur = interpolate(frame, [s(END_FROM), s(END_FROM + 0.8)], [0, 16], clamp);
  return (
    <Camera>
      <OffthreadVideo src={staticFile("raw/paypal-demo-raw.mp4")} style={{ filter: blur > 0.1 ? `blur(${blur}px)` : undefined }} />
    </Camera>
  );
};

/* ---------- Music ---------- */

/** Music sits under everything and dips under each spoken line. */
const musicVolume = (f: number) => {
  const t = f / FPS;
  const near = VO_AT.some(([a, b]) => t > a - 0.4 && t < b + 0.4);
  const base = near ? 0.07 : 0.2;
  return base * Math.min(1, t / 2) * Math.max(0, Math.min(1, (179.5 - t) / 3));
};
const vol = (f: number) => {
  let sum = 0;
  for (let i = -6; i <= 6; i++) sum += musicVolume(Math.max(0, f + i));
  return sum / 13;
};

export const Final = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Cut />
    {Array.from({ length: Math.ceil(179.5 / 30) }, (_, i) => (
      <Sequence key={i} from={s(i * 30)} durationInFrames={s(30)}>
        <Audio src={staticFile("sfx/music-bed.mp3")} volume={(f) => vol(f + s(i * 30))} />
      </Sequence>
    ))}

    {/* Who and how */}
    <Beat from={3.4} dur={6.6} style={place("br")} whoosh><JiWoo /></Beat>
    <Beat from={16.2} dur={9.4} style={place("br")} whoosh><Stack /></Beat>
    <Beat from={34.8} dur={3.8} style={place("lc")}><PayPalSaved /></Beat>

    {/* The ask */}
    <Beat from={55.4} dur={10} style={place("rc")} whoosh><Triage /></Beat>
    <Beat from={65.8} dur={7.4} style={place("br")}><Funded /></Beat>

    {/* Manila */}
    <Sequence from={s(78.9)} durationInFrames={s(10.8)}>
      <Manila dur={10.8} />
      <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.3} />
    </Sequence>

    {/* The check and the payout */}
    <Sequence from={s(104.3)} durationInFrames={s(2.4)}><Scan /></Sequence>
    <Beat from={131.6} dur={5.6} style={place("tr")} whoosh><Verdicts /></Beat>
    <Beat from={137.6} dur={6.2} style={place("bc")}><Money /></Beat>
    <Sequence from={s(139.4)} durationInFrames={s(2)}><Audio src={staticFile("sfx/payout-chime.mp3")} volume={0.5} /></Sequence>

    {/* The ending */}
    <Sequence from={s(END_FROM)}>
      <Backdrop />
    </Sequence>
    <Sequence from={s(154.1)} durationInFrames={s(6.3)}><NeverLeft dur={6.3} /></Sequence>
    <Sequence from={s(160.5)} durationInFrames={s(11.1)}><Figures dur={11.1} /></Sequence>
    <Sequence from={s(171.7)}><EndCard /></Sequence>
  </AbsoluteFill>
);
