/**
 * A person's PayPal checkout in flight: `<order id>.<task id>`, set when they press Pay with
 * PayPal and read when PayPal sends them back to /paypal/approved.
 */
export const CHECKOUT_COOKIE = "boreal_checkout";

export function readCheckout(value: string | undefined): { orderId: string; taskId: string } | null {
  const match = /^([A-Z0-9-]{6,64})\.([0-9a-f-]{36})$/i.exec(value ?? "");
  return match ? { orderId: match[1]!, taskId: match[2]! } : null;
}
