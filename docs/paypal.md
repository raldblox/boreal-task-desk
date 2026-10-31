# PayPal on boreal.work

Added in November 2026 for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com), whose submission window runs Oct 1 to Nov 12, 2026. This page says what was added and how to run it. The hackathon accepts existing projects that are "significantly updated" in the window; boreal's whole git history falls inside it (first commit 2026-10-30), and the PayPal work is listed below.

## What it does

An AI agent posts a real-world task (say, "photograph this shelf in Manila"), funds it through PayPal, and pays only if the result passes review. A verified human worker in the Philippines does the task. When the result passes, boreal captures the money and pays the worker with PayPal Payouts. PayPal's hackathon brief lists "a payout tool for gig workers that pays out the moment a task is approved". This is that tool, with an AI reviewer deciding "approved" and an agent as the buyer.

| boreal step | PayPal API |
| --- | --- |
| Agent calls `fund_task` | Orders v2: create an order with intent `AUTHORIZE`. The agent gets an `approveUrl` for its owner |
| Owner approves, agent calls `fund_task` again with `{ orderId }` | `POST /v2/checkout/orders/{id}/authorize`, run inside the desk's funding checks, so a refused task never holds money |
| Task passes (accepted early, or the objection window closes) | `POST /v2/payments/authorizations/{id}/capture` for the full amount |
| Task fails | Capture only the review fee with `final_capture: true`. PayPal releases the rest to the payer |
| Task cancelled after funding, or expires unclaimed | `POST /v2/payments/authorizations/{id}/void` |
| Worker and reviewer get paid | Payouts v1, one batch per ledger entry. The ledger idempotency key is the `sender_batch_id` and `sender_item_id` |
| PayPal reports a payout's outcome | `PAYMENT.PAYOUTS-ITEM.*` webhooks, verified with PayPal, then applied to the ledger through the outbox |

The money is held on the payer's PayPal account until the task is final, so an agent's owner never pays for work that failed, and boreal never handles money it might have to give back.

## What was added

- **`packages/paypal`** (new): a PayPal implementation of boreal's `Payments` port. It has a small REST client (OAuth client credentials, a `PayPal-Request-Id` on captures, voids and payouts so retries replay the first answer), the order, authorization, capture and void flow, Payouts, webhook verification and parsing, and `loadPayPal` / `loadPayments`, which pick the rail from `PAYMENTS_RAIL`.
- **Holds in the payment port** (`packages/concordium/src/index.ts`): an optional `holds` capability (`capture`, `release`). `confirmPayment` can return a `hold`. Concordium's rail is unchanged, and the desk only uses holds when a payment returns one.
- **Desk** (`packages/desk`):
  - A held funding is written as a pending ledger entry, and the task records the authorization (`tasks.funding_hold`, migration `0008`).
  - When the task is final, the same transaction that changes its state queues one `capture` or `release` in the outbox.
  - Once PayPal confirms, one transaction settles the funding entry, settles the refund and boreal's fee in place, and queues the payouts. A repeated capture never queues a payout twice.
  - `queuePaymentUpdate` queues a `reconcile` item that the outbox applies to the ledger. A failed or returned payout puts the money back in escrow and is logged for an operator.
- **Web app** (`apps/web`):
  - `fund_task` (MCP and `POST /api/v1/tasks/:id/fund`) works on either rail. On PayPal the MCP answer includes a ready-to-send message for the owner with the approval link.
  - `/api/paypal/webhook` handles payout events.
  - `/paypal/approved` and `/paypal/cancelled` are the pages PayPal returns the payer to.
  - Workers set their PayPal email on `/me`.
  - The agent guide (`/agents.md`, MCP instructions) explains PayPal funding.
- **Monitor**: drains the outbox whenever a payment rail is configured, so PayPal works without Concordium payments. Anchors wait if no anchor adapter is set.
- **Tests**:
  - `packages/paypal/src/payments.test.ts` covers the adapter against an in-memory PayPal (`fake-paypal.ts`).
  - `packages/paypal/src/loop.test.ts` runs the desk on PGlite through pass, fail, cancel, refused funding and a returned payout.
- **`pnpm --filter @boreal/paypal sandbox-loop`**: the full loop against the real PayPal sandbox.

## Run it

1. In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox), create a sandbox REST app. Note its client ID and secret, and the emails of a sandbox personal (buyer) account and a second personal account to receive payouts.
2. Put them in `.env.paypal` at the workspace root. The file is gitignored; never commit credentials:

   ```
   PAYMENTS_RAIL=paypal
   PAYPAL_CLIENT_ID=…
   PAYPAL_CLIENT_SECRET=…
   PAYPAL_SANDBOX_WORKER_EMAIL=worker@personal.example.com
   ```

   The worker email must be a sandbox **Personal** account (`…@personal.example.com`), not the app's Business account. Paying the business account from itself fails with `SELF_PAY_NOT_ALLOWED`.

3. Run the loop. It prints an approval link. Approve it as the sandbox buyer, and the script funds, completes, reviews, captures and pays out:

   ```bash
   pnpm --filter @boreal/paypal sandbox-loop
   ```

   With `-- --card` it pays with PayPal's sandbox test card instead of the approval page. This needs card processing, which sandbox business accounts normally have.

4. To use the whole app locally on PayPal, run `pnpm dev:local`. It reads `.env.paypal`, and the seeded tasks wait for PayPal funding. An agent with the key in `.local/agent-key.txt` calls `fund_task` over MCP and gets the approval link. A worker signs in, sets a sandbox email on `/me`, and does the task.

5. Webhooks need a public URL. On a deployed preview, add a sandbox webhook for `https://<host>/api/paypal/webhook` with the `PAYMENT.PAYOUTS-ITEM.*` events and set `PAYPAL_WEBHOOK_ID`. Locally, the loop script reads the payout batch instead and applies the same update.

The PayPal sandbox is refused when `VERCEL_ENV=production`, and live mode isn't supported yet. Sandbox money is fake, and real workers must never be paid in it.

## Agents and PayPal's agent tools

boreal's MCP server (`/api/mcp`) is the agent's side of the desk: `post_task`, `fund_task`, `get_task`, `accept_result` and the rest. It runs alongside PayPal's own MCP server or Agent Toolkit, which an agent uses for its other PayPal work. Funding needs the owner to approve the PayPal checkout once per task. The approval link and the "held, not charged" wording come back in `fund_task`'s answer, ready to send.

## Known limits and next steps

- **Approval per task.** The next step is PayPal vaulting: the owner approves once, and the agent then funds tasks inside its boreal spending limits with no approval page.
- **Authorization lifetime.** PayPal honours an authorization for 3 days and lets it be captured for up to 29. A task whose deadline, objection window and dispute run past that needs reauthorizing. That isn't built yet, so keep PayPal tasks short.
- **Fees.** PayPal's processing fee on a capture comes out of boreal's side. The platform fee has to cover it.
- **Escrow check.** boreal's PayPal balance also holds its fees, net of PayPal's own. So on PayPal the escrow balance is read from the ledger, and each capture and payout is reconciled one by one through webhooks.
- **Worker email.** A PayPal email is personal data. It is stored only in boreal's database, never on-chain.
- **Verified against the live sandbox up to the payouts.** The order, authorization and capture ran against the real PayPal sandbox on 2026-11-02, and the payout batches were accepted. The tests use an in-memory PayPal.
