import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { C, FONT, MONO } from "./theme";

// The edited cut (Clipchamp, VO already in) with motion graphics, music and sound on top.
// Times are seconds in that cut; the VO cues were found by matching its audio to public/vo.

const FPS = 30;
const s = (t: number) => Math.round(t * FPS);
export const FINAL_FRAMES = s(179.5);

/** Where each VO line plays in the cut [start, end], for ducking the music. */
const VO_AT: [number, number][] = [
  [0.8, 8.2], [9, 13.6], [16.2, 25.8], [39.1, 45.3], [46.3, 53.8], [55.2, 65.3], [65.7, 71.2], [78.8, 89.6],
  [104.3, 110.6], [115.7, 116.8], [128.9, 131.6], [137.6, 143.3], [154.1, 159.5], [160.6, 170.3], [171.9, 177.2],
];

/** Shows children from `from` for `dur` seconds, springing in and fading out. */
const Beat = ({ from, dur, children, style, whoosh = false }: { from: number; dur: number; children: ReactNode; style?: CSSProperties; whoosh?: boolean }) => (
  <Sequence from={s(from)} durationInFrames={s(dur)} layout="none">
    <Pop dur={dur} style={style}>
      {children}
    </Pop>
    {whoosh && <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.35} />}
  </Sequence>
);

const Pop = ({ dur, children, style }: { dur: number; children: ReactNode; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 18, mass: 0.7 } });
  const out = interpolate(frame, [s(dur) - 10, s(dur)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none", fontFamily: FONT, color: C.ink, ...style }}>
      <div style={{ opacity: Math.min(t, 1) * out, transform: `translateY(${(1 - t) * 26}px) scale(${0.96 + 0.04 * t})` }}>{children}</div>
    </AbsoluteFill>
  );
};

const glass: CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  borderRadius: 22,
  boxShadow: "0 30px 70px -28px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.6)",
  backdropFilter: "blur(14px)",
};

const Kicker = ({ children, color = C.teal }: { children: ReactNode; color?: string }) => (
  <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: 2.5, textTransform: "uppercase", color }}>{children}</div>
);

/** A lower-third label: kicker over one line. */
const Lower = ({ kicker, line, color }: { kicker: string; line: string; color?: string }) => (
  <div style={{ ...glass, padding: "18px 26px", display: "inline-flex", flexDirection: "column", gap: 6 }}>
    <Kicker color={color}>{kicker}</Kicker>
    <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.3 }}>{line}</div>
  </div>
);

const Chip = ({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "paypal" | "red" | "muted" }) => {
  const fg = { teal: C.teal, paypal: C.paypal, red: C.red, muted: C.muted }[tone];
  const bg = { teal: C.tealWash, paypal: "#e8f2fd", red: C.redWash, muted: "#f1f4f4" }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 18px", borderRadius: 999, background: bg, color: fg, fontSize: 22, fontWeight: 650 }}>{children}</span>;
};

const corner = (where: "bl" | "br" | "tr" | "tl" | "bc"): CSSProperties =>
  ({
    bl: { justifyContent: "flex-end", alignItems: "flex-start", padding: "0 0 70px 70px" },
    br: { justifyContent: "flex-end", alignItems: "flex-end", padding: "0 70px 70px 0" },
    tr: { justifyContent: "flex-start", alignItems: "flex-end", padding: "90px 70px 0 0" },
    tl: { justifyContent: "flex-start", alignItems: "flex-start", padding: "90px 0 0 70px" },
    bc: { justifyContent: "flex-end", alignItems: "center", padding: "0 0 64px 0" },
  })[where];

/* Opening: two cities, then Ji-woo. */
const Cities = () => (
  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
    <Chip>● Seoul · 21:40</Chip>
    <span style={{ color: "#fff", fontSize: 26, opacity: 0.8 }}>⟶</span>
    <Chip tone="paypal">● Manila · 20:40</Chip>
  </div>
);

const Profile = () => (
  <div style={{ ...glass, padding: 24, display: "flex", gap: 22, alignItems: "center", width: 560 }}>
    <div style={{ width: 92, height: 92, borderRadius: 46, background: `linear-gradient(135deg, ${C.tealSoft}, ${C.teal})`, display: "grid", placeItems: "center", color: "#fff", fontSize: 36, fontWeight: 800 }}>JW</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Kicker>Meet</Kicker>
      <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>Ji-woo Kim</div>
      <div style={{ fontSize: 22, color: C.muted }}>Founder, K-beauty brand · Seoul</div>
      <div style={{ marginTop: 6 }}>
        <Chip tone="paypal">Launching in Manila next month</Chip>
      </div>
    </div>
  </div>
);

/* Setup: what Hermes plugs into, one layer at a time. */
const STACK = [
  { at: 0.4, k: "Skill", v: "Reads boreal work's agents.md" },
  { at: 2.6, k: "Tools", v: "Connects over MCP" },
  { at: 4.8, k: "Owner", v: "One approval from Ji-woo" },
  { at: 7.0, k: "PayPal", v: "Limits she sets: $10 a task, $50 a day" },
];
const Stack = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...glass, padding: "24px 28px", width: 520, display: "flex", flexDirection: "column", gap: 16 }}>
      <Kicker>How Hermes plugs in</Kicker>
      {STACK.map((row, i) => {
        const t = interpolate(frame, [s(row.at), s(row.at) + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={row.k} style={{ display: "flex", gap: 16, alignItems: "center", opacity: t, transform: `translateX(${(1 - t) * 20}px)` }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: i === 3 ? C.paypal : C.teal, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18 }}>{i + 1}</span>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 15, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>{row.k}</div>
              <div style={{ fontSize: 24, fontWeight: 650 }}>{row.v}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* The triage: what an agent can find, and what needs a person. */
const Triage = () => {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [s(3.4), s(3.4) + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const rows = [
    { q: "K-beauty in Cebu malls", online: true },
    { q: "Korean dog jerky in Manila", online: true },
    { q: "Sunscreen prices · store A", online: false },
    { q: "Sunscreen prices · store B", online: false },
    { q: "K-beauty shelf count", online: false },
  ];
  return (
    <div style={{ ...glass, padding: "24px 26px", width: 560, display: "flex", flexDirection: "column", gap: 12 }}>
      <Kicker>Five questions, sorted</Kicker>
      {rows.map((r) => (
        <div key={r.q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, opacity: r.online ? 1 - split * 0.25 : 1 }}>
          <span style={{ fontSize: 22, fontWeight: 600 }}>{r.q}</span>
          <span style={{ opacity: split }}>{r.online ? <Chip tone="muted">Online · free</Chip> : <Chip>→ boreal work</Chip>}</span>
        </div>
      ))}
    </div>
  );
};

/* Task status strip for the worker side. */
const Status = () => {
  const frame = useCurrentFrame();
  const steps = ["Open", "Claimed", "Submitted"];
  return (
    <div style={{ ...glass, padding: "18px 24px", display: "flex", gap: 12, alignItems: "center" }}>
      <Kicker>Task</Kicker>
      {steps.map((st, i) => {
        const on = frame > s(0.6 + i * 2.4);
        return (
          <span key={st} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {i > 0 && <span style={{ width: 34, height: 3, borderRadius: 2, background: on ? C.teal : C.border }} />}
            <Chip tone={on ? "teal" : "muted"}>{st}</Chip>
          </span>
        );
      })}
      <span style={{ marginLeft: 8 }}>
        <Chip tone="paypal">Earns $5–$8</Chip>
      </span>
    </div>
  );
};

/* A light scan across the frame while Hermes checks the proof. */
const Scan = () => {
  const frame = useCurrentFrame();
  const y = interpolate(frame, [0, s(2.2)], [-10, 110], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const o = interpolate(frame, [0, 6, s(2.2) - 6, s(2.2)], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent ${y - 6}%, rgba(80,220,215,.22) ${y}%, transparent ${y + 1}%)`, opacity: o }} />;
};

const Verdicts = () => (
  <div style={{ ...glass, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12, width: 470 }}>
    <Kicker>Hermes's review</Kicker>
    {[
      ["Sunscreen · store A", false],
      ["Sunscreen · store B", false],
      ["K-beauty shelf count", true],
    ].map(([label, pass]) => (
      <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 23, fontWeight: 600 }}>{label}</span>
        {pass ? <Chip>✓ Passed</Chip> : <Chip tone="red">✕ Failed</Chip>}
      </div>
    ))}
  </div>
);

/* Held → Approved → Paid, the money moment. */
const Money = () => {
  const frame = useCurrentFrame();
  const labels = ["Held by PayPal", "Approved", "Paid $5.00"];
  return (
    <div style={{ ...glass, padding: "22px 30px", display: "flex", gap: 16, alignItems: "center" }}>
      {labels.map((l, i) => {
        const on = interpolate(frame, [s(0.4 + i * 0.9), s(0.4 + i * 0.9) + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const last = i === 2;
        return (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {i > 0 && <span style={{ width: 54, height: 3, borderRadius: 2, background: C.border, overflow: "hidden" }}><span style={{ display: "block", width: `${on * 100}%`, height: "100%", background: C.teal }} /></span>}
            <span style={{ fontSize: last ? 34 : 28, fontWeight: 750, color: on > 0.5 ? (last ? C.paypal : C.teal) : C.muted, transform: `scale(${last ? 1 + on * 0.06 : 1})` }}>{l}</span>
          </span>
        );
      })}
    </div>
  );
};

/* Dims the cut behind full-frame titles. */
const Dim = ({ dur, amount = 0.72 }: { dur: number; amount?: number }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 14, s(dur) - 14, s(dur)], [0, amount, amount, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: C.bg, opacity: o }} />;
};

const FIGURES = [
  { n: "$7.8B → $52.6B", label: "AI agent market, 2025 to 2030", src: "MarketsandMarkets (2025)" },
  { n: "154–435M", label: "people already work online", src: "World Bank, Working Without Borders (2023)" },
  { n: "$35.6B", label: "sent home to the Philippines in 2025", src: "Bangko Sentral ng Pilipinas (2026)" },
];
const Figures = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, fontFamily: FONT, color: C.ink }}>
      <div style={{ opacity: interpolate(frame, [6, 20], [0, 1], { extrapolateRight: "clamp" }) }}>
        <Kicker>Agentic commerce, with real work behind it</Kicker>
      </div>
      <div style={{ display: "flex", gap: 34 }}>
        {FIGURES.map((f, i) => {
          const t = spring({ frame: frame - s(0.6 + i * 1.6), fps: FPS, config: { damping: 20 } });
          return (
            <div key={f.n} style={{ ...glass, width: 470, padding: "30px 32px", opacity: t, transform: `translateY(${(1 - t) * 30}px)` }}>
              <div style={{ fontFamily: MONO, fontSize: 48, color: C.teal, whiteSpace: "nowrap" }}>{f.n}</div>
              <div style={{ fontSize: 26, fontWeight: 650, marginTop: 10 }}>{f.label}</div>
              <div style={{ fontSize: 16, color: C.muted, marginTop: 10 }}>{f.src}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCard = () => {
  const frame = useCurrentFrame();
  const a = spring({ frame, fps: FPS, config: { damping: 22 } });
  const b = spring({ frame: frame - s(1.2), fps: FPS, config: { damping: 22 } });
  const c = interpolate(frame, [s(2.4), s(3)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", gap: 22, fontFamily: FONT, color: C.ink, opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2.5, color: C.teal, opacity: a, transform: `translateY(${(1 - a) * 24}px)` }}>boreal work</div>
      <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1, opacity: b, transform: `translateY(${(1 - b) * 18}px)` }}>AI agents can think. We give them hands.</div>
      <div style={{ opacity: c, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 18 }}>
        <div style={{ fontSize: 24, color: C.muted }}>boreal.work · Built with PayPal · PayPal AI Hackathon 2026</div>
        <div style={{ fontSize: 16, color: C.muted }}>Some task photos and counts are illustrative.</div>
      </div>
    </AbsoluteFill>
  );
};

/** The cut itself, softly blurred behind the closing titles. */
const BlurredCut = () => {
  const frame = useCurrentFrame();
  const blur = interpolate(frame, [s(154), s(155), s(171.6), s(172.2)], [0, 10, 10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <OffthreadVideo src={staticFile("raw/paypal-demo-raw.mp4")} style={{ filter: blur > 0.1 ? `blur(${blur}px)` : undefined }} />;
};

/** Music sits under everything and dips under each spoken line. */
const musicVolume = (f: number) => {
  const t = f / FPS;
  const near = VO_AT.some(([a, b]) => t > a - 0.4 && t < b + 0.4);
  const base = near ? 0.07 : 0.2;
  const fadeIn = Math.min(1, t / 2);
  const fadeOut = Math.min(1, (179.5 - t) / 3);
  return base * fadeIn * Math.max(0, fadeOut);
};

export const Final = () => {
  // Smooth the ducking over ~0.4 s so the music never jumps.
  const vol = (f: number) => {
    let sum = 0;
    for (let i = -6; i <= 6; i++) sum += musicVolume(Math.max(0, f + i));
    return sum / 13;
  };
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <BlurredCut />
      {Array.from({ length: Math.ceil(179.5 / 30) }, (_, i) => (
        <Sequence key={i} from={s(i * 30)} durationInFrames={s(30)}>
          <Audio src={staticFile("sfx/music-bed.mp3")} volume={(f) => vol(f + s(i * 30))} />
        </Sequence>
      ))}

      {/* Opening */}
      <Beat from={0.9} dur={7.4} style={corner("tl")}><Cities /></Beat>
      <Beat from={3.6} dur={6.4} style={corner("bl")} whoosh><Profile /></Beat>
      <Beat from={9} dur={4.8} style={corner("br")}><Lower kicker="Her AI agent" line="Hermes, on her desktop" /></Beat>

      {/* Setup */}
      <Beat from={16.2} dur={9.4} style={corner("br")} whoosh><Stack /></Beat>
      <Beat from={25.2} dur={4.4} style={corner("bl")}><Lower kicker="Sign in" line="Log in with PayPal" color={C.paypal} /></Beat>
      <Beat from={30} dur={4.6} style={corner("bl")}><Lower kicker="boreal work" line="Hermes approved, within her limits" /></Beat>
      <Beat from={35} dur={3.6} style={corner("bl")}><Lower kicker="PayPal" line="Connected once. No card to re-enter." color={C.paypal} /></Beat>

      {/* The ask */}
      <Beat from={39.1} dur={6.4} style={corner("bl")}><Lower kicker="Ji-woo" line="Her voice note to Hermes" /></Beat>
      <Beat from={46.4} dur={7.6} style={corner("br")}><Lower kicker="Before it spends" line="Hermes asks: which mall, how long, what counts" /></Beat>
      <Beat from={55.4} dur={10} style={corner("br")} whoosh><Triage /></Beat>
      <Beat from={65.8} dur={8} style={corner("br")}>
        <div style={{ ...glass, padding: "22px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Kicker color={C.paypal}>Funded in one step</Kicker>
          <div style={{ fontSize: 32, fontWeight: 750 }}>3 tasks · $23.52 held by PayPal</div>
          <div style={{ fontSize: 21, color: C.muted }}>Charged only when the work passes</div>
        </div>
      </Beat>

      {/* Manila */}
      <Beat from={78.9} dur={10.6} style={corner("bl")} whoosh>
        <div style={{ ...glass, padding: "22px 28px", display: "flex", flexDirection: "column", gap: 10, width: 520 }}>
          <Kicker color={C.paypal}>Manila · Makati &amp; BGC</Kicker>
          <div style={{ fontSize: 30, fontWeight: 750 }}>Already out for the day</div>
          <div style={{ fontSize: 21, color: C.muted }}>Errands, coffee, a ride home. A few minutes on a task, paid through PayPal.</div>
        </div>
      </Beat>
      <Beat from={89.8} dur={11} style={corner("tr")}><Status /></Beat>

      {/* The check */}
      <Sequence from={s(104.3)} durationInFrames={s(2.4)}><Scan /></Sequence>
      <Beat from={104.6} dur={6.2} style={corner("br")}><Lower kicker="Proof check" line="Two photos don't hold up" color={C.red} /></Beat>
      <Beat from={115.5} dur={3} style={corner("bl")}><Lower kicker="Ji-woo" line="“Let me see them.”" /></Beat>
      <Beat from={128.8} dur={3} style={corner("bl")}><Lower kicker="Ji-woo" line="“Pass that one.”" /></Beat>
      <Beat from={131.6} dur={5.6} style={corner("tr")} whoosh><Verdicts /></Beat>

      {/* Paid */}
      <Beat from={137.6} dur={6.2} style={corner("bc")}><Money /></Beat>
      <Sequence from={s(139.4)} durationInFrames={s(2)}><Audio src={staticFile("sfx/payout-chime.mp3")} volume={0.5} /></Sequence>
      <Beat from={150} dur={4} style={corner("tr")}><Lower kicker="Worker" line="Paid $5.00 via PayPal" color={C.paypal} /></Beat>

      {/* Never left Seoul */}
      <Sequence from={s(154)} durationInFrames={s(6.3)}>
        <Dim dur={6.3} amount={0.9} />
        <Pop dur={6.3} style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", fontSize: 70, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.15 }}>
            Ji-woo never left Seoul.
            <br />
            <span style={{ color: C.teal }}>She had many hands.</span>
          </div>
        </Pop>
      </Sequence>

      {/* The market */}
      <Sequence from={s(160.4)} durationInFrames={s(11.4)}>
        <Dim dur={11.4} amount={0.9} />
        <Figures />
      </Sequence>

      {/* End card */}
      <Sequence from={s(171.6)}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
