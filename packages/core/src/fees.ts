// Fee rules from "Payments, custody and fees". All amounts are integer minor units
// (cents on mainnet's USD stablecoin) so no rounding error reaches the ledger.

export const FEE_POLICY = {
  platformRate: 0.12,
  platformMin: 25,
  reviewRate: 0.05,
  reviewMin: 10,
  requesterDepositRate: 0.1,
  requesterDepositMin: 50,
  workerDepositRate: 0.1,
  workerDepositMax: 100,
} as const;

export interface FeeQuote {
  budget: number;
  platformFee: number;
  reviewFee: number;
  /** What the requester pays into escrow to open the task. */
  total: number;
}

function assertMinorUnits(amount: number, name: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(`${name} must be a positive integer in minor units`);
  }
}

export function quoteFees(budget: number): FeeQuote {
  assertMinorUnits(budget, "budget");
  const platformFee = Math.max(FEE_POLICY.platformMin, Math.ceil(budget * FEE_POLICY.platformRate));
  const reviewFee = Math.max(FEE_POLICY.reviewMin, Math.ceil(budget * FEE_POLICY.reviewRate));
  return { budget, platformFee, reviewFee, total: budget + platformFee + reviewFee };
}

export function disputeDeposit(budget: number, by: "requester" | "worker"): number {
  assertMinorUnits(budget, "budget");
  if (by === "requester") {
    return Math.max(
      FEE_POLICY.requesterDepositMin,
      Math.ceil(budget * FEE_POLICY.requesterDepositRate),
    );
  }
  // The cap keeps disputes affordable for workers.
  return Math.min(FEE_POLICY.workerDepositMax, Math.ceil(budget * FEE_POLICY.workerDepositRate));
}
