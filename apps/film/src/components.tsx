import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { REC } from "./media";
import { C, FONT, MONO } from "./theme";

export const Canvas = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink, ...style }}>{children}</AbsoluteFill>
);

/** 0→1 with a soft spring, starting at `delay` frames. */
export function useIn(delay = 0, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

/** Fades and lifts its children in, then out before `outAt` (frames from scene start). */
export const Rise = ({ delay = 0, outAt, children, style }: { delay?: number; outAt?: number; children: ReactNode; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const t = useIn(delay);
  const out = outAt === undefined ? 1 : interpolate(frame, [outAt, outAt + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ opacity: t * out, transform: `translateY(${(1 - t) * 24}px)`, ...style }}>{children}</div>;
};

/** A recording slot. Missing recordings draw a placeholder naming the slot. */
const Recording = ({ slot, startFrom = 0 }: { slot: keyof typeof REC; startFrom?: number }) => {
  const file = REC[slot];
  if (file) return <OffthreadVideo src={staticFile(`rec/${file}`)} startFrom={startFrom} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  return (
    <AbsoluteFill style={{ background: C.tealWash, alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, color: C.teal }}>rec/{String(slot)}</div>
      <div style={{ fontSize: 18, color: C.muted, marginTop: 8 }}>recording goes here</div>
    </AbsoluteFill>
  );
};

/** A phone (390×844 recordings) with a gentle spring in and tilt. */
export const Phone = ({ slot, delay = 0, scale = 1, tilt = 0, startFrom, style }: { slot: keyof typeof REC; delay?: number; scale?: number; tilt?: number; startFrom?: number; style?: CSSProperties }) => {
  const t = useIn(delay, 18);
  const w = 390 * scale;
  const h = 844 * scale;
  return (
    <div
      style={{
        width: w + 24 * scale,
        height: h + 24 * scale,
        borderRadius: 64 * scale,
        background: "#0d1417",
        padding: 12 * scale,
        boxShadow: "0 40px 80px -30px rgba(10,40,45,.35), 0 0 0 1px rgba(0,0,0,.04)",
        transform: `translateY(${(1 - t) * 80}px) scale(${0.94 + t * 0.06}) rotate(${tilt * t}deg)`,
        opacity: t,
        ...style,
      }}
    >
      <div style={{ width: w, height: h, borderRadius: 52 * scale, overflow: "hidden", position: "relative" }}>
        <Recording slot={slot} startFrom={startFrom} />
      </div>
    </div>
  );
};

/** A laptop-ish browser frame for desktop recordings (1440×900). */
export const Screen = ({ slot, delay = 0, width = 1280, style }: { slot: keyof typeof REC; delay?: number; width?: number; style?: CSSProperties }) => {
  const t = useIn(delay, 22);
  return (
    <div
      style={{
        width,
        borderRadius: 20,
        overflow: "hidden",
        background: C.card,
        boxShadow: "0 40px 90px -40px rgba(10,40,45,.4), 0 0 0 1px " + C.border,
        transform: `translateY(${(1 - t) * 60}px)`,
        opacity: t,
        ...style,
      }}
    >
      <div style={{ height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", borderBottom: `1px solid ${C.border}` }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: C.border }} />
        ))}
        <span style={{ marginLeft: 16, fontFamily: MONO, fontSize: 14, color: C.muted }}>testnet.boreal.work</span>
      </div>
      <div style={{ width, height: (width * 900) / 1440, position: "relative" }}>
        <Recording slot={slot} />
      </div>
    </div>
  );
};

/** A proof photo that lifts out with a white border, like a print. */
export const Proof = ({ src, delay = 0, rotate = 0, width = 420, style }: { src: string; delay?: number; rotate?: number; width?: number; style?: CSSProperties }) => {
  const t = useIn(delay, 16);
  return (
    <div
      style={{
        width,
        padding: 10,
        background: C.card,
        borderRadius: 14,
        boxShadow: "0 30px 60px -25px rgba(10,40,45,.35)",
        transform: `translateY(${(1 - t) * 50}px) rotate(${rotate * t}deg) scale(${0.9 + 0.1 * t})`,
        opacity: t,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", borderRadius: 8, display: "block" }} />
    </div>
  );
};

export const Caption = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontSize: 22, color: C.muted, letterSpacing: 0.2, ...style }}>{children}</div>
);

export const Chip = ({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "red" | "paypal" }) => {
  const color = tone === "red" ? C.red : tone === "paypal" ? C.paypal : C.teal;
  const bg = tone === "red" ? C.redWash : tone === "paypal" ? "#e8f2fd" : C.tealWash;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, background: bg, color, fontSize: 22, fontWeight: 600 }}>
      {children}
    </span>
  );
};

/** held → approved → paid, filling step by step from `delay`. */
export const MoneyLine = ({ delay = 0, step = 18, amount = "$5.00" }: { delay?: number; step?: number; amount?: string }) => {
  const frame = useCurrentFrame();
  const labels = ["Held", "Approved", "Paid"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 600 }}>
      {labels.map((label, i) => {
        const on = interpolate(frame, [delay + i * step, delay + i * step + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const paid = i === 2;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {i > 0 && <div style={{ width: 56, height: 3, borderRadius: 2, background: C.border, overflow: "hidden" }}><div style={{ width: `${on * 100}%`, height: "100%", background: C.teal }} /></div>}
            <span style={{ padding: "8px 18px", borderRadius: 999, border: `2px solid ${on > 0.5 ? (paid ? C.paypal : C.teal) : C.border}`, color: on > 0.5 ? (paid ? C.paypal : C.teal) : C.muted, background: on > 0.5 ? C.card : "transparent" }}>
              {label}
              {paid && on > 0.5 ? ` ${amount}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
};
