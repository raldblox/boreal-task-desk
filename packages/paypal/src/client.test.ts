import { describe, expect, it } from "vitest";

import { createPayPalClient, PayPalError } from "./client";

// RS-8 (docs/readiness.md): a PayPal call that never answers must not hang the caller, which
// may be holding a task's row lock or the monitor's lease.
describe("timeouts", () => {
  const token = () => new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
  /** Answers the token call, then never answers anything else until it is aborted. */
  const hangs: typeof fetch = (url, init) =>
    String(url).endsWith("/v1/oauth2/token")
      ? Promise.resolve(token())
      : new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        });

  it("gives up on a call PayPal never answers, with an error that says so", async () => {
    const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetch: hangs, timeoutMs: 30 });
    const failed = await client.request("GET", "/v2/checkout/orders/1").catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(PayPalError);
    expect((failed as PayPalError).errorName).toBe("TIMEOUT");
    expect((failed as PayPalError).message).toContain("didn't answer");
  });

  it("times out the token call too", async () => {
    const never: typeof fetch = (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    const client = createPayPalClient({ clientId: "id", clientSecret: "secret", fetch: never, timeoutMs: 30 });
    await expect(client.request("GET", "/v2/checkout/orders/1")).rejects.toMatchObject({ errorName: "TIMEOUT" });
  });
});
