import { loadPayPalAccounts, type PayPalAccounts, type PayPalLogin, paypalPseudonym } from "@boreal/paypal";
import type { PayPalIdentity } from "@boreal/desk";

import { gatedEnv, pseudonymSecret } from "./addons";

let accounts: PayPalAccounts | null | undefined;

/** Connecting PayPal accounts to boreal, or null when the PayPal rail is off. */
export function paypalAccounts(): PayPalAccounts | null {
  if (accounts === undefined) accounts = loadPayPalAccounts(gatedEnv());
  return accounts;
}

/** Log in with PayPal is on: the app has it set up, and there is a secret to hash identities with. */
export function paypalLoginEnabled(): boolean {
  return (paypalAccounts()?.loginEnabled ?? false) && pseudonymSecret() !== null;
}

/** The worker's PayPal identity: only a keyed hash of the payer_id leaves this function. */
export function paypalIdentity(login: PayPalLogin): PayPalIdentity {
  const secret = pseudonymSecret();
  if (!secret) throw new Error("BOREAL_PSEUDONYM_SECRET (32+ characters) is required for Log in with PayPal");
  return { ref: paypalPseudonym(login.payerId, secret), email: login.email, verified: login.verified };
}

/** The site's own origin, for PayPal's return URLs. */
export function siteUrl(request: Request): string {
  return process.env.PUBLIC_URL ?? new URL(request.url).origin;
}

/** A short-lived cookie that ties PayPal's redirect back to the request that started it. */
export const PAYPAL_COOKIE = { httpOnly: true, secure: true, sameSite: "lax", path: "/paypal", maxAge: 30 * 60 } as const;
