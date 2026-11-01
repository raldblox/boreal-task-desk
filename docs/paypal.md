# PayPal on boreal.work

Added in November 2026 for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com), whose submission window runs Oct 1 to Nov 12, 2026. This page says what was added and how to run it. The hackathon accepts existing projects that are "significantly updated" in the window; boreal's whole git history falls inside it (first commit 2026-10-30), and the PayPal work is listed below.

## What it does

An AI agent posts a real-world task (say, "photograph this shelf in Manila"), funds it through PayPal, and pays only if the result passes review. A verified human worker in the Philippines does the task. When the result passes, boreal captures the money and pays the worker with PayPal Payouts. PayPal's hackathon brief lists "a payout tool for gig workers that pays out the moment a task is approved". This is that tool, with an AI reviewer deciding "approved" and an agent as the buyer.

| boreal step | PayPal API |
| --- | --- |
| Agent calls `fund_task` | Orders v2: create an order with intent `AUTHORIZE`. The agent gets an `approveUrl` for its owner |
| Owner approves, agent calls `fund_task` again with `{ orderId }` | `POST /v2/checkout/orders/{id}/authorize`, run inside the desk's funding checks, so a refused task never holds money. The order asked PayPal to save the owner's account, so the response carries a vault id |
| Agent funds a later task: `fund_task` with no payment | Orders v2 with `payment_source.paypal.vault_id`: authorized with no approval page, again inside the desk's funding checks |
| Task passes (accepted early, or the objection window closes) | `POST /v2/payments/authorizations/{id}/capture` for the full amount |
| Task fails | Capture only the review fee with `final_capture: true`. PayPal releases the rest to the payer |
| Task cancelled after funding, or expires unclaimed | `POST /v2/payments/authorizations/{id}/void` |
| Worker and reviewer get paid | Payouts v1, one batch per ledger entry. The ledger idempotency key is the `sender_batch_id` and `sender_item_id`. A reviewer with no `PAYPAL_REVIEWER_EMAILS` entry (boreal reviewing itself) isn't paid out: the review fee stays in boreal's account, settled with the capture |
| PayPal reports a payout's outcome | `PAYMENT.PAYOUTS-ITEM.*` webhooks, verified with PayPal, then applied to the ledger through the outbox |

The owner approves PayPal once. After that the agent funds tasks on its own, inside the limits the owner set on boreal (per task and per day). That is the agentic-commerce part: the agent buys human work without a person clicking through a checkout each time, and boreal, not the agent, enforces the spending limits.

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
- **Vaulting** (owner approves once):
  - The first order asks PayPal to save the payer's account (`payment_source.paypal.attributes.vault` with `store_in_vault: ON_SUCCESS`, `usage_type: MERCHANT`). When the authorization succeeds, PayPal returns `payment_source.paypal.attributes.vault` with `status: VAULTED` and the vault `id`.
  - `confirmPayment` returns that id, and the funding transaction stores it on the agent (`agents.payment_vault_id`, migration `0009`).
  - The payment port gains an optional `vault.pay(taskId, amount, vaultId)`. The desk calls it for `fundTask(caller, taskId, { vault: true })`, reading the vault id from the locked agent row after the daily spending cap check, so an over-limit task never creates a PayPal order.
  - `vault.pay` creates an AUTHORIZE order with `payment_source.paypal.vault_id`. PayPal's docs only show the CAPTURE case, where the order completes on create. So if the order comes back without an authorization, the adapter authorizes it, which needs no approval for a vaulted payer. The `PayPal-Request-Id` is the task and vault id, so a retry never holds twice.
  - MCP `fund_task` and `POST /api/v1/tasks/:id/fund` fund in one call when the agent has a saved account. If PayPal refuses it (the payer removed boreal in their PayPal settings), they fall back to a fresh approval link, whose approval saves a new vault id. `get_account` reports `savedPaymentMethod`.
  - Owners can also connect PayPal without a purchase: **Connect PayPal** on the link approval page and on My account (`/paypal/save/:agentId` → PayPal → `/paypal/saved`) creates a vault setup token (`POST /v3/vault/setup-tokens`), and after approval exchanges it for a payment token (`POST /v3/vault/payment-tokens`) whose id is saved as the agent's vault id. A cookie ties the return to the request, and ownership is checked both ways.
  - `PAYPAL_VAULT=off` turns vaulting off, for PayPal apps without the Vault option.
- **Log in with PayPal is a primary sign-in** (`/paypal/login` → PayPal → `/paypal/login/done`, scopes `openid email https://uri.paypal.com/services/paypalattributes`, state checked against a cookie). Signed out, it signs the worker in or creates them, keyed by `pp:` + an HMAC of PayPal's `payer_id` (the id itself is never stored); signed in, it adds PayPal to their account. Either way the primary email from userinfo becomes their PayPal payout in the same step, and PayPal's `verified_account` claim is recorded. On mainnet a worker without Concordium ID needs a verified PayPal account to claim; tasks with required attributes need the Verified by Concordium badge. Typing the email stays as a fallback for Concordium-only workers. See the README's "Sign-in" section.
- **Owners** can sign in with PayPal to approve an agent at `/link/<code>`; the agent badge stays optional.
- **Monitor**: drains the outbox whenever a payment rail is configured, so PayPal works without Concordium payments. Anchors wait if no anchor adapter is set.
- **Tests**:
  - `packages/paypal/src/payments.test.ts` covers the adapter against an in-memory PayPal (`fake-paypal.ts`).
  - `packages/paypal/src/loop.test.ts` runs the desk on PGlite through pass, fail, cancel, refused funding and a returned payout. Its vaulting tests cover: the first approval saves a vault id, and the next task funds with one PayPal call and no approval. Both shapes of PayPal's vaulted-order answer are handled. The spending cap is checked before any order. A revoked vault is refused without opening the task. Vaulting can be turned off.
- **`pnpm --filter @boreal/paypal sandbox-loop`**: the full loop against the real PayPal sandbox.

## Run it

1. In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox), create a sandbox REST app. Note its client ID and secret, and the emails of a sandbox personal (buyer) account and a second personal account to receive payouts. For vaulting, tick **Vault** under the app's advanced options. Live accounts also need PayPal to enable reference transactions. Without it, set `PAYPAL_VAULT=off`.
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

4. To use the whole app locally on PayPal, run `pnpm dev:local`. It reads `.env.paypal`, and the seeded tasks wait for PayPal funding. An agent with the key in `.local/agent-key.txt` calls `fund_task` over MCP and gets the approval link. A worker signs in, sets a sandbox email on `/me`, and does the task. With `PAYPAL_LOGIN=on` in `.env.paypal` (and `http://localhost:3000/paypal/login/done` among the sandbox app's return URLs), workers log in with a sandbox Personal account instead, and add Concordium ID with the development wallet on `/me`.

5. Webhooks need a public URL. On a deployed preview, add a sandbox webhook for `https://<host>/api/paypal/webhook` with the `PAYMENT.PAYOUTS-ITEM.*` events and set `PAYPAL_WEBHOOK_ID`. Locally, the loop script reads the payout batch instead and applies the same update.

PayPal follows `BOREAL_NETWORK`: the sandbox on testnet (testnet.boreal.work), live PayPal (`api-m.paypal.com`) on mainnet (boreal.work). The sandbox is refused on mainnet, so real workers are never paid in sandbox money, and live PayPal is refused on testnet, so the testnet never takes real money. Each site has its own PayPal app and credentials.

## Agents and PayPal's agent tools

boreal's MCP server (`/api/mcp`) is the agent's side of the desk: `post_task`, `fund_task`, `get_task`, `accept_result` and the rest. It runs alongside PayPal's own MCP server or Agent Toolkit, which an agent uses for its other PayPal work. Funding needs the owner to approve a PayPal checkout once. The approval link, the "held, not charged" wording and what the owner is agreeing to (later tasks funded without asking, up to the agent's per-task and daily limits) come back in `fund_task`'s answer, ready to send. After that, `fund_task` pays in one call.

## Log in with PayPal settings, per site

In the PayPal developer dashboard, under the app's **Log in with PayPal** options:

- Return URL: `https://testnet.boreal.work/paypal/login/done` on the sandbox app, `https://boreal.work/paypal/login/done` on the live app (plus `http://localhost:3000/paypal/login/done` on the sandbox app for local runs).
- Information requested: **Email**, **PayPal account ID (payer ID)** and **Account verification status**, matching the scopes above. Without the payer ID, sign-in is refused.
- Then set `PAYPAL_LOGIN=on` on that site. `CONCORDIUM_PSEUDONYM_SECRET` (already set on both sites) keys the PayPal hash too.

## Known limits and next steps

- **Workers who connected PayPal for payouts before Log in with PayPal became a sign-in** have only a payout email, not a PayPal identity (the old flow kept no `payer_id`). Logging in with PayPal while signed out makes them a new account; they should sign in with Concordium ID and use **Add PayPal** on My account instead.

- **Vaulting, not yet checked on the sandbox.** The request and response fields follow PayPal's save-with-purchase guide. The AUTHORIZE-with-`vault_id` answer isn't documented, so both possible shapes are handled. PayPal's guide also mentions risk data (FraudNet) for payer-initiated vaulted payments. These are merchant-initiated within limits the owner set, so none is sent. Check all of this on the sandbox.
- **No "forget my PayPal" button yet.** An owner can remove boreal from their PayPal account's automatic payments today, and the next funding then asks for approval again. A boreal-side control on the owner page (and deleting the vault token through PayPal's Payment Method Tokens API) is next.
- **Authorization lifetime.** PayPal honours an authorization for 3 days and lets it be captured for up to 29. A task whose deadline, objection window and dispute run past that needs reauthorizing. That isn't built yet, so keep PayPal tasks short.
- **Fees.** PayPal's processing fee on a capture comes out of boreal's side. The platform fee has to cover it.
- **Escrow check.** boreal's PayPal balance also holds its fees, net of PayPal's own. So on PayPal the escrow balance is read from the ledger, and each capture and payout is reconciled one by one through webhooks.
- **Worker email.** A PayPal email is personal data. It is stored only in boreal's database, never on-chain.
- **Verified end to end against the live sandbox** on 2026-11-02 with `sandbox-loop --card`:
  - The order was authorized and the $5.85 hold captured.
  - The worker ($5.00) and reviewer ($0.25) payouts both came back SUCCESS from PayPal.
  - Every ledger entry settled with PayPal's ids, and escrow ended at $0.00.
  - Not yet run live: the approval-link path, and webhooks on a deployed preview. The tests use an in-memory PayPal.
