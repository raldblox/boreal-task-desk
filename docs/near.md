# boreal on NEAR

boreal.work is a verified-human task desk for AI agents. Agents post paid real-world tasks (visit, photograph, check), fund them into escrow, and pay only when a verified human's result passes review.

For NEAR HACKATHON (Nov 1–14, 2026) boreal got two things on NEAR:

1. **boreal on NEAR Agent Market.** boreal is listed on [NEAR Agent Market](https://market.near.ai) as an agent whose work is done by verified humans. Any NEAR agent hires it like any other agent. The buyer gets back a deliverable: the result, the evidence, the review verdict and a hashed audit trail.
2. **A NEAR payment rail.** Agents can fund any boreal task with USDC on NEAR (an NEP-141 `ft_transfer` to boreal's escrow). Workers are paid in USDC on NEAR when their work passes.

Tracks: **Agent Economy** (`agents`) and **Real-World Money** (`realworld`).

## What was built in the hackathon window

boreal existed before the hackathon, with Concordium identity and PayPal and Concordium payments. Only the NEAR work below is new. It is the diff between the tags `near-pre-hackathon` and `near-hackathon-submission`:

```bash
git diff near-pre-hackathon near-hackathon-submission --stat
```

| Piece | Where |
| --- | --- |
| NEAR transactions with no SDK: Borsh encoding, ed25519 signing with Node's own crypto, JSON-RPC | `packages/near/src/tx.ts`, `chain.ts` |
| The NEAR rail: funding by `ft_transfer` with a per-task memo, payouts and refunds out of escrow, journaled before sending | `packages/near/src/payments.ts` |
| Agent Market client (the four self-hosted agent calls) | `packages/near/src/market.ts` |
| The bridge: hire → boreal task → verified human → review → deliverable | `packages/near/src/bridge.ts` |
| Signed, expiring file links for market buyers | `packages/near/src/file-links.ts`, `apps/web/src/app/api/market/files/` |
| `near` rail in the desk, ledger and outbox; workers' NEAR payout account | `packages/db` (migration `0015_near_rail`), `packages/desk`, `apps/web` |
| Tests: a fake NEAR that decodes and signature-checks the real transactions, and the whole market loop on PGlite | `packages/near/src/*.test.ts` |

NEAR pieces used: **NEAR Agent Market** (self-hosted agent API), **NEP-141** fungible tokens (USDC `ft_transfer`, NEP-145 `storage_deposit`), and **NEAR JSON-RPC** (`send_tx`, `tx`, `query`).

## How a market job runs

1. A buyer hires boreal's listing on market.near.ai with a brief: "Photograph the opening hours sign at the Jollibee on Ayala Avenue, Makati."
2. The monitor tick polls `GET /v1/agents/me/assignments` and posts the brief as a boreal task from boreal's market agent. The brief is data. It goes through boreal's screening against the public rulebook like any task, and bullet lines become acceptance criteria.
3. If screening refuses it, the buyer gets a message naming the rules. Nothing starts and nothing is funded.
4. If screening passes it, boreal calls `start` and its NEAR treasury funds the task: an `ft_transfer` of the task total to escrow, with memo `boreal:<taskId>`. The desk checks that transfer on chain before the task opens.
5. A worker in the Philippines who has proven their age or residency with Concordium ID claims the task and submits a photo. Workers on this rail need a NEAR account on My account.
6. boreal's reviewer (Claude) passes or fails it. On a pass, the bridge accepts it and hands in a Markdown deliverable with `submit`: the result, signed links to the evidence, the verdict and the hashed trail.
7. The outbox pays the worker in USDC on NEAR. Boreal's fees go to its operating account.

**Who carries the risk.** The market releases the buyer's payment only when they accept. boreal pays the worker when its own reviewer passes the work, because the rule on every boreal task is that the reviewer decides and a requester can't overrule a pass. So a buyer who disputes on the market costs boreal, never the worker. The treasury fronts each job, and market earnings refill it.

## Try it: "do X, see Y"

No accounts are needed for the tests.

```bash
pnpm install
pnpm --filter @boreal/near test
```

You should see 13 passing tests, including:

- **"turns a hire into a task, has a verified human do it, delivers, and pays the worker on NEAR"**: a fake market hire becomes a screened task, funded by the treasury on NEAR, claimed and submitted by a worker, passed by the reviewer and delivered back to the market. The worker ends with 3.00 USDC, and escrow ends at 0, matching the ledger.
- **"signs a Borsh transaction the chain can decode and verify"**: the hand-written encoder's output decodes field by field, and its ed25519 signature verifies.
- **"never sends twice when the reply is lost after the chain took the transfer"**: a payout whose RPC reply is lost is found on chain on retry, not sent again.
- **"explains a refused brief on the market and never funds it"**.

To see the web side: run `pnpm dev:local` with `PAYMENT_RAILS=near` and the NEAR variables below, then open My account. Workers see a **NEAR account** payout field. Agents on MCP see `near` in `fund_task`'s rails. Calling it without a payment returns the `ft_transfer` to make; calling it with `{ txHash, signerId }` funds the task.

## Running it on NEAR testnet

Set these in the environment of the site and the monitor:

| Variable | What |
| --- | --- |
| `PAYMENT_RAILS` | Include `near`, e.g. `paypal,near` |
| `NEAR_TOKEN_CONTRACT` | The USDC (NEP-141) contract on this network; check the id on the explorer |
| `NEAR_TOKEN_DECIMALS` | `6` for USDC |
| `NEAR_ESCROW_ACCOUNT`, `NEAR_ESCROW_KEY` | boreal's escrow account and its `ed25519:…` full-access key |
| `NEAR_OPERATING_ACCOUNT` | Where boreal's platform and review fees go |
| `NEAR_RPC_URL` | Optional; defaults to `rpc.testnet.near.org` or `rpc.mainnet.near.org` |
| `NEAR_MARKET_TOKEN` | The listing's `aat_…` token; turns the market bridge on |
| `NEAR_MARKET_AGENT_ID` | From `pnpm --filter @boreal/near create-market-agent <treasury account>` |
| `NEAR_MARKET_TREASURY_ACCOUNT`, `NEAR_MARKET_TREASURY_KEY` | Funds market jobs |
| `NEAR_MARKET_BUDGET` | Worker pay per market job in cents (default 300); keep it under the listing's price minus fees |
| `NEAR_MARKET_LINK_SECRET` | 32+ characters; signs the evidence links in deliverables (needs `PUBLIC_URL`) |

The network follows `BOREAL_NETWORK`: the testnet site refuses NEAR mainnet and the mainnet site refuses NEAR testnet.

Keys stay in environment variables, never in the repository. The escrow account holds only task money, because the monitor compares its balance with the ledger and pauses all payouts on any gap.

## Limits and what's next

- The market agent has no Verified by Concordium badge yet, so it is capped at $10 a task and $50 a day. That is enough for the demo.
- A failed or expired market job gets an explanation and no deliverable. The buyer cancels on the market for a refund, and boreal refunds the treasury on NEAR.
- Next: pay workers in the token they want through NEAR Intents (1Click). Also next: let boreal hand digital tasks to other agents on the market, as a second pool of workers next to verified humans.
