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
  live: { voice: "narrator", text: "Then three small jobs cross the sea, [pause] and PayPal holds every dollar." },
  workers: { voice: "narrator", text: "In Manila, people already at the mall pick them up. [pause] A few minutes between errands. Money already waiting." },
  checked: { voice: "narrator", text: "But not every answer is honest. [pause] Hermes checks the proof, and two photos don't hold up." },
  letMeSee: { voice: "jiwoo", text: "Let me see them." },
  pass: { voice: "jiwoo", text: "The shelf count looks right. Pass that one." },
  paid: { voice: "narrator", text: "One passes. [pause] And in Manila, a worker gets paid for being in the right place." },
  done: { voice: "narrator", text: "[softly] Ji-woo never left Seoul. [pause] She had many hands." },
  close: { voice: "narrator", text: "Agents are learning to buy, book and decide. [pause] Now they can ask the world for help, and pay the people who answer, the moment the work is done." },
  tagline: { voice: "narrator", text: "boreal work. [pause] AI agents can think. We give them hands." },
} as const;
