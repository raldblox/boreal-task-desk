// What sits in public/. A slot set to null draws a labelled placeholder, so the cut plays
// end to end before every recording exists. Drop the trimmed file in, then set its name here.

/** Trimmed screen recordings, public/rec/, as desktop windows (16:10 fits best, e.g. 1440×900). */
export const REC: Record<string, string | null> = {
  hiHermes: null, // Ji-woo's first message, Hermes's link reply
  approveLink: null, // boreal /link: sign in with PayPal, set limits, Approve
  connectPayPal: null, // Connect PayPal and the sandbox approval as Ji-woo Kim
  voiceNote: null, // the voice note sent
  hermesClarify: null, // Hermes's clarifying questions and her answers
  hermesTriage: null, // Hermes: two answered online for free, the rest posted to boreal work
  okToFund: null, // Hermes's list and total, "OK to fund?", funded
  workerClaim: null, // worker: Log in with PayPal, browse, claim
  workerSubmit: null, // worker: photo + notes, "Submitted", task statuses
  hermesCatch: null, // Hermes flags the photos and the timing
  letMeSee: null, // "Let me see them", her call: pass the shelf count
  payout: null, // worker: task Paid, earnings, PayPal sandbox "You received $5.00"
  toolCalls: null, // appendix: post_task, fund_tasks scrolling (desktop)
};

/**
 * Seconds each recording is on screen: aim for `fit`, never past `max` (the rest is cut off).
 * A clip shorter than `min` ends while its window is still on screen; send it anyway and the scene gets retimed to fit.
 */
export const REC_TIME: Record<keyof typeof REC, { min: number; fit: number; max: number }> = {
  hiHermes: { min: 4, fit: 6, max: 6 },
  approveLink: { min: 5, fit: 6.5, max: 6.5 },
  connectPayPal: { min: 4, fit: 5.5, max: 5.5 },
  voiceNote: { min: 5, fit: 8, max: 8 },
  hermesClarify: { min: 5, fit: 8, max: 8 },
  hermesTriage: { min: 6, fit: 9, max: 9 },
  okToFund: { min: 6, fit: 9, max: 9 },
  workerClaim: { min: 6, fit: 9, max: 9 },
  workerSubmit: { min: 6, fit: 10, max: 10 },
  hermesCatch: { min: 5, fit: 8, max: 8 },
  letMeSee: { min: 8, fit: 13, max: 13 },
  payout: { min: 5, fit: 9, max: 9 },
  toolCalls: { min: 6, fit: 10, max: 10 },
}

/** Voice-over lines, public/vo/<key>.mp3, made once from VO_SCRIPT. */
export const VO: Record<string, string | null> = {
  intro: "intro.mp3",
  hi: "hi.mp3",
  linked: "linked.mp3",
  ask: "ask.mp3",
  triage: "triage.mp3",
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
