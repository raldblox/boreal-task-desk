// Time limits and caps from the spec. Proposed defaults, tuned during the private beta.

const HOUR = 60 * 60 * 1000;

export const POLICY = {
  objectionWindowMs: 48 * HOUR,
  disputeDecisionMs: 72 * HOUR,
  /**
   * How long a requester who reviews its own task has to judge a submission. After that the
   * submission goes to boreal.work's reviewers, so a silent requester never leaves a worker unpaid.
   */
  requesterReviewMs: 72 * HOUR,
  /** How long an owner has to approve a payment their agent asked for ("ask me each time"). */
  fundingApprovalMs: 24 * HOUR,
  /**
   * The furthest a deadline can be from posting. PayPal keeps an authorization for 29 days, and
   * a task's money is only held until it is final: the deadline, the review, the objection
   * window and a dispute must all fit inside that, or the hold lapses and nobody can be paid.
   */
  maxDeadlineMs: 14 * 24 * HOUR,
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
  rulebookVersion: "2.2",
} as const;
