import { describe, expect, it } from "vitest";

import { fromValue, toValue } from "./client";
import { createFakePayPal } from "./fake-paypal";
import { loadPayPal, paypalTarget } from "./index";
import { createPayPalPayments } from "./payments";
import { payoutUpdateFrom, verifyWebhook } from "./webhooks";

function rail() {
  const paypal = createFakePayPal();
  const payments = createPayPalPayments({
    clientId: "id",
    clientSecret: "secret",
    fetch: paypal.fetch,
    returnUrl: "http://localhost:3000/paypal/approved",
    cancelUrl: "http://localhost:3000/paypal/cancelled",
    escrowBalance: async () => 0,
  });
  return { paypal, payments };
}

describe("amounts", () => {
  it("converts minor units both ways without floating point", () => {
    expect(toValue(1_234)).toBe("12.34");
    expect(toValue(5)).toBe("0.05");
    expect(fromValue("12.3")).toBe(1_230);
    expect(fromValue("0.07")).toBe(7);
    expect(() => toValue(1.5)).toThrow();
    expect(() => fromValue("1e3")).toThrow();
  });
});

describe("funding", () => {
  it("asks for approval, then authorizes and holds without capturing", async () => {
    const { paypal, payments } = rail();
    const requirement = await payments.createPaymentRequest("task-1", 1_170);
    expect(requirement.extra?.approveUrl).toContain(requirement.nonce);
    expect(requirement.amount).toBe(1_170);

    await expect(payments.confirmPayment("task-1", { orderId: requirement.nonce })).rejects.toThrow(/approve/);
    paypal.approve(requirement.nonce);
    const confirmed = await payments.confirmPayment("task-1", { orderId: requirement.nonce });
    expect(confirmed.amount).toBe(1_170);
    expect(confirmed.hold).toMatch(/^AUTH/);
    expect(paypal.authorizations.get(confirmed.hold!)?.status).toBe("CREATED");

    // A retry after a lost response finds the same hold rather than failing.
    expect((await payments.confirmPayment("task-1", { orderId: requirement.nonce })).hold).toBe(confirmed.hold);
  });

  it("refuses an order made for another task", async () => {
    const { paypal, payments } = rail();
    const requirement = await payments.createPaymentRequest("task-1", 500);
    paypal.approve(requirement.nonce);
    await expect(payments.confirmPayment("task-2", { orderId: requirement.nonce })).rejects.toThrow(/another task/);
    await expect(payments.confirmPayment("task-1", { orderId: "../x" })).rejects.toThrow(/orderId/);
  });
});

describe("holds", () => {
  async function held(amount: number) {
    const r = rail();
    const requirement = await r.payments.createPaymentRequest("task-1", amount);
    r.paypal.approve(requirement.nonce);
    const { hold } = await r.payments.confirmPayment("task-1", requirement.nonce);
    return { ...r, hold: hold! };
  }

  it("captures part of a hold once, however often it is retried", async () => {
    const { paypal, payments, hold } = await held(1_170);
    const first = await payments.holds.capture(hold, 120, "task-1:capture");
    const again = await payments.holds.capture(hold, 120, "task-1:capture");
    expect(again.txHash).toBe(first.txHash);
    expect(paypal.authorizations.get(hold)).toMatchObject({ status: "PARTIALLY_CAPTURED", captured: "1.20" });
  });

  it("releases a hold, and treats an already voided one as released", async () => {
    const { paypal, payments, hold } = await held(500);
    await payments.holds.release(hold, "task-1:release");
    await payments.holds.release(hold, "another-key");
    expect(paypal.authorizations.get(hold)?.status).toBe("VOIDED");
  });
});

describe("payouts", () => {
  it("sends one payout per ledger key, never two", async () => {
    const { paypal, payments } = rail();
    const transfer = { to: "maria@example.com", amount: 1_000, idempotencyKey: "task-1:pay-worker" };
    const first = await payments.sponsoredTransfer(transfer);
    expect(first.txHash).toMatch(/^paypal:payout:BATCH/);
    await payments.sponsoredTransfer(transfer); // same request id: PayPal replays the answer
    await payments.sponsoredTransfer(transfer).catch(() => undefined);
    expect(paypal.payouts).toHaveLength(1);
    expect(paypal.payouts[0]).toMatchObject({ senderBatchId: "task-1:pay-worker", receiver: "maria@example.com", value: "10.00" });
  });
});

describe("webhooks", () => {
  const event = (type: string) => ({
    id: "WH-1",
    event_type: type,
    resource: { transaction_id: "TXN1", payout_item: { sender_item_id: "task-1:pay-worker" } },
  });

  it("maps payout item events to ledger updates", () => {
    expect(payoutUpdateFrom(event("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"))).toMatchObject({
      ledgerKey: "task-1:pay-worker",
      status: "settled",
      txHash: "paypal:txn:TXN1",
    });
    expect(payoutUpdateFrom(event("PAYMENT.PAYOUTS-ITEM.RETURNED"))?.status).toBe("failed");
    expect(payoutUpdateFrom(event("PAYMENT.PAYOUTS-ITEM.UNCLAIMED"))).toBeNull();
    expect(payoutUpdateFrom(event("CHECKOUT.ORDER.APPROVED"))).toBeNull();
  });

  it("asks PayPal to verify each delivery", async () => {
    const { payments } = rail();
    const headers = (sig: string) =>
      new Headers({
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-transmission-id": "t1",
        "paypal-transmission-sig": sig,
        "paypal-transmission-time": "2026-11-02T00:00:00Z",
      });
    const e = event("PAYMENT.PAYOUTS-ITEM.SUCCEEDED");
    await expect(verifyWebhook(payments.client, "WH-ID", headers("genuine"), e)).resolves.toBeUndefined();
    await expect(verifyWebhook(payments.client, "WH-ID", headers("forged"), e)).rejects.toThrow(/FAILURE/);
    await expect(verifyWebhook(payments.client, "WH-ID", new Headers(), e)).rejects.toThrow(/missing/);
  });
});

describe("loadPayPal", () => {
  const base = { PAYMENTS_RAIL: "paypal", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };
  const opts = { escrowBalance: async () => 0 };

  it("is off unless PAYMENTS_RAIL=paypal", () => {
    expect(loadPayPal({}, opts)).toBeNull();
  });

  it("follows the network: sandbox on testnet, live on mainnet, never the other pairing", () => {
    expect(paypalTarget({}).mode).toBe("sandbox");
    expect(paypalTarget({ BOREAL_NETWORK: "mainnet" })).toMatchObject({ mode: "live", apiUrl: "https://api-m.paypal.com" });
    expect(() => loadPayPal({ ...base, PAYPAL_ENV: "live" }, opts)).toThrow(/refused on testnet/);
    expect(() => loadPayPal({ ...base, BOREAL_NETWORK: "mainnet", PAYPAL_ENV: "sandbox" }, opts)).toThrow(/refused on mainnet/);
    expect(() => loadPayPal({ PAYMENTS_RAIL: "paypal" }, opts)).toThrow(/PAYPAL_CLIENT_ID/);
    expect(loadPayPal(base, opts)?.holds).toBeDefined();
    expect(loadPayPal({ ...base, BOREAL_NETWORK: "mainnet" }, opts)?.holds).toBeDefined();
  });
});
