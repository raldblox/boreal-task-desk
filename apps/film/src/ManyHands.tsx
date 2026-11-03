import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Audio, Sequence, staticFile } from "remotion";

import { VO } from "./media";
import { Checked, Done, EndCard, HiHermes, Market, TheAsk, TooMuch, WorldMoves } from "./scenes";
import { sec } from "./theme";

const FADE = 15;

/** Scene lengths in seconds, in order. Change these to retime the cut. */
export const SCENES = [
  { id: "tooMuch", seconds: 12, Scene: TooMuch },
  { id: "hiHermes", seconds: 18, Scene: HiHermes },
  { id: "theAsk", seconds: 34, Scene: TheAsk },
  { id: "worldMoves", seconds: 22, Scene: WorldMoves },
  { id: "checked", seconds: 30, Scene: Checked },
  { id: "done", seconds: 12, Scene: Done },
  { id: "market", seconds: 12, Scene: Market },
  { id: "endCard", seconds: 7, Scene: EndCard },
] as const;

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + sec(s.seconds), 0) - FADE * (SCENES.length - 1);

/** When each scene starts on the final timeline, for placing the voice-over. */
const startOf = (id: (typeof SCENES)[number]["id"]) => {
  let at = 0;
  for (const s of SCENES) {
    if (s.id === id) return at;
    at += sec(s.seconds) - FADE;
  }
  return at;
};

/** Each VO line and where it starts. */
const VO_CUES: { key: keyof typeof VO; at: number }[] = [
  { key: "intro", at: startOf("tooMuch") + sec(0.8) },
  { key: "hi", at: startOf("hiHermes") + sec(0.8) },
  { key: "linked", at: startOf("hiHermes") + sec(8) },
  { key: "ask", at: startOf("theAsk") + sec(0.8) },
  { key: "clarify", at: startOf("theAsk") + sec(8) },
  { key: "triage", at: startOf("theAsk") + sec(16.5) },
  { key: "live", at: startOf("theAsk") + sec(27) },
  { key: "workers", at: startOf("worldMoves") + sec(2.5) },
  { key: "checked", at: startOf("checked") + sec(1) },
  { key: "letMeSee", at: startOf("checked") + sec(8.5) },
  { key: "pass", at: startOf("checked") + sec(13) },
  { key: "paid", at: startOf("checked") + sec(21) },
  { key: "done", at: startOf("done") + sec(5.5) },
  { key: "close", at: startOf("market") + sec(0.5) },
  { key: "tagline", at: startOf("endCard") + sec(0.3) },
];

export const ManyHands = () => (
  <>
    <TransitionSeries>
      {SCENES.flatMap(({ id, seconds, Scene }, i) => [
        ...(i > 0 ? [<TransitionSeries.Transition key={`${id}-in`} presentation={fade()} timing={linearTiming({ durationInFrames: FADE })} />] : []),
        <TransitionSeries.Sequence key={id} durationInFrames={sec(seconds)}>
          <Scene />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
    {VO_CUES.map(({ key, at }) =>
      VO[key] ? (
        <Sequence key={key} from={at}>
          <Audio src={staticFile(`vo/${VO[key]}`)} />
        </Sequence>
      ) : null,
    )}
  </>
);
