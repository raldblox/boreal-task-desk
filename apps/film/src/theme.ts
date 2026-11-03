import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";

// boreal's light theme (apps/web/src/app/globals.css). Chrome renders oklch directly.
export const C = {
  bg: "oklch(0.985 0.006 195)",
  card: "oklch(1 0 0)",
  ink: "oklch(0.21 0.02 225)",
  muted: "oklch(0.48 0.02 225)",
  border: "oklch(0.9 0.006 195)",
  teal: "oklch(0.47 0.085 195)",
  tealSoft: "oklch(0.86 0.05 195)",
  tealWash: "oklch(0.95 0.025 195)",
  paypal: "#0070e0",
  red: "oklch(0.58 0.19 25)",
  redWash: "oklch(0.96 0.03 25)",
};

export const FONT = loadManrope("normal", { weights: ["400", "500", "600", "700", "800"] }).fontFamily;
export const MONO = loadJetBrains("normal", { weights: ["400", "500"] }).fontFamily;

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);
