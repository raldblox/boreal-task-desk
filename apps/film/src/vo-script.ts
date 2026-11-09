// The voice-over: a narrator and Ji-woo, one file per line so each can be placed on its own.
// Read by ElevenLabs v4 through Runway; tags like [pause] shape delivery and aren't spoken.
// The brand is always said "boreal work". Every generation spends Runway credits.
export const VOICES = { narrator: "James", jiwoo: "Rina" } as const;

export const VO_SCRIPT = {
  intro: { voice: "narrator", text: "Every question has a place where the answer lives. [pause] Ji-woo's answers are in Manila. [pause] She's in Seoul." },
  hi: { voice: "jiwoo", text: "Hi, Hermes. Can you get real people in Manila to check a few things for me?" },
  linked: { voice: "narrator", text: "Her agent reads boreal work's skill, connects through MCP, and asks for one approval. [pause] PayPal holds the limits. Ji-woo holds the keys." },
  ask: { voice: "jiwoo", text: "I need competitor sunscreen prices at two stores, and someone to count who stops at a K-beauty shelf." },
  clarify: { voice: "narrator", text: "Before it spends a cent, Hermes asks what a good assistant would. [pause] Which mall? How long? What counts?" },
  triage: { voice: "narrator", text: "What an agent can find, Hermes finds itself: two answers, online, for free. [pause] What only a person can see goes to boreal work." },
  live: { voice: "narrator", text: "Then three small jobs cross the sea, [pause] and PayPal holds every dollar." },
  workers: { voice: "narrator", text: "In Manila, people are already out: running errands, meeting friends, waiting for a ride. [pause] boreal work turns the place they happen to be into a few minutes of paid work." },
  checked: { voice: "narrator", text: "But not every answer is honest. [pause] Hermes checks the proof, and two photos don't hold up." },
  letMeSee: { voice: "jiwoo", text: "Let me see them." },
  pass: { voice: "jiwoo", text: "The shelf count looks right. Pass that one." },
  paid: { voice: "narrator", text: "One passes. [pause] And in Manila, a worker gets paid for being in the right place." },
  done: { voice: "narrator", text: "Ji-woo never left Seoul. [pause] And still, she had many hands." },
  close: { voice: "narrator", text: "Agents are learning to buy, book and decide. [pause] Now they can ask the world for help, and pay the people who answer, the moment the work is done." },
  tagline: { voice: "narrator", text: "boreal work. [pause] AI agents can think. We give them hands." },
} as const;

// The NEAR film (docs/near-demo.md) reuses most lines above. These are new: the shared ones never
// name a chain, so the Concordium film can reuse them too; only the chain slot does.
export const SHARED_VO_SCRIPT = {
  linkedWallet: { voice: "narrator", text: "Her agent connects to boreal work through MCP, and pays from its own wallet, in digital dollars. [pause] Ji-woo sets the limits." },
  liveEscrow: { voice: "narrator", text: "Then three small jobs cross the sea, [pause] and every dollar waits in escrow until the work passes." },
  checkedReviewer: { voice: "narrator", text: "But not every answer is honest. [pause] The reviewer checks the proof, and two photos don't hold up." },
  payHer: { voice: "jiwoo", text: "The shelf count looks right. Pay her now." },
  doneEyes: { voice: "narrator", text: "Ji-woo never left Seoul. [pause] She had many hands, [pause] and no extra eyes." },
} as const;

// The NEAR film's chain slot.
export const NEAR_VO_SCRIPT = {
  privateNear: { voice: "narrator", text: "But these questions are Ji-woo's plans for a launch. [pause] So they're read by private AI on NEAR AI Cloud, [pause] where no AI company can see them." },
  signed: { voice: "narrator", text: "Every verdict from that private AI comes back signed, [pause] so anyone can check where it came from." },
} as const;
