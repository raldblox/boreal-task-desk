import { payoutUpdateFrom, type PayPalWebhookEvent, verifyWebhook, WebhookVerificationError } from "@boreal/paypal";
import { after } from "next/server";

import { getDesk, getPayPal } from "@/server/desk";
import { kickMonitor } from "@/server/monitor";

/**
 * PayPal webhooks. Each delivery is checked with PayPal (PAYPAL_WEBHOOK_ID), and payout item
 * events are queued in the outbox, which applies them to the ledger. Other events are
 * acknowledged and ignored, so PayPal stops retrying them.
 */
export async function POST(request: Request) {
  const paypal = getPayPal();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!paypal || !webhookId) return Response.json({ error: "unavailable" }, { status: 503 });

  let event: PayPalWebhookEvent;
  try {
    event = (await request.json()) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  try {
    await verifyWebhook(paypal.client, webhookId, request.headers, event);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      console.warn("[paypal webhook] rejected", error.message);
      return Response.json({ error: "unverified" }, { status: 400 });
    }
    throw error; // PayPal retries on 5xx
  }

  const update = payoutUpdateFrom(event);
  if (update) {
    await getDesk().queuePaymentUpdate(update);
    after(kickMonitor);
  }
  return Response.json({ received: true });
}
