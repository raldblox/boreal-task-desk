import { describe, expect, it } from "vitest";

import { createPayPalAccounts } from "./accounts";
import type { PayPalClient } from "./client";

const calls: { method: string; path: string; body?: unknown }[] = [];
const client: PayPalClient = {
  async request(method, path, options) {
    calls.push({ method, path, body: options?.body });
    if (path === "/v3/vault/setup-tokens") {
      return { id: "SETUP-1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "approve", href: "https://paypal.test/approve/SETUP-1" }] } as never;
    }
    return { id: "VAULT-1", payment_source: { paypal: { email_address: "owner@example.com" } } } as never;
  },
};

let appScope = "openid https://uri.paypal.com/payments/payouts";
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/v1/oauth2/token") && String(init?.body).includes("client_credentials")) {
    return Response.json({ access_token: "app-token", scope: appScope });
  }
  if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "user-token" });
  if (url.includes("/v1/identity/oauth2/userinfo")) {
    return Response.json({ payer_id: "PAYER1", emails: [{ value: "old@example.com" }, { value: "maria@example.com", primary: true }] });
  }
  return new Response("not found", { status: 404 });
};

const accounts = createPayPalAccounts({
  client,
  clientId: "client-id",
  clientSecret: "client-secret",
  baseUrl: "https://api.paypal.test",
  webUrl: "https://www.paypal.test",
  fetch: fakeFetch,
});

describe("connecting PayPal accounts", () => {
  it("offers saving accounts only when PayPal granted the app the Vault scope", async () => {
    expect(await accounts.canSaveAccounts()).toBe(false);
    appScope += " https://uri.paypal.com/services/vault/payment-tokens/readwrite";
    const fresh = createPayPalAccounts({ client, clientId: "c", clientSecret: "s", baseUrl: "https://api.paypal.test", webUrl: "https://www.paypal.test", fetch: fakeFetch });
    expect(await fresh.canSaveAccounts()).toBe(true);
    expect(fresh.loginEnabled).toBe(false);
  });

  it("saves an owner's account without a purchase", async () => {
    const started = await accounts.startSaving({ returnUrl: "https://boreal.test/paypal/saved", cancelUrl: "https://boreal.test/me" });
    expect(started).toEqual({ setupTokenId: "SETUP-1", approveUrl: "https://paypal.test/approve/SETUP-1" });
    expect(calls[0]!.body).toMatchObject({
      payment_source: { paypal: { usage_type: "MERCHANT", experience_context: { return_url: "https://boreal.test/paypal/saved" } } },
    });

    expect(await accounts.finishSaving("SETUP-1")).toEqual({ vaultId: "VAULT-1", email: "owner@example.com" });
    expect(calls[1]).toMatchObject({
      path: "/v3/vault/payment-tokens",
      body: { payment_source: { token: { id: "SETUP-1", type: "SETUP_TOKEN" } } },
    });
  });

  it("logs a worker in with PayPal and reads their primary email", async () => {
    const url = new URL(accounts.loginUrl({ redirectUri: "https://boreal.test/paypal/login/done", state: "abc" }));
    expect(url.origin + url.pathname).toBe("https://www.paypal.test/connect/");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id",
      response_type: "code",
      scope: "openid email",
      redirect_uri: "https://boreal.test/paypal/login/done",
      state: "abc",
    });
    expect(await accounts.loggedIn({ code: "code-1" })).toEqual({ email: "maria@example.com", payerId: "PAYER1" });
  });
});
