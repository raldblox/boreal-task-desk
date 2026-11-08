import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";

import { Canvas, Caption, Chip, MoneyLine, Proof, Rise, Shots, useIn } from "./components";
import { Globe } from "./globe";
import { PROOFS } from "./media";
import { C, MONO, sec } from "./theme";

const center = { alignItems: "center", justifyContent: "center" } as const;

/* 1. Too much: her week overflows. */
const NOTES = ["PH launch: competitor prices?", "thesis data!!", "Boracay (mostly offline)", "Mochi: jerky??", "11 meetings", "pack", "call Monday 8:00"];
export const TooMuch = () => {
  const frame = useCurrentFrame();
  return (
    <Canvas style={center}>
      <div style={{ position: "relative", width: 1200, height: 700 }}>
        {NOTES.map((n, i) => {
          const d = 8 + i * 14;
          const x = [80, 620, 180, 700, 360, 860, 40][i];
          const y = [60, 120, 300, 380, 520, 560, 600][i] - interpolate(frame, [d, sec(12)], [0, 40], { extrapolateLeft: "clamp" });
          return (
            <Rise key={n} delay={d} style={{ position: "absolute", left: x, top: y }}>
              <div style={{ padding: "18px 26px", background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, fontSize: 34, fontWeight: 600, boxShadow: "0 18px 40px -26px rgba(10,40,45,.3)" }}>{n}</div>
            </Rise>
          );
        })}
      </div>
    </Canvas>
  );
};

/* 2. Hi, Hermes: connect once, connect PayPal once. */
export const HiHermes = () => (
  <Canvas style={center}>
    <Shots width={1500} shots={[["hiHermes", 0, 6], ["approveLink", 6, 12.5], ["connectPayPal", 12.5, 18]]} />
    <Sequence from={sec(13.5)}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 40 }}>
        <Rise>
          <Chip tone="paypal">PayPal connected once · $10 a task · $50 a day</Chip>
        </Rise>
      </AbsoluteFill>
    </Sequence>
  </Canvas>
);

/* 3. The ask: a voice note, Hermes clarifies, answers what it can online, sends the rest to boreal work. */
const QUESTIONS = [
  { q: "K-beauty in Cebu malls?", online: true },
  { q: "Korean dog jerky in Manila?", online: true },
  { q: "Sunscreen prices · store A", online: false },
  { q: "Sunscreen prices · store B", online: false },
  { q: "K-beauty shelf count", online: false },
];
export const TheAsk = () => {
  const sorted = useIn(sec(19));
  return (
    <Canvas style={{ ...center, flexDirection: "row", gap: 48 }}>
      <Shots width={1120} shots={[["voiceNote", 0, 8], ["hermesClarify", 8, 16], ["hermesTriage", 16, 25], ["okToFund", 25, 34]]} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 620 }}>
        {QUESTIONS.map((c, i) => (
          <Rise key={c.q} delay={sec(16) + i * 6}>
            <div
              style={{
                padding: "18px 24px",
                background: c.online ? "transparent" : C.card,
                borderRadius: 18,
                border: `1px ${c.online ? "dashed" : "solid"} ${C.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: c.online ? 1 - sorted * 0.35 : 1,
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 600 }}>{c.q}</span>
              <span style={{ opacity: sorted }}>{c.online ? <Chip>Answered online · free</Chip> : <Chip tone="paypal">→ boreal work</Chip>}</span>
            </div>
          </Rise>
        ))}
      </div>
      <Sequence from={sec(28)}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 56 }}>
          <Rise>
            <Chip tone="paypal">Held on PayPal, not charged</Chip>
          </Rise>
        </AbsoluteFill>
      </Sequence>
    </Canvas>
  );
};

/* 4. The world moves: Seoul to Manila, workers claim and submit. */
export const WorldMoves = () => (
  <Canvas>
    <AbsoluteFill style={{ transform: "translateX(-360px)" }}>
      <Globe pins={["makati", "bgc", "makati"]} pinsAt={sec(2)} pinGap={10} />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "center", paddingRight: 70 }}>
      <Shots width={1080} shots={[["workerClaim", 3, 12], ["workerSubmit", 12, 22]]} />
    </AbsoluteFill>
    <Sequence from={sec(15)}>
      <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: "0 0 60px 60px", flexDirection: "row", gap: 18 }}>
        <Proof src={PROOFS.storeA} width={230} rotate={-4} />
        <Proof src={PROOFS.storeB} width={230} rotate={3} delay={6} />
        <Proof src={PROOFS.shelf} width={230} rotate={-2} delay={12} />
      </AbsoluteFill>
    </Sequence>
  </Canvas>
);

/* 5. Checked: Hermes catches two, Ji-woo passes one, the worker is paid. */
export const Checked = () => {
  const verdict = useIn(sec(15));
  return (
    <Canvas style={{ ...center, flexDirection: "row", gap: 48 }}>
      <Shots width={1120} shots={[["hermesCatch", 0, 8], ["letMeSee", 8, 21], ["payout", 21, 30]]} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 600 }}>
        {[
          { src: PROOFS.storeA, label: "Store A", pass: false },
          { src: PROOFS.storeB, label: "Store B", pass: false },
          { src: PROOFS.shelf, label: "Shelf count", pass: true },
        ].map((p, i) => (
          <Rise key={p.label} delay={sec(2) + i * 8}>
            <div style={{ display: "flex", alignItems: "center", gap: 22, padding: 14, background: C.card, borderRadius: 18, border: `1px solid ${C.border}` }}>
              <Proof src={p.src} width={150} />
              <span style={{ fontSize: 28, fontWeight: 600, flex: 1 }}>{p.label}</span>
              <div style={{ opacity: verdict }}>
                {p.pass ? <Chip>Passed</Chip> : <Chip tone="red">Failed</Chip>}
              </div>
            </div>
          </Rise>
        ))}
        <Rise delay={sec(20)}>
          <MoneyLine delay={6} />
        </Rise>
      </div>
    </Canvas>
  );
};

/* 6. Done: the list empties, the line lands. */
export const Done = () => {
  const frame = useCurrentFrame();
  return (
    <Canvas style={center}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" }}>
        {["Competitor prices: re-posted with a store-sign rule", "Shelf count: 12 of 41 stopped", "Worker paid $5.00 via PayPal"].map((t, i) => {
          const strike = interpolate(frame, [sec(2) + i * 12, sec(2) + i * 12 + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <Rise key={t} delay={i * 6}>
              <div style={{ fontSize: 40, fontWeight: 600, display: "flex", gap: 18, alignItems: "center", color: strike > 0.5 ? C.muted : C.ink }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, border: `3px solid ${C.teal}`, background: strike > 0.5 ? C.teal : "transparent" }} />
                {t}
              </div>
            </Rise>
          );
        })}
        <Rise delay={sec(6)} style={{ marginTop: 40 }}>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>Ji-woo never left Seoul.</div>
        </Rise>
        <Rise delay={sec(8)}>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1, color: C.teal }}>She had many hands.</div>
        </Rise>
      </div>
    </Canvas>
  );
};

/* 7b. Market reveal over a pulled-back globe. */
const FIGURES = [
  { n: "154–435M", label: "online gig workers", src: "World Bank, Working Without Borders (2023)" },
  { n: "$7.8B → $52.6B", label: "AI agent market, 2025 to 2030", src: "MarketsandMarkets (2025)" },
  { n: "$35.6B", label: "remitted to the Philippines in 2025", src: "Bangko Sentral ng Pilipinas (Feb 2026)" },
];
export const Market = () => {
  const frame = useCurrentFrame();
  return (
    <Canvas>
      <AbsoluteFill style={{ opacity: 0.3 }}>
        <Globe pins={["makati", "bgc", "cebu", "boracay"]} pinsAt={0} pinGap={4} arcAt={-60} pullBack={interpolate(frame, [0, sec(6)], [0.2, 1], { extrapolateRight: "clamp" })} />
      </AbsoluteFill>
      <AbsoluteFill style={{ ...center, flexDirection: "row", gap: 70 }}>
        {FIGURES.map((f, i) => (
          <Rise key={f.n} delay={sec(1) + i * sec(2.5)} style={{ width: 480, padding: 28, borderRadius: 24, background: "rgba(255,255,255,.82)" }}>
            <div style={{ fontFamily: MONO, fontSize: 46, fontWeight: 500, color: C.teal, whiteSpace: "nowrap" }}>{f.n}</div>
            <div style={{ fontSize: 30, fontWeight: 600, marginTop: 8 }}>{f.label}</div>
            <Caption style={{ fontSize: 18, marginTop: 10 }}>{f.src}</Caption>
          </Rise>
        ))}
      </AbsoluteFill>
    </Canvas>
  );
};

/* 7c. End card. */
export const EndCard = () => (
  <Canvas style={{ ...center, flexDirection: "column", gap: 26 }}>
    <Rise>
      <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -1.5, textAlign: "center" }}>
        <span style={{ color: C.teal }}>boreal work</span>
      </div>
    </Rise>
    <Rise delay={sec(1.4)}>
      <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1, textAlign: "center" }}>AI agents can think. We give them hands.</div>
    </Rise>
    <Rise delay={sec(1.2)}>
      <Caption style={{ fontSize: 26 }}>boreal.work · Built with PayPal · PayPal AI Hackathon 2026</Caption>
    </Rise>
    <Rise delay={sec(2)}>
      <Caption style={{ fontSize: 18 }}>Some task photos and counts are illustrative.</Caption>
    </Rise>
  </Canvas>
);
