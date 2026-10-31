import type { Concordium, Payments } from "@boreal/concordium";

import { PAYPAL_SANDBOX_URL } from "./client";
import { createPayPalPayments, type PayPalPayments } from "./payments";

export { createPayPalClient, fromValue, PAYPAL_SANDBOX_URL, type PayPalClient, PayPalError, toValue } from "./client";
export { createPayPalPayments, PayPalPaymentError, type PayPalOrder, type PayPalPayments, type PayPalPaymentsOptions } from "./payments";
export { type PayoutUpdate, payoutUpdateFrom, type PayPalWebhookEvent, verifyWebhook, WebhookVerificationError } from "./webhooks";

/**
 * The PayPal rail from the environment, or null when `PAYMENTS_RAIL` isn't `paypal`.
 * Sandbox only for now; sandbox money is fake, so it is refused on production.
 */
export function loadPayPal(
  env: Record<string, string | undefined>,
  options: { escrowBalance: () => Promise<number> },
): PayPalPayments | null {
  if (env.PAYMENTS_RAIL !== "paypal") return null;
  const mode = env.PAYPAL_ENV ?? "sandbox";
  if (mode !== "sandbox") throw new Error(`PAYPAL_ENV=${mode} is not supported yet; only sandbox`);
  if (env.VERCEL_ENV === "production") {
    throw new Error("the PayPal sandbox is refused on production: real workers would be paid in sandbox money");
  }
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYMENTS_RAIL=paypal needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  const site = env.PUBLIC_URL ?? "http://localhost:3000";
  return createPayPalPayments({
    clientId,
    clientSecret,
    baseUrl: PAYPAL_SANDBOX_URL,
    returnUrl: `${site}/paypal/approved`,
    cancelUrl: `${site}/paypal/cancelled`,
    escrowBalance: options.escrowBalance,
  });
}

/** The payment rail in use: PayPal when `PAYMENTS_RAIL=paypal`, else Concordium's, else none. */
export function loadPayments(
  env: Record<string, string | undefined>,
  concordium: Concordium | null,
  options: { escrowBalance: () => Promise<number> },
): Payments | null {
  return loadPayPal(env, options) ?? concordium?.payments ?? null;
}
