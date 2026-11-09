// The brain does judgment steps only. Nothing here changes task state: callers feed the
// result into the desk, and anything undecided goes to a human.

export { type ClaudeReviewerOptions, createClaudeReviewer } from "./claude";
export type { Reviewer, ReviewInput, ReviewResult, ScreenInput, ScreenResult } from "./judge";
export { createNearAiReviewer, NEAR_AI_DEFAULT_MODEL, NEAR_AI_URL, type NearAiReviewerOptions } from "./near-ai";
export { type Rule, RULEBOOK_VERSION, ruleById, rulebookText, RULES } from "./rulebook";
export { checkProof, type PrivateInferenceProof, type ProofCheck, proofChecks, quoteReportData, recoverSigner } from "./tee-proof";

/**
 * The configured reviewer: private review on NEAR AI Cloud when the NEAR add-on passes a
 * NEAR_AI_API_KEY through (addonEnv drops it while NEAR is off), else Claude, else null (tasks
 * then wait for humans). Private review never falls back to Claude: a task it can't settle is
 * retried or goes to a person, so every AI verdict on that deployment stays private.
 */
export async function loadReviewer(env: Record<string, string | undefined> = process.env) {
  if (env.NEAR_AI_API_KEY) {
    const { createNearAiReviewer } = await import("./near-ai");
    return createNearAiReviewer({ apiKey: env.NEAR_AI_API_KEY, model: env.NEAR_AI_MODEL || undefined });
  }
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return null;
  const { createClaudeReviewer } = await import("./claude");
  return createClaudeReviewer({
    model: env.BRAIN_MODEL || undefined,
    effort: (env.BRAIN_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || undefined,
  });
}
