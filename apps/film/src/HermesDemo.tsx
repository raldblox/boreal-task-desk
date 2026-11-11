
import type React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame } from "remotion";

import { Fade, Glass, Kicker, MINT, Pill } from "./Final";
import { FONT, MONO } from "./theme";

// The Hermes Plugin Hackathon demo: under 90 s, cut from the raw screen recording of the
// borealwork plugin (public/raw/hermes-raw.mp4, 12 min at normal speed). Captions only, no voice.

const FPS = 30;
const s = (t: number) => Math.round(t * FPS);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type At = "top" | "br" | "rc";
type Seg = { id: string; at?: At; from: number; to: number; rate: number; push?: [number, number, number]; caption?: [string, string] };

/** Raw seconds, in order. caption: [kicker, line]. push: [scale, focusX, focusY]. */
const SEGS: Seg[] = [
  { id: "title", from: 0, to: 2.5, rate: 1 },
  { id: "connect", at: "top", from: 2.5, to: 13, rate: 2.5, caption: ["One command", "/borealwork connect links Hermes to boreal.work"] },
  { id: "approve", at: "br", from: 15, to: 57, rate: 9, caption: ["The owner, once", "Approves Hermes, sets its limits, saves PayPal"] },
  { id: "prompt", at: "top", from: 81, to: 87, rate: 1.5, caption: ["The ask", "What do our users' machines look like?"] },
  { id: "research", at: "top", from: 87, to: 122, rate: 8, caption: ["Online first", "Hermes finds what it can on the web by itself"] },
  { id: "funding", at: "top", from: 228, to: 249, rate: 6, caption: ["Only a person can see this", "Hermes posts a task: send your real PC specs"] },
  { id: "guard", at: "rc", from: 258, to: 267, rate: 1.2, push: [1.3, 360, 900], caption: ["Spend guard", "Funding $6.25 stops for your approval first"] },
  { id: "funded", at: "top", from: 273, to: 288, rate: 2.5, caption: ["Held, not charged", "$6.25 waits in escrow until the work passes"] },
  { id: "claim", at: "br", from: 384, to: 408, rate: 4, caption: ["A verified person", "Finds the task and claims it"] },
  { id: "submit", at: "br", from: 472, to: 484, rate: 3, caption: ["The work", "Their machine's specs, no personal details"] },
  { id: "verdict", at: "br", from: 615, to: 636, rate: 3.5, push: [1.15, 640, 600], caption: ["Reviewed", "Passed against the criteria and the public rulebook"] },
  { id: "report", at: "top", from: 666, to: 690, rate: 4, caption: ["Back to Hermes", "It reads the result and tells you what it means"] },
  { id: "release", at: "top", from: 690, to: 705, rate: 3, caption: ["Pay now", "\"Release it now\": Hermes accepts the pass"] },
  { id: "paid", at: "br", from: 712, to: 717.5, rate: 1, push: [1.45, 1450, 380], caption: ["Done", "The worker is paid $5.00"] },
];

const segDur = (g: Seg) => (g.to - g.from) / g.rate;
const START: Record<string, number> = {};
let END_AT = 0;
for (const g of SEGS) {
  START[g.id] = END_AT;
  END_AT += segDur(g);
}
const END_CARD = 6;
export const HERMES_DEMO_SECONDS = Math.ceil((END_AT + END_CARD) * 10) / 10;
export const HERMES_DEMO_FRAMES = s(HERMES_DEMO_SECONDS);

const Segment = ({ g }: { g: Seg }) => {
  const frame = useCurrentFrame();
  const dur = segDur(g);
  let scale = 1;
  let ox = 960;
  let oy = 540;
  if (g.push) {
    const [k, x, y] = g.push;
    const p = interpolate(frame, [s(0.2), s(Math.min(1.2, dur / 3))], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    scale = 1 + (k - 1) * p;
    ox = x;
    oy = y;
  }
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox}px ${oy}px`, background: "#000" }}>
      <OffthreadVideo src={staticFile("raw/hermes-raw.mp4")} muted startFrom={Math.round(g.from * FPS)} playbackRate={g.rate} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};

/** Where a card sits: chosen per shot so it lands on empty space (Hermes's tab strip, the trees on boreal.work). */
const AT: Record<At, React.CSSProperties> = {
  top: { justifyContent: "flex-start", alignItems: "flex-end", padding: "14px 250px 0 0" },
  br: { justifyContent: "flex-end", alignItems: "flex-end", padding: "0 60px 60px 0" },
  rc: { justifyContent: "center", alignItems: "flex-end", padding: "0 70px 0 0" },
};

const Caption = ({ dur, kicker, line, at = "br", rate }: { dur: number; kicker: string; line: string; at?: At; rate: number }) => {
  const frame = useCurrentFrame();
  const t = spring({ frame, fps: FPS, config: { damping: 20 } });
  const out = interpolate(frame, [s(dur) - 8, s(dur)], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ ...AT[at], fontFamily: FONT, pointerEvents: "none" }}>
      <Fade.Provider value={Math.min(t, 1) * out}>
        <div style={{ transform: `translateY(${(1 - t) * 14}px)` }}>
          <Glass style={{ padding: "12px 20px", maxWidth: 620, backgroundColor: "rgba(8,26,28,.42)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Kicker color={MINT}>{kicker}</Kicker>
              {rate >= 3 && <span style={{ fontFamily: MONO, fontSize: 14, color: "rgba(255,255,255,.7)" }}>▶▶ {Math.round(rate)}×</span>}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, marginTop: 4, lineHeight: 1.2 }}>{line}</div>
          </Glass>
        </div>
      </Fade.Provider>
    </AbsoluteFill>
  );
};

const Title = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const a = spring({ frame: frame - 2, fps: FPS, config: { damping: 22 } });
  const out = interpolate(frame, [s(dur) - 8, s(dur)], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120, fontFamily: FONT, color: "#fff", opacity: out }}>
      <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.5, opacity: a, transform: `translateY(${(1 - a) * 16}px)`, textAlign: "center" }}>
        Hermes can search the web.
        <br />
        <span style={{ color: MINT }}>Now it can hire a verified human.</span>
      </div>
    </AbsoluteFill>
  );
};

const EndCard = () => {
  const frame = useCurrentFrame();
  const a = spring({ frame: frame - 4, fps: FPS, config: { damping: 22 } });
  const b = spring({ frame: frame - s(1), fps: FPS, config: { damping: 22 } });
  const c = interpolate(frame, [s(1.8), s(2.4)], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 30% 20%, #134a4b 0%, #0a2a2c 45%, #051314 100%)", alignItems: "center", justifyContent: "center", gap: 22, fontFamily: FONT, color: "#fff" }}>
      <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -3.5, background: `linear-gradient(120deg, #ffffff 10%, ${MINT} 90%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
        boreal.work for Hermes
      </div>
      <div style={{ fontSize: 36, fontWeight: 650, opacity: b }}>Verified human hands, with a spend guard you control.</div>
      <div style={{ opacity: c, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 14 }}>
        <Pill tone="mint">hermes plugins install raldblox/hermes-boreal</Pill>
        <div style={{ fontSize: 17, color: "rgba(255,255,255,.55)" }}>Recorded on testnet.boreal.work with the PayPal sandbox, sped up where marked.</div>
      </div>
    </AbsoluteFill>
  );
};

const vol = (f: number) => 0.18 * Math.min(1, f / s(1.5)) * Math.max(0, Math.min(1, (HERMES_DEMO_FRAMES - f) / s(2.5)));

export const HermesDemo = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {SEGS.map((g) => (
      <Sequence key={g.id} from={s(START[g.id]!)} durationInFrames={s(segDur(g)) + 1}>
        <Segment g={g} />
        {g.caption && <Caption dur={segDur(g)} kicker={g.caption[0]} line={g.caption[1]} at={g.at} rate={g.rate} />}
        {g.id === "title" && <Title dur={segDur(g)} />}
      </Sequence>
    ))}
    {Array.from({ length: Math.ceil(HERMES_DEMO_SECONDS / 30) }, (_, i) => (
      <Sequence key={`m${i}`} from={s(i * 30)} durationInFrames={s(30)}>
        <Audio src={staticFile("sfx/music-bed.mp3")} volume={(f) => vol(f + s(i * 30))} />
      </Sequence>
    ))}
    <Sequence from={s(START["guard"]! + 0.4)} durationInFrames={s(1)}>
      <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.3} />
    </Sequence>
    <Sequence from={s(START["paid"]! + 0.6)} durationInFrames={s(2)}>
      <Audio src={staticFile("sfx/payout-chime.mp3")} volume={0.5} />
    </Sequence>
    <Sequence from={s(END_AT)}>
      <EndCard />
    </Sequence>
  </AbsoluteFill>
);

