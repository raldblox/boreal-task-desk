import { loadPayPalAccounts, type PayPalAccounts } from "@boreal/paypal";

let accounts: PayPalAccounts | null | undefined;

/** Connecting PayPal accounts to boreal, or null when the PayPal rail is off. */
export function paypalAccounts(): PayPalAccounts | null {
  if (accounts === undefined) accounts = loadPayPalAccounts(process.env);
  return accounts;
}

/** The site's own origin, for PayPal's return URLs. */
export function siteUrl(request: Request): string {
  return process.env.PUBLIC_URL ?? new URL(request.url).origin;
}

/** A short-lived cookie that ties PayPal's redirect back to the request that started it. */
export const PAYPAL_COOKIE = { httpOnly: true, secure: true, sameSite: "lax", path: "/paypal", maxAge: 30 * 60 } as const;
