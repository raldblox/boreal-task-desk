// Time limits and caps from the spec. Proposed defaults, tuned during the private beta.

const HOUR = 60 * 60 * 1000;

export const POLICY = {
  objectionWindowMs: 48 * HOUR,
  disputeDecisionMs: 72 * HOUR,
  reconcileIntervalMs: 5 * 60 * 1000,
  /** Beta ceilings, in minor units. */
  maxTaskBudget: 5_000,
  maxAgentDailySpend: 50_000,
  maxActiveClaimsPerNewWorker: 1,
  lostDisputesBeforePause: 3,
  lostDisputesWindowMs: 30 * 24 * HOUR,
  rulebookVersion: "1.0",
} as const;
