import type { PayPalClient } from "./client";

// PayPal webhooks for payouts. A payout is accepted at once but settles later: PayPal tells us
// with PAYMENT.PAYOUTS-ITEM.* events, which the desk applies to the ledger through the outbox.

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    payout_item_id?: string;
    transaction_id?: string;
    transaction_status?: string;
    payout_batch_id?: string;
    payout_item?: { sender_item_id?: string };
    errors?: { name?: string; message?: string };
  };
}

/** What a payout event means for its ledger entry. */
export interface PayoutUpdate {
  ledgerKey: string;
  status: "settled" | "failed";
  txHash?: string;
  detail: string;
}

const FAILED = new Set(["FAILED", "RETURNED", "BLOCKED", "DENIED", "CANCELED", "REFUNDED", "REVERSED"]);

/**
 * Reads a payout item event. Succeeded settles the entry; failed, returned, blocked and the
 * like put the money back in escrow for an operator. Unclaimed and held change nothing yet:
 * PayPal returns unclaimed money after 30 days, which arrives as RETURNED.
 */
export function payoutUpdateFrom(event: PayPalWebhookEvent): PayoutUpdate | null {
  const match = /^PAYMENT\.PAYOUTS-ITEM\.([A-Z_]+)$/.exec(event.event_type);
  const ledgerKey = event.resource?.payout_item?.sender_item_id;
  if (!match || !ledgerKey) return null;
  const outcome = match[1]!;
  const detail = `${event.event_type} (${event.id})${event.resource?.errors?.message ? `: ${event.resource.errors.message}` : ""}`;
  if (outcome === "SUCCEEDED") {
    const txn = event.resource?.transaction_id;
    return { ledgerKey, status: "settled", txHash: txn ? `paypal:txn:${txn}` : undefined, detail };
  }
  if (FAILED.has(outcome)) return { ledgerKey, status: "failed", detail };
  return null;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/** Asks PayPal whether a webhook delivery is genuine, using the transmission headers it was sent with. */
export async function verifyWebhook(
  client: PayPalClient,
  webhookId: string,
  headers: Headers,
  event: PayPalWebhookEvent,
): Promise<void> {
  const header = (name: string) => {
    const value = headers.get(name);
    if (!value) throw new WebhookVerificationError(`missing ${name} header`);
    return value;
  };
  const result = await client.request<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: header("paypal-auth-algo"),
      cert_url: header("paypal-cert-url"),
      transmission_id: header("paypal-transmission-id"),
      transmission_sig: header("paypal-transmission-sig"),
      transmission_time: header("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  if (result.verification_status !== "SUCCESS") {
    throw new WebhookVerificationError(`PayPal says the webhook is ${result.verification_status}`);
  }
}
