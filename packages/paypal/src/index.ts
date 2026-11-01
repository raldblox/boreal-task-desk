import type { Concordium, PaymentRail, PaymentRails, Payments } from "@boreal/concordium";

import { PAYPAL_SANDBOX_URL } from "./client";
import { createPayPalPayments, type PayPalPayments } from "./payments";

export { createPayPalClient, fromValue, PAYPAL_SANDBOX_URL, type PayPalClient, PayPalError, toValue } from "./client";
export { createPayPalPayments, PayPalPaymentError, type PayPalOrder, type PayPalPayments, type PayPalPaymentsOptions } from "./payments";
export { type PayoutUpdate, payoutUpdateFrom, type PayPalWebhookEvent, verifyWebhook, WebhookVerificationError } from "./webhooks";

/** The rails switched on: `PAYMENT_RAILS=concordium,paypal`, or the older `PAYMENTS_RAIL=paypal`. */
function railsOn(env: Record<string, string | undefined>): Set<string> | null {
  if (env.PAYMENT_RAILS) return new Set(env.PAYMENT_RAILS.split(",").map((r) => r.trim()).filter(Boolean));
  return env.PAYMENTS_RAIL === "paypal" ? new Set(["paypal"]) : null;
}

/**
 * The PayPal rail from the environment, or null when it isn't switched on. Sandbox only for
 * now; sandbox money is fake, so production refuses it unless `PAYPAL_SANDBOX_ON_PRODUCTION=demo`
 * says the whole site is a demo (the site then shows a demo-money banner).
 */
export function loadPayPal(
  env: Record<string, string | undefined>,
  options: { escrowBalance: () => Promise<number> },
): PayPalPayments | null {
  if (!railsOn(env)?.has("paypal")) return null;
  const mode = env.PAYPAL_ENV ?? "sandbox";
  if (mode !== "sandbox") throw new Error(`PAYPAL_ENV=${mode} is not supported yet; only sandbox`);
  if (env.VERCEL_ENV === "production" && env.PAYPAL_SANDBOX_ON_PRODUCTION !== "demo") {
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
    // Saving the payer's account needs the Vault option on the PayPal app.
    vault: env.PAYPAL_VAULT !== "off",
    escrowBalance: options.escrowBalance,
  });
}

/**
 * Every configured rail, and the default one (for tasks that don't name a rail). Concordium's
 * rail is on when its adapters are and `PAYMENT_RAILS` doesn't leave it out. The default is
 * `DEFAULT_PAYMENT_RAIL`, else PayPal when it's on (agents need no wallet), else Concordium.
 */
export function loadRails(
  env: Record<string, string | undefined>,
  concordium: Concordium | null,
  options: { escrowBalance: (rail: PaymentRail) => Promise<number> },
): { rails: PaymentRails; payments: Payments | null } {
  const on = railsOn(env);
  const rails: PaymentRails = {};
  if (concordium?.payments && (!on || on.has("concordium"))) rails.concordium = concordium.payments;
  const paypal = loadPayPal(env, { escrowBalance: () => options.escrowBalance("paypal") });
  if (paypal) rails.paypal = paypal;
  const wanted = env.DEFAULT_PAYMENT_RAIL as PaymentRail | undefined;
  const payments = (wanted && rails[wanted]) || rails.paypal || rails.concordium || null;
  return { rails, payments };
}

/** The default payment rail (see loadRails). */
export function loadPayments(
  env: Record<string, string | undefined>,
  concordium: Concordium | null,
  options: { escrowBalance: () => Promise<number> },
): Payments | null {
  return loadPayPal(env, options) ?? concordium?.payments ?? null;
}
