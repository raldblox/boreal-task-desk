import { Composition } from "remotion";

import { Appendix, APPENDIX_FRAMES } from "./Appendix";
import { Final, FINAL_FRAMES } from "./Final";
import { HERMES_DEMO_FRAMES, HermesDemo } from "./HermesDemo";
import { ManyHands, TOTAL_FRAMES } from "./ManyHands";
import { NEAR_FILM_FRAMES, NearFilm } from "./NearFilm";
import { FPS } from "./theme";

export const Root = () => (
  <>
    <Composition id="Final" component={Final} durationInFrames={FINAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="NearFilm" component={NearFilm} durationInFrames={NEAR_FILM_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="HermesDemo" component={HermesDemo} durationInFrames={HERMES_DEMO_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="ManyHands" component={ManyHands} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Architecture" component={Appendix} durationInFrames={APPENDIX_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
