// The brain does judgment steps only. Nothing here changes task state: callers feed the
// result into the desk, and anything undecided goes to a human.

export {
  type ClaudeReviewerOptions,
  createClaudeReviewer,
  type Reviewer,
  type ReviewInput,
  type ReviewResult,
  type ScreenInput,
  type ScreenResult,
} from "./claude";
export { type Rule, RULEBOOK_VERSION, ruleById, rulebookText, RULES } from "./rulebook";

/** The configured reviewer, or null without Claude credentials (tasks then wait for humans). */
export async function loadReviewer(env: Record<string, string | undefined> = process.env) {
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) return null;
  const { createClaudeReviewer } = await import("./claude");
  return createClaudeReviewer({
    model: env.BRAIN_MODEL || undefined,
    effort: (env.BRAIN_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || undefined,
  });
}
