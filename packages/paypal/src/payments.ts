import { randomUUID } from "node:crypto";

import type { ConfirmedPayment, PayPalPaymentRequirement, Payments, PaymentVault } from "@boreal/concordium";

import { createPayPalClient, fromValue, type PayPalClient, type PayPalClientOptions, PayPalError, toValue } from "./client";

// boreal's `Payments` port on PayPal. Funding is an Order with intent AUTHORIZE: the payer
// approves it, and `confirmPayment` authorizes it inside the desk's funding checks, so the
// money is only held. The desk captures the hold when the task is final (all of it on a pass,
// the review fee on a fail) and voids it when the task is refunded. Workers are paid with
// PayPal Payouts, the ledger idempotency key as the batch id.
//
// Vaulting: the first approved order also asks PayPal to save the payer's PayPal account
// (vault with purchase). The vault id comes back with the authorization, and later orders
// pay from it with no approval page; the desk still runs every funding check first.

export interface PayPalPaymentsOptions extends PayPalClientOptions {
  /** Where PayPal sends the payer after approving or cancelling. */
  returnUrl: string;
  cancelUrl: string;
  currency?: string;
  brandName?: string;
  /** PayPal's balance also holds boreal's fees, net of PayPal's own, so escrow is read from the ledger. */
  escrowBalance: () => Promise<number>;
  /** An existing client, for tests and scripts that share one. */
  client?: PayPalClient;
  /**
   * Ask PayPal to save the payer's account with each approved order (default true). Needs
   * the Vault option on the PayPal app; turn it off where it isn't enabled.
   */
  vault?: boolean;
}

export class PayPalPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalPaymentError";
  }
}

/** An unapproved Order lapses after three hours; ask for a fresh one after that. */
const ORDER_TTL_MS = 3 * 60 * 60 * 1000;

interface Money {
  currency_code: string;
  value: string;
}
interface Authorization {
  id: string;
  status: string;
  amount: Money;
}
export interface PayPalOrder {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { custom_id?: string; amount?: Money; payments?: { authorizations?: Authorization[] } }[];
  payment_source?: { paypal?: { attributes?: { vault?: { id?: string; status?: string } } } };
}

/** The vault id PayPal returns once it has saved the payer's account (status VAULTED). */
function vaultIdOf(order: PayPalOrder): string | undefined {
  const vault = order.payment_source?.paypal?.attributes?.vault;
  return vault?.status === "VAULTED" && vault.id ? vault.id : undefined;
}

/** The order an agent approved: `{ orderId }`, the raw id, or the requirement it was given. */
function orderIdOf(payment: unknown): string {
  if (typeof payment === "string") return check(payment);
  const p = payment as { orderId?: unknown; requirement?: { nonce?: unknown }; nonce?: unknown } | null;
  return check(p?.orderId ?? p?.requirement?.nonce ?? p?.nonce);

  function check(id: unknown): string {
    if (typeof id !== "string" || !/^[A-Z0-9-]{6,64}$/i.test(id)) {
      throw new PayPalPaymentError("payment must be { orderId } for the PayPal order you approved");
    }
    return id;
  }
}

export type PayPalPayments = Payments<PayPalPaymentRequirement> & { holds: NonNullable<Payments["holds"]>; client: PayPalClient };

export function createPayPalPayments(options: PayPalPaymentsOptions): PayPalPayments {
  const client = options.client ?? createPayPalClient(options);
  const currency = options.currency ?? "USD";
  const brand = options.brandName ?? "boreal.work";
  const now = options.now ?? (() => new Date());
  const saveForLater = options.vault ?? true;

  const purchaseUnit = (taskId: string, amount: number) => ({
    reference_id: taskId,
    custom_id: taskId,
    description: "boreal.work task escrow: paid only if the result passes review",
    amount: { currency_code: currency, value: toValue(amount) },
  });

  /** The order's authorization, checked: a live hold for this task in boreal's currency. */
  function heldPayment(order: PayPalOrder): ConfirmedPayment {
    const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) throw new PayPalPaymentError(`PayPal returned no authorization for order ${order.id}`);
    if (auth.status !== "CREATED") {
      throw new PayPalPaymentError(`PayPal authorization is ${auth.status}, not CREATED`);
    }
    const vaultId = vaultIdOf(order);
    return {
      txHash: `paypal:order:${order.id}`,
      amount: fromValue(auth.amount.value),
      hold: auth.id,
      ...(vaultId ? { vaultId } : {}),
    };
  }

  const vault: PaymentVault = {
    /** Authorizes a new order from the saved account. No approval page: the payer agreed once. */
    async pay(taskId, amount, vaultId) {
      let order = await client.request<PayPalOrder>("POST", "/v2/checkout/orders", {
        body: { intent: "AUTHORIZE", purchase_units: [purchaseUnit(taskId, amount)], payment_source: { paypal: { vault_id: vaultId } } },
        // A retry after a lost response replays the same order, so the payer is never held twice.
        requestId: `${taskId}:fund:${vaultId}`,
      });
      if (order.status === "PAYER_ACTION_REQUIRED") {
        throw new PayPalPaymentError("PayPal wants the payer to approve again; the saved account can't be used");
      }
      // PayPal may authorize on create; if not, the order needs no approval and authorizes now.
      if (!order.purchase_units?.[0]?.payments?.authorizations?.length) {
        order = await client.request<PayPalOrder>("POST", `/v2/checkout/orders/${order.id}/authorize`, {
          requestId: `${taskId}:authorize:${order.id}`,
        });
      }
      return heldPayment(order);
    },
  };

  return {
    client,
    ...(saveForLater ? { vault } : {}),

    async createPaymentRequest(taskId, amount): Promise<PayPalPaymentRequirement> {
      const order = await client.request<PayPalOrder>("POST", "/v2/checkout/orders", {
        // PayPal requires a request id on orders that name a payment source. Each call is a new order.
        requestId: `${taskId}:order:${randomUUID()}`,
        body: {
          intent: "AUTHORIZE",
          purchase_units: [purchaseUnit(taskId, amount)],
          payment_source: {
            paypal: {
              // Save the payer's account when the order succeeds, so later tasks need no approval.
              ...(saveForLater ? { attributes: { vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT" } } } : {}),
              experience_context: {
                brand_name: brand,
                shipping_preference: "NO_SHIPPING",
                user_action: "CONTINUE",
                return_url: options.returnUrl,
                cancel_url: options.cancelUrl,
              },
            },
          },
        },
      });
      const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
      if (!approveUrl) throw new PayPalPaymentError(`PayPal order ${order.id} has no approval link`);
      return {
        scheme: "exact",
        network: "paypal",
        asset: currency,
        payTo: brand,
        amount,
        resource: taskId,
        nonce: order.id,
        expiresAt: new Date(now().getTime() + ORDER_TTL_MS).toISOString(),
        extra: { rail: "paypal", orderId: order.id, approveUrl },
      };
    },

    /** Authorizes the approved order. Nothing is captured: the money is held until the task is final. */
    async confirmPayment(taskId, payment): Promise<ConfirmedPayment> {
      const orderId = orderIdOf(payment);
      const order = await client.request<PayPalOrder>("GET", `/v2/checkout/orders/${orderId}`);
      const unit = order.purchase_units?.[0];
      if (unit?.custom_id !== taskId) throw new PayPalPaymentError("payment is for another task");
      if (unit.amount?.currency_code !== currency) throw new PayPalPaymentError(`payment must be in ${currency}`);

      let authorized = order;
      // A retry after a lost response finds the order already authorized. No PayPal-Request-Id
      // here: PayPal would replay a "not approved" answer after the payer has approved.
      if (!unit.payments?.authorizations?.length) {
        try {
          authorized = await client.request<PayPalOrder>("POST", `/v2/checkout/orders/${orderId}/authorize`);
        } catch (error) {
          if (error instanceof PayPalError && error.has(/NOT_APPROVED|PAYER_ACTION_REQUIRED/)) {
            throw new PayPalPaymentError("the PayPal order isn't approved yet: open the approveUrl, approve, then fund again");
          }
          throw error;
        }
      }
      return heldPayment(authorized);
    },

    holds: {
      async capture(hold, amount, idempotencyKey) {
        const capture = await client.request<{ id: string; status: string }>(
          "POST",
          `/v2/payments/authorizations/${hold}/capture`,
          {
            // final_capture releases whatever isn't captured back to the payer.
            body: { amount: { currency_code: currency, value: toValue(amount) }, final_capture: true, invoice_id: idempotencyKey },
            requestId: idempotencyKey,
          },
        );
        if (!["COMPLETED", "PENDING"].includes(capture.status)) {
          throw new PayPalPaymentError(`PayPal capture ${capture.id} is ${capture.status}`);
        }
        return { txHash: `paypal:capture:${capture.id}` };
      },

      async release(hold, idempotencyKey) {
        try {
          await client.request("POST", `/v2/payments/authorizations/${hold}/void`, { requestId: idempotencyKey });
        } catch (error) {
          // Already voided or lapsed: either way the payer has the money back.
          if (error instanceof PayPalError && error.has(/VOIDED|EXPIRED/)) return;
          throw error;
        }
      },
    },

    async sponsoredTransfer(transfer) {
      try {
        const batch = await client.request<{ batch_header: { payout_batch_id: string } }>("POST", "/v1/payments/payouts", {
          body: {
            sender_batch_header: {
              sender_batch_id: transfer.idempotencyKey,
              email_subject: "You've been paid for a boreal.work task",
              email_message: "Your result passed review. Thank you!",
            },
            items: [
              {
                recipient_type: "EMAIL",
                receiver: transfer.to,
                amount: { currency, value: toValue(transfer.amount) },
                sender_item_id: transfer.idempotencyKey,
                note: "boreal.work task payout",
              },
            ],
          },
          requestId: transfer.idempotencyKey,
        });
        return { txHash: `paypal:payout:${batch.batch_header.payout_batch_id}` };
      } catch (error) {
        // PayPal refuses a reused sender_batch_id: the first send went through, so never send again.
        if (error instanceof PayPalError && error.has(/duplicate|already exists/i)) {
          return { txHash: `paypal:payout-batch:${transfer.idempotencyKey}` };
        }
        throw error;
      }
    },

    escrowBalance: options.escrowBalance,
  };
}
