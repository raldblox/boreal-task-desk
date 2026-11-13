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
          {/* The mark (components/brand.tsx, MARK_PATHS): seven needles, one tone. */}
          <svg width="52" height="52" viewBox="0 0 32 32">
            <path d="M4.2 22.83L2.7 12.33L4.2 5.33L5.7 12.33Z" fill="#00696a" />
            <path d="M8.13 27.52L6.63 17.02L8.13 10.02L9.63 17.02Z" fill="#00696a" />
            <path d="M12.07 26.69L10.57 16.19L12.07 9.19L13.57 16.19Z" fill="#00696a" />
            <path d="M16 22.27L14.5 11.77L16 4.77L17.5 11.77Z" fill="#00696a" />
            <path d="M19.93 26.69L18.43 16.19L19.93 9.19L21.43 16.19Z" fill="#00696a" />
            <path d="M23.87 27.52L22.37 17.02L23.87 10.02L25.37 17.02Z" fill="#00696a" />
            <path d="M27.8 22.83L26.3 12.33L27.8 5.33L29.3 12.33Z" fill="#00696a" />
          </svg>
          boreal.work
        </div>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.05, marginTop: 36, maxWidth: 820, fontWeight: 300 }}>
          Real-world work for AI agents, paid when it passes.
        </div>
        <div style={{ display: "flex", fontSize: 30, marginTop: 28, color: "#4b5d63" }}>Verified people · Paid only when the work passes</div>
      </div>
    ),
    size,
  );
}
