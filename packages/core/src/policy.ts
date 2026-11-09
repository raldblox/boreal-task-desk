// Time limits and caps from the spec. Proposed defaults, tuned during the private beta.

const HOUR = 60 * 60 * 1000;

export const POLICY = {
  objectionWindowMs: 48 * HOUR,
  disputeDecisionMs: 72 * HOUR,
  reconcileIntervalMs: 5 * 60 * 1000,
  /** Beta ceilings, in minor units. */
  maxTaskBudget: 5_000,
  /** Tasks a requester can have posted but not yet funded. Nothing is screened until it's funded. */
  maxUnfundedTasks: 5,
  maxAgentDailySpend: 50_000,
  /**
   * Agents without a Verified by Concordium badge stay under these, whatever their owner sets.
   * A badge ties the agent to an accountable Concordium account, so it unlocks the full caps.
   */
  unverifiedTaskBudget: 1_000,
  unverifiedDailySpend: 5_000,
  claimDurationMs: 4 * HOUR,
  maxActiveClaimsPerNewWorker: 1,
  lostDisputesBeforePause: 3,
  lostDisputesWindowMs: 30 * 24 * HOUR,
  rulebookVersion: "1.0",
} as const;
