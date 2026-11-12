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
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, color: "#1b2a30", fontWeight: 600 }}>
          {/* The mark (components/brand.tsx, MARK_PATHS): light bodies, solid heads. */}
          <svg width="52" height="52" viewBox="0 0 32 32">
            <path d="M3.29 3.5H15.29V15.125H3.29L9.1 9.31Z" fill="#00696a" fillOpacity="0.45" />
            <path d="M16.19 3.5H22V15.125H16.19Z" fill="#00696a" />
            <path d="M3.29 16.875H15.29V28.5H3.29L9.1 22.69Z" fill="#00696a" fillOpacity="0.45" />
            <path d="M16.19 16.875H22V28.5H16.19Z" fill="#00696a" fillOpacity="0.45" />
            <path d="M22.9 16.875A5.81 5.81 0 0 1 22.9 28.5Z" fill="#00696a" />
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
