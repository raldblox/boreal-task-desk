// The brain does judgment steps only. Every job has a non-AI fallback, and nothing here
// changes task state: callers feed the result into the core state machine.

export interface BrainJob<In, Out> {
  name: "intake" | "safety" | "review" | "dispute_summary";
  run(input: In): Promise<Out>;
  fallback(input: In, error: unknown): Promise<Out>;
}

export async function runJob<In, Out>(job: BrainJob<In, Out>, input: In): Promise<Out> {
  try {
    return await job.run(input);
  } catch (error) {
    return job.fallback(input, error);
  }
}

export interface ReviewInput {
  description: string;
  acceptanceCriteria: string[];
  submission: { text?: string; fileUrls: string[] };
  rulebookVersion: string;
}

export type ReviewOutput =
  | { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string }
  /** No verdict: the submission goes to the human reviewer queue. */
  | { outcome: "needs_human"; reason: string };
