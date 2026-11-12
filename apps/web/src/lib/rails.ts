import type { PaymentRail } from "@boreal/concordium";

// How each payment rail pays a worker, in words workers see. Every payout goes to an account the
// worker holds themselves: boreal never keeps a wallet for anyone and never converts between rails.

export const RAIL_LABEL: Record<PaymentRail, string> = {
  paypal: "Paid via PayPal",
  near: "USDC on NEAR",
  concordium: "Paid in tokens",
  // The chain is a deployment setting (EVM_CHAIN_ID); pages that need it name it themselves.
  evm: "Paid in USDC",
};

/** The worker's payout details, as the desk's getWorker returns them. */
export interface PayoutProfile {
  paypalEmail: string | null;
  nearAccount: string | null;
  payoutAddress: string | null;
  evmAddress?: string | null;
}

/** True when the worker can be paid on this rail (test money and rail-less tasks need nothing). */
export function canBePaidOn(profile: PayoutProfile | null, rail: PaymentRail | null): boolean {
  if (!rail) return true;
  if (!profile) return false;
  return rail === "paypal" ? !!profile.paypalEmail : rail === "near" ? !!profile.nearAccount : rail === "evm" ? !!profile.evmAddress : !!profile.payoutAddress;
}
