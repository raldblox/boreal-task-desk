import { Composition } from "remotion";

import { ManyHands, TOTAL_FRAMES } from "./ManyHands";
import { FPS } from "./theme";

export const Root = () => (
  <Composition id="ManyHands" component={ManyHands} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
