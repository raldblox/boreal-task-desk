import type { Concordium, PaymentRail, PaymentRails, Payments } from "@boreal/concordium";
import { borealNetwork } from "@boreal/core";

import { createPayPalAccounts, type PayPalAccounts } from "./accounts";
import { createPayPalClient, PAYPAL_LIVE_URL, PAYPAL_SANDBOX_URL } from "./client";
import { createPayPalPayments, type PayPalPayments } from "./payments";

export { createPayPalAccounts, LOGIN_SCOPES, type PayPalAccounts, type PayPalLogin, paypalPseudonym } from "./accounts";
export { createPayPalClient, fromValue, PAYPAL_LIVE_URL, PAYPAL_SANDBOX_URL, type PayPalClient, PayPalError, toValue } from "./client";
export { createPayPalPayments, PayPalPaymentError, type PayPalOrder, type PayPalPayments, type PayPalPaymentsOptions } from "./payments";
export { type PayoutUpdate, payoutUpdateFrom, type PayPalWebhookEvent, verifyWebhook, WebhookVerificationError } from "./webhooks";

/** The rails switched on: `PAYMENT_RAILS=concordium,paypal`, or the older `PAYMENTS_RAIL=paypal`. */
function railsOn(env: Record<string, string | undefined>): Set<string> | null {
  if (env.PAYMENT_RAILS) return new Set(env.PAYMENT_RAILS.split(",").map((r) => r.trim()).filter(Boolean));
  return env.PAYMENTS_RAIL === "paypal" ? new Set(["paypal"]) : null;
}

/**
 * Which PayPal this deployment talks to. It follows the network: the sandbox on testnet, live
 * PayPal on mainnet, and refuses the other pairing, so sandbox money never reaches real
 * workers and real money never lands on the testnet site.
 */
export function paypalTarget(env: Record<string, string | undefined>): { mode: "sandbox" | "live"; apiUrl: string; webUrl: string } {
  const network = borealNetwork(env);
  const mode = env.PAYPAL_ENV || (network === "mainnet" ? "live" : "sandbox");
  if (mode !== "sandbox" && mode !== "live") throw new Error(`PAYPAL_ENV must be sandbox or live, not ${mode}`);
  if (network === "mainnet" && mode === "sandbox") throw new Error("the PayPal sandbox is refused on mainnet: real workers would be paid in sandbox money");
  if (network === "testnet" && mode === "live") throw new Error("live PayPal is refused on testnet: testnet never takes real money");
  return mode === "live"
    ? { mode, apiUrl: PAYPAL_LIVE_URL, webUrl: "https://www.paypal.com" }
    : { mode, apiUrl: PAYPAL_SANDBOX_URL, webUrl: "https://www.sandbox.paypal.com" };
}

/** The PayPal rail from the environment, or null when it isn't switched on. */
export function loadPayPal(
  env: Record<string, string | undefined>,
  options: { escrowBalance: () => Promise<number> },
): PayPalPayments | null {
  if (!railsOn(env)?.has("paypal")) return null;
  const target = paypalTarget(env);
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PAYMENTS_RAIL=paypal needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  const site = env.PUBLIC_URL ?? "http://localhost:3000";
  return createPayPalPayments({
    clientId,
    clientSecret,
    baseUrl: target.apiUrl,
    returnUrl: `${site}/paypal/approved`,
    cancelUrl: `${site}/paypal/cancelled`,
    // Saving the payer's account needs the Vault option on the PayPal app.
    vault: env.PAYPAL_VAULT !== "off",
    escrowBalance: options.escrowBalance,
  });
}

/**
 * Connecting PayPal accounts (owners saving one for an agent, workers logging in for payouts),
 * on the same app and with the same checks as the PayPal rail. Null when the rail is off.
 */
export function loadPayPalAccounts(env: Record<string, string | undefined>): PayPalAccounts | null {
  if (!railsOn(env)?.has("paypal")) return null;
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const target = paypalTarget(env);
  return createPayPalAccounts({
    client: createPayPalClient({ clientId, clientSecret, baseUrl: target.apiUrl }),
    clientId,
    clientSecret,
    baseUrl: target.apiUrl,
    webUrl: target.webUrl,
    // Set once Log in with PayPal is on for the app, with /paypal/login/done as its return URL.
    loginEnabled: env.PAYPAL_LOGIN === "on",
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
