import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame } from "remotion";

import { Beat, Fade, Glass, Kicker, MINT, Pill, place, Scan } from "./Final";
import { C, FONT, MONO } from "./theme";

// The NEAR film: a 3-minute cut of the NEAR testnet run (public/raw/near-raw.mp4, 16 min at normal
// speed) plus the agent page clip. Separate from the PayPal film (Final.tsx), which stays as it was.
// Every segment is [from, to] seconds in its source, played at `rate`; the cut is their sum.

const FPS = 30;
const s = (t: number) => Math.round(t * FPS);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Seg = { id: string; src?: "agent"; from: number; to: number; rate: number; push?: [number, number, number]; blur?: boolean };

/** The cut, in order. push: [scale, focusX, focusY] on the 1920×1080 frame. */
const SEGS: Seg[] = [
  { id: "title", from: 0, to: 3, rate: 0.5 },
  { id: "hi", from: 3, to: 10, rate: 1 },
  { id: "agentPage", src: "agent", from: 0, to: 6.9, rate: 1 },
  { id: "clarify", from: 27, to: 57, rate: 5 },
  { id: "research", from: 60, to: 99, rate: 7 },
  { id: "plan", from: 99, to: 123, rate: 4, push: [1.25, 760, 640] },
  { id: "payAsk", from: 123.5, to: 130, rate: 1.2 },
  { id: "setup", from: 130, to: 174, rate: 11 },
  { id: "approve", from: 174, to: 192, rate: 3 },
  { id: "fund", from: 192, to: 231, rate: 4.33, push: [1.3, 960, 640] },
  { id: "explorer", from: 231, to: 252, rate: 4.2 },
  { id: "go", from: 255, to: 264, rate: 3 },
  { id: "paying", from: 264, to: 507, rate: 24.3 },
  { id: "posted", from: 507, to: 519, rate: 2, push: [1.3, 760, 380] },
  { id: "screen", from: 522, to: 552, rate: 2.14, blur: true },
  { id: "trail", from: 564, to: 585, rate: 2.625 },
  { id: "findTask", from: 588, to: 600, rate: 2 },
  { id: "workerWallet", from: 603, to: 672, rate: 8.625 },
  { id: "claim", from: 672, to: 696, rate: 4 },
  { id: "photos", from: 759, to: 819, rate: 10 },
  { id: "failA", from: 819, to: 825, rate: 1.5 },
  { id: "failB", from: 840, to: 854, rate: 2, push: [1.3, 640, 520] },
  { id: "proof", from: 866, to: 878, rate: 1.7, push: [1.55, 560, 780] },
  { id: "paid", from: 894, to: 906, rate: 1.5, push: [1.35, 900, 380] },
  { id: "end", from: 905, to: 908, rate: 0.15, blur: true },
];

const segDur = (g: Seg) => (g.to - g.from) / g.rate;
const START: Record<string, number> = {};
{
  let t = 0;
  for (const g of SEGS) {
    START[g.id] = t;
    t += segDur(g);
  }
}
const at = (id: string, plus = 0) => START[id]! + plus;
const END_AT = at("end");
export const NEAR_FILM_SECONDS = 180;
export const NEAR_FILM_FRAMES = s(NEAR_FILM_SECONDS);
// The last segment runs to the end of the film.
SEGS[SEGS.length - 1]!.to = SEGS[SEGS.length - 1]!.from + (NEAR_FILM_SECONDS - END_AT) * SEGS[SEGS.length - 1]!.rate;

/* ---------- Voice ---------- */

const VO: { file: string; at: number; dur: number }[] = [
  { file: "hookAgents", at: at("title", 0.3), dur: 5.76 },
  { file: "hiLaunch", at: at("hi", 0.6), dur: 4.88 },
  { file: "skillAsks", at: at("agentPage", 0.4), dur: 7.52 },
  { file: "triage", at: at("research", 0.3), dur: 10.08 },
  { file: "payNear", at: at("payAsk", 1.2), dur: 3.6 },
  { file: "ownWallet", at: at("setup", 0.3), dur: 8 },
  { file: "paysItself", at: at("paying", 0.4), dur: 7.68 },
  { file: "privateScreen", at: at("screen", 0.5), dur: 12.08 },
  { file: "hashedTrail", at: at("trail", 1), dur: 4.08 },
  { file: "workersNear", at: at("findTask", 0.4), dur: 7.52 },
  { file: "checkedPrivate", at: at("failA", 0.2), dur: 10.16 },
  { file: "signed", at: at("proof", 0.4), dur: 5.76 },
  { file: "paidPasses", at: at("paid", 1), dur: 4.24 },
  { file: "closeNear", at: at("end", 0.6), dur: 7.6 },
  { file: "tagline", at: at("end", 11.2), dur: 5.2 },
];

/* ---------- Picture ---------- */

const Segment = ({ g }: { g: Seg }) => {
  const frame = useCurrentFrame();
  const dur = segDur(g);
  let scale = 1;
  let ox = 960;
  let oy = 540;
  if (g.push) {
    const [k, x, y] = g.push;
    const ramp = Math.min(1.2, dur / 3);
    const p = interpolate(frame, [s(0.3), s(0.3 + ramp), s(dur - 0.4), s(dur)], [0, 1, 1, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    scale = 1 + (k - 1) * p;
    ox = x;
    oy = y;
  }
  const blur = g.blur ? interpolate(frame, [0, 14], [0, 14], clamp) : 0;
  const src = g.src === "agent" ? "raw/agent-page.mp4" : "raw/near-raw.mp4";
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox}px ${oy}px`, background: "#000" }}>
      <OffthreadVideo
        src={staticFile(src)}
        muted
        startFrom={Math.round(g.from * FPS)}
        playbackRate={g.rate}
        style={{ width: "100%", height: "100%", objectFit: "cover", filter: blur > 0.1 ? `blur(${blur}px) brightness(.8)` : undefined }}
      />
    </AbsoluteFill>
  );
};

/** A small honest badge on sped-up stretches. */
const Speed = ({ rate }: { rate: number }) => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: "36px 44px 0 0", pointerEvents: "none" }}>
    <div style={{ fontFamily: MONO, fontSize: 22, color: "#fff", background: "rgba(8,26,28,.7)", border: "1px solid rgba(255,255,255,.25)", padding: "8px 14px", borderRadius: 12 }}>▶▶ {Math.round(rate)}×</div>
  </AbsoluteFill>
);

/* ---------- Cards ---------- */

const Row = ({ k, v, tone = "mint" }: { k: ReactNode; v: ReactNode; tone?: "mint" | "ghost" | "red" | "teal" }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 }}>
    <span style={{ fontSize: 23, fontWeight: 600 }}>{k}</span>
    <Pill tone={tone}>{v}</Pill>
  </div>
);

const Card = ({ kicker, title, children, width = 560 }: { kicker: string; title?: ReactNode; children?: ReactNode; width?: number }) => (
  <Glass style={{ width, padding: "28px 30px" }}>
    <Kicker color={MINT}>{kicker}</Kicker>
    {title && <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.8, marginTop: 12, lineHeight: 1.15 }}>{title}</div>}
    {children && <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>{children}</div>}
  </Glass>
);

const JiWoo = () => (
  <Glass style={{ width: 560, padding: 28 }}>
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <div style={{ width: 120, height: 120, borderRadius: 60, overflow: "hidden", boxShadow: "0 0 0 3px rgba(255,255,255,.55)", flexShrink: 0 }}>
        <Img src={staticFile("art/jiwoo.png")} style={{ width: "150%", marginLeft: "-25%", marginTop: "-6%" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Kicker color={MINT}>Meet</Kicker>
        <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>Ji-woo Kim</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,.78)" }}>Founder of a K-beauty brand</div>
        <div style={{ marginTop: 6 }}>
          <Pill tone="mint">Launching abroad next month</Pill>
        </div>
      </div>
    </div>
  </Glass>
);

const Bubble = ({ text }: { text: string }) => (
  <Glass tone="light" style={{ padding: "22px 28px", maxWidth: 760 }}>
    <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 32, overflow: "hidden", flexShrink: 0 }}>
        <Img src={staticFile("art/jiwoo.png")} style={{ width: "150%", marginLeft: "-25%", marginTop: "-6%" }} />
      </div>
      <div style={{ fontSize: 36, fontWeight: 750, letterSpacing: -0.6, color: C.ink }}>{text}</div>
    </div>
  </Glass>
);

const Triage = () => {
  const frame = useCurrentFrame();
  const split = interpolate(frame, [s(2.6), s(2.6) + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const rows = [
    { q: "K-beauty in local malls", online: true },
    { q: "Korean pet treats, sold online?", online: true },
    { q: "Sunscreen prices, store A", online: false },
    { q: "Sunscreen prices, store B", online: false },
    { q: "K-beauty shelf, 30-minute count", online: false },
  ];
  return (
    <Glass style={{ width: 640, padding: "28px 30px" }}>
      <Kicker color={MINT}>Five questions, sorted</Kicker>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
        {rows.map((r) => (
          <div key={r.q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, opacity: r.online ? 1 - split * 0.35 : 1 }}>
            <span style={{ fontSize: 23, fontWeight: 600 }}>{r.q}</span>
            <span style={{ opacity: split }}>{r.online ? <Pill tone="ghost">Found online</Pill> : <Pill tone="mint">To boreal.work</Pill>}</span>
          </div>
        ))}
      </div>
    </Glass>
  );
};

/** The explainer: who screens and reviews, and where that AI runs. */
const PrivateAi = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [s(dur) - 12, s(dur)], [1, 0], clamp);
  const step = (i: number) => spring({ frame: frame - s(0.4 + i * 1.6), fps: FPS, config: { damping: 20 } });
  const box = (i: number, children: ReactNode, hi = false) => {
    const t = step(i);
    return (
      <Fade.Provider value={Math.min(t, 1) * out}>
        <div style={{ transform: `translateY(${(1 - t) * 24}px)` }}>
          <Glass style={{ width: hi ? 520 : 330, minHeight: 230, padding: "28px 28px", boxSizing: "border-box", ...(hi ? { boxShadow: `0 0 0 2px ${MINT}, 0 40px 90px -30px rgba(0,0,0,.7)` } : {}) }}>{children}</Glass>
        </div>
      </Fade.Provider>
    );
  };
  const arrow = (i: number) => (
    <div style={{ fontSize: 46, color: MINT, opacity: Math.min(step(i), 1) * out, transform: `translateX(${(1 - Math.min(step(i), 1)) * -14}px)` }}>→</div>
  );
  const big = (t: string) => <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6, marginTop: 12, lineHeight: 1.15 }}>{t}</div>;
  const small = (t: string) => <div style={{ fontSize: 20, color: "rgba(255,255,255,.72)", marginTop: 10, lineHeight: 1.35 }}>{t}</div>;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, fontFamily: FONT, color: "#fff" }}>
      <div style={{ opacity: interpolate(frame, [4, 16], [0, 1], clamp) * out }}>
        <Kicker color={MINT}>Who reads Ji-woo's tasks</Kicker>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        {box(0, <><Kicker color={MINT}>1 · Funded task</Kicker>{big("Her plans, in plain words")}{small("Stores, products, what to count")}</>)}
        {arrow(1)}
        {box(
          1,
          <>
            <Kicker color={MINT}>2 · Private AI</Kicker>
            {big("Screens it. Later, reviews the proof.")}
            {small("Runs inside a confidential enclave on NEAR AI Cloud. The model host can't see the prompt or the answer.")}
          </>,
          true,
        )}
        {arrow(2)}
        {box(2, <><Kicker color={MINT}>3 · Signed verdict</Kicker>{big("Back to boreal.work")}{small("Anyone can check where it came from")}</>)}
      </div>
    </AbsoluteFill>
  );
};

const ProofChecks = () => {
  const frame = useCurrentFrame();
  const rows = ["Covers this exact review", "Signed by the model's key", "Key bound to the enclave's quote"];
  return (
    <Glass style={{ width: 560, padding: "26px 30px" }}>
      <Kicker color={MINT}>Proof checks out</Kicker>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        {rows.map((r, i) => {
          const on = interpolate(frame, [s(0.5 + i * 0.8), s(0.5 + i * 0.8) + 8], [0, 1], clamp);
          return (
            <div key={r} style={{ display: "flex", gap: 14, alignItems: "center", opacity: 0.3 + 0.7 * on }}>
              <span style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", background: on > 0.5 ? MINT : "rgba(255,255,255,.15)", color: "#0d3b3a", fontWeight: 900, fontSize: 20 }}>✓</span>
              <span style={{ fontSize: 24, fontWeight: 650 }}>{r}</span>
            </div>
          );
        })}
      </div>
    </Glass>
  );
};

const Money = () => {
  const frame = useCurrentFrame();
  const labels = ["Held in escrow", "Passed", "Paid $5.00"];
  return (
    <Glass style={{ padding: "22px 32px" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        {labels.map((l, i) => {
          const on = interpolate(frame, [s(0.4 + i * 0.9), s(0.4 + i * 0.9) + 8], [0, 1], clamp);
          const last = i === 2;
          return (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              {i > 0 && (
                <span style={{ width: 56, height: 3, borderRadius: 2, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${on * 100}%`, height: "100%", background: MINT }} />
                </span>
              )}
              <span style={{ fontSize: last ? 34 : 27, fontWeight: 800, color: on > 0.5 ? (last ? "#0d3b3a" : MINT) : "rgba(255,255,255,.4)", padding: last ? "6px 16px" : 0, borderRadius: 14, background: last && on > 0.5 ? MINT : "transparent" }}>{l}</span>
            </span>
          );
        })}
      </div>
    </Glass>
  );
};

/* ---------- Ending ---------- */

const Backdrop = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 16], [0, 0.92], clamp);
  return <AbsoluteFill style={{ opacity: o, background: "radial-gradient(120% 90% at 30% 20%, #134a4b 0%, #0a2a2c 45%, #051314 100%)" }} />;
};

const OnNear = ({ dur }: { dur: number }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [s(dur) - 12, s(dur)], [1, 0], clamp);
  const items: [string, string][] = [
    ["Agent wallet", "Hermes pays from its own NEAR account, inside Ji-woo's limits"],
    ["USDC escrow", "One transfer per task, held until the work passes"],
    ["Private AI", "Screening and review on NEAR AI Cloud, every verdict signed"],
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, fontFamily: FONT, color: "#fff" }}>
      <div style={{ opacity: interpolate(frame, [4, 16], [0, 1], clamp) * out }}>
        <Kicker color={MINT}>What ran on NEAR</Kicker>
      </div>
      <div style={{ display: "flex", gap: 28 }}>
        {items.map(([k, v], i) => {
          const t = spring({ frame: frame - s(0.5 + i * 1.2), fps: FPS, config: { damping: 20 } });
          return (
            <Fade.Provider key={k} value={Math.min(t, 1) * out}>
              <div style={{ transform: `translateY(${(1 - t) * 30}px)` }}>
                <Glass style={{ width: 460, height: 210, padding: "32px 32px", boxSizing: "border-box" }}>
                  <div style={{ fontSize: 38, fontWeight: 800, color: MINT, letterSpacing: -0.8 }}>{k}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, marginTop: 14, lineHeight: 1.3 }}>{v}</div>
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
        }}
      >
        boreal.work
      </div>
      <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1, opacity: b, transform: `translateY(${(1 - b) * 18}px)` }}>AI agents can think. We give them hands.</div>
      <div style={{ opacity: c, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 26 }}>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,.75)" }}>testnet.boreal.work · Built on NEAR · Private AI on NEAR AI Cloud</div>
        <div style={{ fontSize: 16, color: "rgba(255,255,255,.5)" }}>Recorded on NEAR testnet, sped up where marked. The paid task shown settled on boreal.work's PayPal rail.</div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- Music ---------- */

const musicVolume = (f: number) => {
  const t = f / FPS;
  const near = VO.some((v) => t > v.at - 0.4 && t < v.at + v.dur + 0.4);
  const base = near ? 0.07 : 0.2;
  return base * Math.min(1, t / 2) * Math.max(0, Math.min(1, (NEAR_FILM_SECONDS - t) / 3));
};
const vol = (f: number) => {
  let sum = 0;
  for (let i = -6; i <= 6; i++) sum += musicVolume(Math.max(0, f + i));
  return sum / 13;
};

const B = ({ id, plus = 0, dur, where, children, whoosh }: { id: string; plus?: number; dur: number; where: Parameters<typeof place>[0]; children: ReactNode; whoosh?: boolean }) => (
  <Beat from={at(id, plus)} dur={dur} style={place(where)} whoosh={whoosh}>
    {children}
  </Beat>
);

const full = (id: string, plus: number, dur: number, children: ReactNode, style?: CSSProperties) => (
  <Sequence from={s(at(id, plus))} durationInFrames={s(dur)} style={style}>
    {children}
  </Sequence>
);

export const NearFilm = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {SEGS.map((g) => (
      <Sequence key={g.id} from={s(START[g.id]!)} durationInFrames={s(segDur(g)) + 1}>
        <Segment g={g} />
        {g.rate >= 4 && <Speed rate={g.rate} />}
      </Sequence>
    ))}

    {Array.from({ length: Math.ceil(NEAR_FILM_SECONDS / 30) }, (_, i) => (
      <Sequence key={`m${i}`} from={s(i * 30)} durationInFrames={s(30)}>
        <Audio src={staticFile("sfx/music-bed.mp3")} volume={(f) => vol(f + s(i * 30))} />
      </Sequence>
    ))}
    {VO.map((v) => (
      <Sequence key={v.file} from={s(v.at)}>
        <Audio src={staticFile(`vo/${v.file}.mp3`)} />
      </Sequence>
    ))}

    {/* Who and what */}
    <B id="title" plus={2.6} dur={6.4} where="br" whoosh><JiWoo /></B>
    <B id="agentPage" plus={0.3} dur={6.4} where="bl" whoosh>
      <Card kicker="Hermes plugs in" width={520}>
        <Row k="Skill" v="agents.md" />
        <Row k="Tools" v="MCP" />
        <Row k="Owner" v="One approval" />
      </Card>
    </B>
    <B id="clarify" plus={0.3} dur={5.4} where="br"><Card kicker="Before it spends" title="Where? What exactly? What budget?" width={500} /></B>
    <B id="research" plus={1.2} dur={9.8} where="rc" whoosh><Triage /></B>

    {/* Paying on NEAR */}
    <B id="payAsk" plus={0.6} dur={4.6} where="bc"><Bubble text="I'd rather pay in USDC. I have a NEAR wallet." /></B>
    <B id="approve" plus={0.3} dur={5.5} where="br" whoosh>
      <Card kicker="One approval from Ji-woo" width={520}>
        <Row k="Hermes's own NEAR wallet" v="New" />
        <Row k="Per task" v="$10 max" tone="ghost" />
        <Row k="Per day" v="$50 max" tone="ghost" />
      </Card>
    </B>
    <B id="fund" plus={5} dur={3.8} where="bl"><Card kicker="Topped up from her wallet" title="20 USDC + 0.1 NEAR for fees" width={500} /></B>
    <B id="explorer" plus={0.3} dur={4.5} where="br"><Pill tone="mint">On NEAR testnet · nearblocks</Pill></B>
    <B id="paying" plus={0.6} dur={9} where="bl"><Card kicker="Hermes, on its own" title="Signs one USDC transfer per task" width={500} /></B>
    <B id="posted" plus={0.4} dur={5.4} where="br" whoosh>
      <Glass style={{ width: 480, padding: "26px 30px" }}>
        <Kicker color={MINT}>Paid into escrow on NEAR</Kicker>
        <div style={{ fontFamily: MONO, fontSize: 58, fontWeight: 500, marginTop: 10, letterSpacing: -1 }}>$13.58</div>
        <div style={{ fontSize: 22, fontWeight: 650, marginTop: 4 }}>3 tasks, one transfer each</div>
        <div style={{ fontSize: 19, color: "rgba(255,255,255,.72)", marginTop: 8 }}>Released only when the work passes.</div>
      </Glass>
    </B>

    {/* Private AI */}
    {full("screen", 0.2, segDur(SEGS.find((g) => g.id === "screen")!) - 0.2, <PrivateAi dur={segDur(SEGS.find((g) => g.id === "screen")!) - 0.2} />)}
    <B id="trail" plus={0.6} dur={6.6} where="br"><Card kicker="Admin view" title="Every event, hash-chained" width={460} /></B>

    {/* Workers */}
    <B id="workerWallet" plus={0.3} dur={7.4} where="br" whoosh>
      <Card kicker="A worker, nearby" width={520}>
        <Row k="NEAR wallet" v="1 minute" />
        <Row k="Proves it's theirs" v="Signed message, no fee" tone="ghost" />
      </Card>
    </B>
    <B id="photos" plus={0.3} dur={5.4} where="br"><Card kicker="Answers in" title="Two photos, one count" width={440} /></B>

    {/* The review */}
    {full("failA", 0, 2.4, <Scan />)}
    <B id="failB" plus={0.3} dur={6.4} where="tr" whoosh>
      <Card kicker="Private AI review" width={500}>
        <Row k="Sunscreen, store A" v="Failed" tone="red" />
        <Row k="Sunscreen, store B" v="Failed" tone="red" />
        <Row k="Shelf count" v="Failed" tone="red" />
        <div style={{ fontSize: 19, color: "rgba(255,255,255,.72)" }}>Ji-woo gets her money back, less the review fee.</div>
      </Card>
    </B>
    <B id="proof" plus={0.6} dur={6.2} where="tr"><ProofChecks /></B>
    <B id="paid" plus={1.6} dur={6} where="bc"><Money /></B>
    {full("paid", 2.8, 2, <Audio src={staticFile("sfx/payout-chime.mp3")} volume={0.5} />)}

    {/* Ending */}
    <Sequence from={s(END_AT)}><Backdrop /></Sequence>
    {full("end", 0.4, 10.4, <OnNear dur={10.4} />)}
    <Sequence from={s(END_AT + 11)}><EndCard /></Sequence>
  </AbsoluteFill>
);
