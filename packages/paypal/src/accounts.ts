import type { PayPalClient } from "./client";
import { PayPalError } from "./client";

// Connecting PayPal accounts, outside any task:
// - An owner saves their PayPal account for an agent (vault without purchase): a setup token
//   the owner approves on PayPal, exchanged for a payment token. Its id is the vault id
//   the desk already pays from, so the agent funds tasks with no approval page.
// - A worker logs in with PayPal, so payouts go to an email PayPal vouches for instead of
//   one typed by hand. Needs "Log in with PayPal" on the PayPal app, with the return URL.

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
}

export interface PayPalAccounts {
  /** Starts saving the owner's PayPal account; send them to `approveUrl`. */
  startSaving(input: { returnUrl: string; cancelUrl: string }): Promise<{ setupTokenId: string; approveUrl: string }>;
  /** After approval: the vault id to pay from, and the account's email when PayPal shares it. */
  finishSaving(setupTokenId: string): Promise<{ vaultId: string; email?: string }>;
  /** Log in with PayPal: where to send the worker. */
  loginUrl(input: { redirectUri: string; state: string }): string;
  /** The worker's PayPal account after they logged in, from the code PayPal sent back. */
  loggedIn(input: { code: string }): Promise<{ email: string; payerId?: string }>;
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
}

export function createPayPalAccounts(options: PayPalAccountsOptions): PayPalAccounts {
  const http = options.fetch ?? fetch;
  const brand = options.brandName ?? "boreal.work";
  const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");

  return {
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
        scope: "openid email",
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
      });
      if (!tokenRes.ok) throw new PayPalError(tokenRes.status, "LOGIN_FAILED", [], "PayPal didn't accept the login");
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const infoRes = await http(`${options.baseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!infoRes.ok) throw new PayPalError(infoRes.status, "USERINFO_FAILED", [], "PayPal didn't share the account's email");
      const info = (await infoRes.json()) as UserInfo;
      const email = info.emails?.find((e) => e.primary)?.value ?? info.emails?.[0]?.value ?? info.email;
      if (!email) throw new PayPalError(400, "NO_EMAIL", [], "PayPal didn't share the account's email; allow email when you log in");
      return { email, ...(info.payer_id ? { payerId: info.payer_id } : {}) };
    },
  };
}
