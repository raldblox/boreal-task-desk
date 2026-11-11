import { createHmac } from "node:crypto";

import type { PayPalClient } from "./client";
import { PayPalError } from "./client";

// Connecting PayPal accounts, outside any task:
// - An owner saves their PayPal account for an agent (vault without purchase): a setup token
//   the owner approves on PayPal, exchanged for a payment token. Its id is the vault id
//   the desk already pays from, so the agent funds tasks with no approval page.
// - A worker logs in with PayPal: it signs them in (or adds PayPal to their account), and
//   payouts go to the email PayPal vouches for. Needs "Log in with PayPal" on the PayPal app,
//   with the return URL and the scopes below.

export interface PayPalAccountsOptions {
  client: PayPalClient;
  clientId: string;
  clientSecret: string;
  /** PayPal's REST API, e.g. https://api-m.sandbox.paypal.com. */
  baseUrl: string;
  /** Where payers sign in, e.g. https://www.sandbox.paypal.com. */
  webUrl: string;
  brandName?: string;
  fetch?: typeof fetch;
  /** Log in with PayPal is set up on the app (with boreal's return URL); PayPal can't be asked. */
  loginEnabled?: boolean;
}

/** The scope PayPal grants an app once it may save payment methods (Vault v3). */
const VAULT_SCOPE = "https://uri.paypal.com/services/vault/payment-tokens/readwrite";

export interface PayPalAccounts {
  /** Workers can log in with PayPal: only when the app is set up for it. */
  readonly loginEnabled: boolean;
  /** PayPal lets this app save accounts: read from the scopes on its token, so a button never dead-ends. */
  canSaveAccounts(): Promise<boolean>;
  /** Starts saving the owner's PayPal account; send them to `approveUrl`. */
  startSaving(input: { returnUrl: string; cancelUrl: string }): Promise<{ setupTokenId: string; approveUrl: string }>;
  /** After approval: the vault id to pay from, and the account's email when PayPal shares it. */
  finishSaving(setupTokenId: string): Promise<{ vaultId: string; email?: string }>;
  /** Log in with PayPal: where to send the worker. */
  loginUrl(input: { redirectUri: string; state: string }): string;
  /** The worker's PayPal account after they logged in, from the code PayPal sent back. */
  loggedIn(input: { code: string }): Promise<PayPalLogin>;
}

export interface PayPalLogin {
  /** The account's primary email: where payouts go. */
  email: string;
  /** PayPal's stable account id. Only its keyed hash (`paypalPseudonym`) is ever stored. */
  payerId: string;
  /** PayPal's `verified_account` claim: PayPal has verified the account holder. */
  verified: boolean;
}

/**
 * Log in with PayPal's scopes: who the account is (openid), its email for payouts, and its
 * payer_id and verified_account (paypalattributes). The app must have the same options ticked.
 */
export const LOGIN_SCOPES = "openid email https://uri.paypal.com/services/paypalattributes";

/** A worker's PayPal identity: a keyed hash of the payer_id, so the id itself is never kept. */
export function paypalPseudonym(payerId: string, secret: string): string {
  return `pp:${createHmac("sha256", secret).update(`paypal:${payerId}`).digest("hex")}`;
}

interface SetupToken {
  id: string;
  status?: string;
  links?: { href: string; rel: string }[];
}

interface PaymentToken {
  id: string;
  payment_source?: { paypal?: { email_address?: string } };
}

interface UserInfo {
  user_id?: string;
  payer_id?: string;
  email?: string;
  emails?: { value: string; primary?: boolean; confirmed?: boolean }[];
  /** PayPal sends it as a string ("true") or a boolean. */
  verified_account?: string | boolean;
}

export function createPayPalAccounts(options: PayPalAccountsOptions): PayPalAccounts {
  const http = options.fetch ?? fetch;
  const brand = options.brandName ?? "boreal.work";
  const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
  let saving: { value: boolean; until: number } | null = null;

  return {
    loginEnabled: options.loginEnabled ?? false,

    async canSaveAccounts() {
      if (saving && saving.until > Date.now()) return saving.value;
      let value = false;
      try {
        const res = await http(`${options.baseUrl}/v1/oauth2/token`, {
          method: "POST",
          headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) value = ((await res.json()) as { scope?: string }).scope?.split(" ").includes(VAULT_SCOPE) ?? false;
      } catch {
        // PayPal unreachable: treat as unavailable for now and ask again soon.
      }
      // Re-checked every few minutes, so turning the option on in PayPal shows up without a deploy.
      saving = { value, until: Date.now() + 5 * 60_000 };
      return value;
    },

    async startSaving({ returnUrl, cancelUrl }) {
      const token = await options.client.request<SetupToken>("POST", "/v3/vault/setup-tokens", {
        requestId: `setup:${crypto.randomUUID()}`,
        body: {
          payment_source: {
            paypal: {
              description: `${brand} pays for your agent's tasks from this account`,
              usage_type: "MERCHANT",
              usage_pattern: "IMMEDIATE",
              customer_type: "CONSUMER",
              experience_context: {
                brand_name: brand,
                shipping_preference: "NO_SHIPPING",
                vault_instruction: "ON_PAYER_APPROVAL",
                return_url: returnUrl,
                cancel_url: cancelUrl,
              },
            },
          },
        },
      });
      const approveUrl = token.links?.find((l) => l.rel === "approve")?.href;
      if (!approveUrl) throw new Error(`PayPal setup token ${token.id} has no approval link`);
      return { setupTokenId: token.id, approveUrl };
    },

    async finishSaving(setupTokenId) {
      const token = await options.client.request<PaymentToken>("POST", "/v3/vault/payment-tokens", {
        requestId: `vault:${setupTokenId}`,
        body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
      });
      const email = token.payment_source?.paypal?.email_address;
      return { vaultId: token.id, ...(email ? { email } : {}) };
    },

    loginUrl({ redirectUri, state }) {
      const url = new URL("/connect/", options.webUrl);
      url.search = new URLSearchParams({
        flowEntry: "static",
        client_id: options.clientId,
        response_type: "code",
        scope: LOGIN_SCOPES,
        redirect_uri: redirectUri,
        state,
      }).toString();
      return url.toString();
    },

    async loggedIn({ code }) {
      const tokenRes = await http(`${options.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
        signal: AbortSignal.timeout(20_000),
      });
      if (!tokenRes.ok) throw new PayPalError(tokenRes.status, "LOGIN_FAILED", [], "PayPal didn't accept the login");
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const infoRes = await http(`${options.baseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!infoRes.ok) throw new PayPalError(infoRes.status, "USERINFO_FAILED", [], "PayPal didn't share the account's email");
      const info = (await infoRes.json()) as UserInfo;
      const email = info.emails?.find((e) => e.primary)?.value ?? info.emails?.[0]?.value ?? info.email;
      if (!email) throw new PayPalError(400, "NO_EMAIL", [], "PayPal didn't share the account's email; allow email when you log in");
      if (!info.payer_id) {
        throw new PayPalError(400, "NO_PAYER_ID", [], "PayPal didn't share the account ID; the app needs the PayPal account ID option in Log in with PayPal");
      }
      return { email, payerId: info.payer_id, verified: String(info.verified_account) === "true" };
    },
  };
}
