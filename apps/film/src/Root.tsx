import { Composition } from "remotion";

import { XAvatar, XBanner } from "./XProfile";

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
    <Composition id="XAvatar" component={XAvatar} durationInFrames={1} fps={FPS} width={400} height={400} />
    <Composition id="XBanner" component={XBanner} durationInFrames={1} fps={FPS} width={1500} height={500} />
    <Composition id="HermesDemo" component={HermesDemo} durationInFrames={HERMES_DEMO_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="ManyHands" component={ManyHands} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Architecture" component={Appendix} durationInFrames={APPENDIX_FRAMES} fps={FPS} width={1920} height={1080} />
  </>
);
