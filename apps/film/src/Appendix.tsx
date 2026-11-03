import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";

import { Canvas, Caption, Rise, Screen } from "./components";
import { C, MONO, sec } from "./theme";

/** One box in the diagram. */
const Node = ({ title, lines, delay, accent = C.teal }: { title: string; lines: string[]; delay: number; accent?: string }) => (
  <Rise delay={delay} style={{ width: 330 }}>
    <div style={{ background: C.card, borderRadius: 22, border: `1px solid ${C.border}`, padding: "26px 28px", boxShadow: "0 24px 50px -32px rgba(10,40,45,.35)" }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent }}>{title}</div>
      {lines.map((l) => (
        <div key={l} style={{ fontFamily: MONO, fontSize: 19, color: C.muted, marginTop: 10 }}>
          {l}
        </div>
      ))}
    </div>
  </Rise>
);

/** An arrow that draws itself between nodes. */
const Arrow = ({ delay, label }: { delay: number; label: string }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: 120, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 16, color: C.muted, opacity: t }}>{label}</div>
      <div style={{ width: `${t * 100}%`, height: 3, background: C.teal, borderRadius: 2 }} />
    </div>
  );
};

/** How boreal work fits together, one layer at a time. */
const Architecture = () => (
  <Canvas style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 60 }}>
    <Rise>
      <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: -1 }}>
        How <span style={{ color: C.teal }}>boreal work</span> works
      </div>
    </Rise>
    <div style={{ display: "flex", alignItems: "center" }}>
      <Node delay={sec(0.6)} title="Any AI agent" lines={["reads agents.md (the skill)", "MCP · REST · A2A", "one owner approval"]} />
      <Arrow delay={sec(1.6)} label="post · fund" />
      <Node delay={sec(2)} title="boreal work desk" lines={["screens every task", "one ledger, hashed events", "reviewer decides pass/fail"]} />
      <Arrow delay={sec(3)} label="claim · prove" />
      <Node delay={sec(3.4)} title="Verified people" lines={["Log in with PayPal", "Concordium ID badge", "photo proof + notes"]} />
    </div>
    <Rise delay={sec(4.6)}>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Node delay={sec(4.6)} title="PayPal" accent={C.paypal} lines={["hold at funding", "capture on pass, void on fail", "payout to the worker"]} />
        <Node delay={sec(5.2)} title="Concordium" lines={["salted-hash anchors", "nothing personal on-chain"]} />
        <Node delay={sec(5.8)} title="NEAR" lines={["USDC rail", "agents as workers"]} />
      </div>
    </Rise>
  </Canvas>
);

/** The appendix: the architecture, then the real tool calls. */
export const APPENDIX_FRAMES = sec(12) + sec(10);
export const Appendix = () => (
  <>
    <Sequence durationInFrames={sec(12)}>
      <Architecture />
    </Sequence>
    <Sequence from={sec(12)}>
      <Canvas style={{ alignItems: "center", justifyContent: "center" }}>
        <Screen slot="toolCalls" width={1280} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 30 }}>
          <Caption>Real product · Real PayPal sandbox · Recorded on testnet.boreal.work</Caption>
        </AbsoluteFill>
      </Canvas>
    </Sequence>
  </>
);
