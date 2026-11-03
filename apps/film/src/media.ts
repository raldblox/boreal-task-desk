// What sits in public/. A slot set to null draws a labelled placeholder, so the cut plays
// end to end before every recording exists. Drop the trimmed file in, then set its name here.

/** Trimmed screen recordings, public/rec/. Phone ones at 390×844, desktop ones at 1440×900. */
export const REC: Record<string, string | null> = {
  hiHermes: null, // Ji-woo's first message, Hermes's link reply
  approveLink: null, // boreal /link: sign in with PayPal, set limits, Approve
  connectPayPal: null, // Connect PayPal and the sandbox approval as Ji-woo Kim
  connected: null, // Hermes: "Connected…"
  voiceNote: null, // the voice note sent, Hermes posting tasks
  okToFund: null, // Hermes's list and total, "OK to fund?", her "Yes", funded
  heldPage: null, // a task page showing "held, not charged"
  workerClaim: null, // worker: Log in with PayPal, claim
  workerSubmit: null, // worker: photo + notes, "Submitted"
  hermesCatch: null, // Hermes flags the photos and the timing
  letMeSee: null, // "Let me see them", her call: pass the shelf count
  passed: null, // the task page: Reviewed, Paid
  payout: null, // worker's PayPal sandbox: "You received $5.00"
  toolCalls: null, // under the hood: post_task, fund_tasks scrolling (desktop)
  adminConsole: null, // under the hood: AG Studio console (desktop)
};

/** Voice-over lines, public/vo/<key>.mp3, made once from VO_SCRIPT. */
export const VO: Record<string, string | null> = {
  intro: "intro.mp3",
  hi: "hi.mp3",
  linked: "linked.mp3",
  ask: "ask.mp3",
  clarify: "clarify.mp3",
  live: "live.mp3",
  workers: "workers.mp3",
  checked: "checked.mp3",
  letMeSee: "letMeSee.mp3",
  pass: "pass.mp3",
  paid: "paid.mp3",
  done: "done.mp3",
  close: "close.mp3",
  tagline: "tagline.mp3",
};

/** Illustrative proof photos (credited as such), public/proofs/. */
export const PROOFS = {
  shelf: "proofs/thesis-shelf.png",
  storeA: "proofs/sunscreen-store-a.png",
  storeB: "proofs/sunscreen-store-b.png",
};
