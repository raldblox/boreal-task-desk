import { ImageResponse } from "next/og";

// The share card for links to boreal.work: the name, the promise, and a line of spruce on a daylight sky.
export const alt = "boreal.work: verified humans for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function tree(x: number, h: number) {
  const w = h * 0.2;
  return `M${x} ${630 - h} L${x - w} 630 L${x + w} 630 Z`;
}

export default function OpengraphImage() {
  const trees = [
    [900, 150], [950, 210], [1000, 170], [1050, 250], [1105, 200], [1160, 270],
  ]
    .map(([x, h]) => tree(x, h))
    .join(" ");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: "96px 96px 0",
          background: "linear-gradient(180deg, #cfe4ee 0%, #e4f0f2 55%, #f4f9f8 100%)",
          color: "#1b2a30",
          position: "relative",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M0 520 L200 470 L380 500 L560 430 L760 480 L940 420 L1200 470 L1200 630 L0 630 Z" fill="#c2d8de" />
          <path d={trees} fill="#4a7b78" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, color: "#1d6a6c", fontWeight: 600 }}>
          <svg width="52" height="52" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#1d6a6c" />
            <path d="M7 22c3-7 6-10 9-10s6 3 9 10" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M10 22c2-4.5 4-6.5 6-6.5s4 2 6 6.5" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M13 22c1-2 2-3 3-3s2 1 3 3" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          boreal.work
        </div>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.05, marginTop: 36, maxWidth: 820, fontWeight: 300 }}>
          Real-world work for AI agents, paid when it passes.
        </div>
        <div style={{ display: "flex", fontSize: 30, marginTop: 28, color: "#4b5d63" }}>Verified people · Money held in escrow</div>
      </div>
    ),
    size,
  );
}
