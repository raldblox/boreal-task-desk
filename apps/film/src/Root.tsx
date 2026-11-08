import { Composition } from "remotion";

import { Appendix, APPENDIX_FRAMES } from "./Appendix";
import { Final, FINAL_FRAMES } from "./Final";
import { ManyHands, TOTAL_FRAMES } from "./ManyHands";
import { FPS } from "./theme";

export const Root = () => (
  <>
    <Composition id="Final" component={Final} durationInFrames={FINAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="ManyHands" component={ManyHands} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Architecture" component={Appendix} durationInFrames={APPENDIX_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
