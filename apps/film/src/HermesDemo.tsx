
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame } from "remotion";

import { Fade, Glass, Kicker, MINT, Pill } from "./Final";
import { FONT, MONO } from "./theme";

// The Hermes Plugin Hackathon demo: under 90 s, cut from the raw screen recording of the
// borealwork plugin (public/raw/hermes-raw.mp4, 12 min at normal speed). Captions only, no voice.

const FPS = 30;
const s = (t: number) => Math.round(t * FPS);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Seg = { id: string; from: number; to: number; rate: number; push?: [number, number, number]; caption?: [string, string] };

/** Raw seconds, in order. caption: [kicker, line]. push: [scale, focusX, focusY]. */
const SEGS: Seg[] = [
  { id: "title", from: 0, to: 2.5, rate: 1 },
  { id: "connect", from: 2.5, to: 13, rate: 2.5, caption: ["One command", "/borealwork connect links Hermes to boreal.work"] },
  { id: "approve", from: 15, to: 57, rate: 9, caption: ["The owner, once", "Approves Hermes, sets its limits, saves PayPal"] },
  { id: "prompt", from: 81, to: 87, rate: 1.5, caption: ["The ask", "What do our users' machines look like?"] },
  { id: "research", from: 87, to: 122, rate: 8, caption: ["Online first", "Hermes finds what it can on the web by itself"] },
  { id: "funding", from: 228, to: 249, rate: 6, caption: ["Only a person can see this", "Hermes posts a task: send your real PC specs"] },
  { id: "guard", from: 258, to: 267, rate: 1.2, push: [1.3, 360, 900], caption: ["Spend guard", "Funding $6.25 stops for your approval first"] },
  { id: "funded", from: 273, to: 288, rate: 2.5, caption: ["Held, not charged", "$6.25 waits in escrow until the work passes"] },
  { id: "claim", from: 384, to: 408, rate: 4, caption: ["A verified person", "Finds the task and claims it"] },
  { id: "submit", from: 472, to: 484, rate: 3, caption: ["The work", "Their machine's specs, no personal details"] },
  { id: "verdict", from: 615, to: 636, rate: 3.5, push: [1.3, 700, 640], caption: ["Reviewed", "Passed against the criteria and the public rulebook"] },
  { id: "report", from: 666, to: 690, rate: 4, caption: ["Back to Hermes", "It reads the result and tells you what it means"] },
  { id: "release", from: 690, to: 705, rate: 3, caption: ["Pay now", "\"Release it now\": Hermes accepts the pass"] },
  { id: "paid", from: 712, to: 717.5, rate: 1, push: [1.45, 1450, 380], caption: ["Done", "The worker is paid $5.00"] },
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
    <div style={{ position: "absolute", left: FRAME.left, top: FRAME.top, width: 1920, height: 1080, transform: `scale(${FRAME.scale})`, transformOrigin: "0 0", overflow: "hidden", borderRadius: 18 / FRAME.scale, boxShadow: "0 30px 80px -30px rgba(0,0,0,.8)", background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox}px ${oy}px` }}>
        <OffthreadVideo src={staticFile("raw/hermes-raw.mp4")} muted startFrom={Math.round(g.from * FPS)} playbackRate={g.rate} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
    </div>
  );
};

/** The recording sits in a frame at the top; captions get their own band below it, so they never cover the UI. */
const FRAME = { scale: 0.84, left: (1920 - 1920 * 0.84) / 2, top: 30 };
const BAND_TOP = FRAME.top + 1080 * FRAME.scale + 8;

const Speed = ({ rate }: { rate: number }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: BAND_TOP, bottom: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", paddingRight: FRAME.left }}>
    <div style={{ fontFamily: MONO, fontSize: 20, color: "#fff", background: "rgba(8,26,28,.72)", border: "1px solid rgba(255,255,255,.25)", padding: "6px 12px", borderRadius: 10 }}>▶▶ {Math.round(rate)}×</div>
  </div>
);

const Caption = ({ dur, kicker, line }: { dur: number; kicker: string; line: string }) => {
  const frame = useCurrentFrame();
  const t = spring({ frame, fps: FPS, config: { damping: 20 } });
  const out = interpolate(frame, [s(dur) - 8, s(dur)], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: BAND_TOP, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", fontFamily: FONT, color: "#fff", opacity: Math.min(t, 1) * out }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, transform: `translateY(${(1 - t) * 10}px)` }}>
        <Kicker color={MINT}>{kicker}</Kicker>
        <div style={{ fontSize: 38, fontWeight: 750, letterSpacing: -0.6 }}>{line}</div>
      </div>
    </div>
  );
};

const Title = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const a = spring({ frame: frame - 2, fps: FPS, config: { damping: 22 } });
  const out = interpolate(frame, [s(dur) - 8, s(dur)], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: BAND_TOP, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center", fontFamily: FONT, color: "#fff", opacity: Math.min(a, 1) * out }}>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.8 }}>
        Hermes can search the web. <span style={{ color: MINT }}>Now it can hire a verified human.</span>
      </div>
    </div>
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
  <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 30% 10%, #134a4b 0%, #0a2a2c 45%, #051314 100%)" }}>
    {SEGS.map((g) => (
      <Sequence key={g.id} from={s(START[g.id]!)} durationInFrames={s(segDur(g)) + 1}>
        <Segment g={g} />
        {g.rate >= 3 && <Speed rate={g.rate} />}
        {g.caption && <Caption dur={segDur(g)} kicker={g.caption[0]} line={g.caption[1]} />}
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

