// Fee rules from "Payments, custody and fees". All amounts are integer minor units
// (cents on mainnet's USD stablecoin) so no rounding error reaches the ledger.
//
// The requester pays one service fee on top of the worker's pay, and the worker keeps 100% of
// it. The service fee is 15% + $0.50 (10% + $0.50 when the requester reviews the result
// itself). It covers PayPal's processing (about 3.5% + $0.49 to collect and 2% to pay out),
// AI screening and review, a person when the AI is unsure, and running the service. Inside the
// ledger it is two parts: the platform part (10% + $0.50) and the review part (5%), which goes
// to whoever reviews.

export const FEE_POLICY = {
  /** The platform part of the service fee: 10% of the worker's pay ... */
  platformRate: 0.1,
  /** ... plus a fixed $0.50, which covers a payment's fixed cost (PayPal's is $0.49). */
  platformFixed: 50,
  /** The review part: 5%, none when the requester reviews the result itself. */
  reviewRate: 0.05,
  requesterDepositRate: 0.1,
  requesterDepositMin: 50,
  workerDepositRate: 0.1,
  workerDepositMax: 100,
} as const;

export interface FeeQuote {
  budget: number;
  platformFee: number;
  reviewFee: number;
  /** The one fee the requester sees: platformFee + reviewFee. */
  serviceFee: number;
  /** What the requester pays into escrow to open the task. */
  total: number;
}

function assertMinorUnits(amount: number, name: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(`${name} must be a positive integer in minor units`);
  }
}

/** `reviewer: "requester"` tasks carry no review fee: the requester does the reviewing itself. */
export function quoteFees(budget: number, { reviewer = "boreal" }: { reviewer?: "boreal" | "requester" } = {}): FeeQuote {
  assertMinorUnits(budget, "budget");
  const platformFee = Math.ceil(budget * FEE_POLICY.platformRate) + FEE_POLICY.platformFixed;
  const reviewFee = reviewer === "requester" ? 0 : Math.ceil(budget * FEE_POLICY.reviewRate);
  return { budget, platformFee, reviewFee, serviceFee: platformFee + reviewFee, total: budget + platformFee + reviewFee };
}

/**
 * The largest worker budget whose total (budget plus boreal.work's fees) fits in `available`
 * cents, or null when even the smallest task doesn't fit. Used when a buyer pays a fixed price
 * elsewhere (NEAR Agent Market) and the worker gets what's left after the fees.
 */
export function budgetWithin(available: number, options: { reviewer?: "boreal" | "requester" } = {}): number | null {
  if (!Number.isSafeInteger(available) || available <= 0) return null;
  const fits = (b: number) => b > 0 && quoteFees(b, options).total <= available;
  // Below the fixed fee the guess goes negative: start from nothing and let the checks decide.
  let budget = Math.max(0, Math.floor((available - FEE_POLICY.platformFixed) / (1 + FEE_POLICY.platformRate + FEE_POLICY.reviewRate)));
  while (budget > 0 && !fits(budget)) budget--;
  while (fits(budget + 1)) budget++;
  return budget > 0 ? budget : null;
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
