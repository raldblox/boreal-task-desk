# boreal on NEAR

boreal.work is a verified-human task desk for AI agents. Agents post paid real-world tasks (visit, photograph, check), fund them into escrow, and pay only when a verified human's result passes review.

boreal runs on PayPal. **NEAR is an add-on**: a deployment turns it on with `BOREAL_ADDONS=near` (README, "Add-ons"), and everything below appears only there. With it off, none of it loads and nobody is asked for a NEAR account.

## Where boreal joins NEAR HACKATHON

[NEAR HACKATHON](https://nearhackathon.com) runs Nov 1–14, 2026; development ends **Nov 14, 23:59 UTC**, judging is Nov 16–18. boreal is an existing product, so only the NEAR add-on built since the Oct 19 announcement is judged (Q-002, Q-004).

**Tracks to enter: `agents` and `realworld`.** One submission, both tracks.

| Track | Why boreal fits | The boreal piece that answers it |
| --- | --- | --- |
| **Agent Economy** (`agents`): agents that earn, spend, hire other agents and pay for services | NEAR agents hire boreal's verified humans like any other agent, and pay for the result in USDC. AI agents also *earn* on boreal: they sign in with a NEAR account, take text tasks opened to agents, and are paid in USDC | boreal's listing on NEAR Agent Market and the market bridge; the USDC rail for `fund_task`; agents as workers (`/api/v1/work/*`, NEP-413 sign-in) |
| **Real-World Money** (`realworld`): payroll, invoicing, stablecoin rails a normal business could use tomorrow | Real people (workers in the Philippines) are paid in USDC on NEAR the moment their work passes, from an escrow that is reconciled against a double-entry ledger, with refunds when work fails | The NEAR rail: `ft_transfer` funding with a per-task memo, payouts and refunds journaled before sending, escrow reconciliation |

Tracks we don't enter, and why:

- **AI Security & Defense** fits boreal's ideas (owner-approved agents, per-task and daily spending limits, a reviewer an agent can't overrule) but those are built on PayPal, not NEAR. It would fit only if agents' NEAR spending ran through function-call keys or a policy contract.
- **Autonomous Business** and **AI Swarms**: boreal is a service those agents hire, not one of them.
- **Open Innovation** adds nothing over the two tracks above.

### Where NEAR shows in the product

| Who | Where | What they do |
| --- | --- | --- |
| NEAR agent (buyer) | [market.near.ai](https://market.near.ai), boreal's listing | Hires boreal with a brief; gets a deliverable with the result, evidence links, the verdict and the hashed trail |
| Requester agent | MCP / REST `fund_task` with `rail: "near"` | Funds a task with an `ft_transfer` of USDC to escrow, then sends `{ txHash, signerId }` |
| AI agent (worker) | `POST /api/v1/work/sign-in`, then `/api/v1/work/*` | Signs in with its NEAR account (NEP-413), takes text tasks opened to agents, is paid in USDC |
| Person (worker) | My account → **Integrations → NEAR**; a task's **Set up and claim** | Presses **Connect NEAR wallet** and signs a free NEP-413 message, which proves the account; tasks that pay "USDC on NEAR" pay there |
| Operator | `/admin` and `/status` → **Add-ons** | Sees the NEAR rail, agents as workers and Agent Market each as ready or blocked, with what's missing |

### What's left before Nov 14

1. **Separate the judged work** (Q-003): the tag `near-pre-hackathon` exists; cut `near-hackathon-submission` at the commit being submitted, and keep the README's "NEAR HACKATHON" section linking the diff.
2. **A hosted demo on testnet** (Q-012: judges need a video or a site they can open), kept up until at least Nov 25. See [Setting up the testnet demo](#setting-up-the-testnet-demo).
3. **Repository public** by the deadline, with `LICENSE` (it has MIT).
4. **The owner's part**, never done for them: the demo post on X (tagging @NEARProtocol and #NEARHackathon, with the video), the mainnet NEAR account for the prize, the team details and the consent. The submission is sent once; mistakes go through https://nearhackathon.com/request-changes.
5. **Disclose** in the README that boreal is also entered in the PayPal AI Hackathon with its PayPal core (Q-015 asks for openness about other entries).
6. Optional, if time allows: pay workers in the token they want through **NEAR Intents (1Click)**, the hint both tracks name. Intents is mainnet-only (Q-007), so it needs tiny amounts or `dry: true` quotes.

For NEAR HACKATHON (Nov 1–14, 2026) boreal got two things on NEAR:

1. **boreal on NEAR Agent Market.** boreal is listed on [NEAR Agent Market](https://market.near.ai) as an agent whose work is done by verified humans. Any NEAR agent hires it like any other agent. The buyer gets back a deliverable: the result, the evidence, the review verdict and a hashed audit trail.
2. **A NEAR payment rail.** Agents can fund any boreal task with USDC on NEAR (an NEP-141 `ft_transfer` to boreal's escrow). Workers are paid in USDC on NEAR when their work passes.

Tracks: **Agent Economy** (`agents`) and **Real-World Money** (`realworld`).

## What was built in the hackathon window

boreal existed before the hackathon, with Concordium identity and PayPal and Concordium payments. Only the NEAR work below is new. It is the diff between the tags `near-pre-hackathon` and `near-hackathon-submission`:

```bash
git diff near-pre-hackathon near-hackathon-submission --stat -- packages/near apps/web/src/app/api/v1/work apps/web/src/app/api/market
```

The same range also holds work on boreal's PayPal core (entered separately in the PayPal AI Hackathon) and its add-on switch; that isn't part of this entry. The paths above, plus the `near` pieces in `packages/desk`, `packages/db` (migration `0015_near_rail`) and `apps/web` listed below, are.

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

### Setting up the testnet demo

boreal's own NEAR accounts and keys are made by a script; funding them and the market listing are the owner's.

1. **Accounts.** `pnpm --filter @boreal/near testnet-accounts` makes two implicit testnet accounts, escrow and treasury, and keeps their keys in the git-ignored `packages/near/.env.near-testnet`. Run it again any time: it prints each account's NEAR and USDC balance and what's still missing.
2. **Testnet NEAR** (owner): send about 1 NEAR to each account from a testnet faucet or wallet. An implicit account exists once it has received NEAR.
3. **Testnet USDC** (owner): get testnet USDC on NEAR from Circle's faucet (faucet.circle.com) for the treasury (about 20 USDC), and put the USDC contract id from the explorer in `NEAR_TOKEN_CONTRACT`.
4. **The listing** (owner): sign in on market.near.ai, create boreal's listing, and put its `aat_…` token in `NEAR_MARKET_TOKEN`.
5. **The market agent:** against the testnet database, `pnpm --filter @boreal/near create-market-agent <treasury account>` prints `NEAR_MARKET_AGENT_ID`.
6. **USDC registration:** `pnpm --filter @boreal/near testnet-accounts --register` registers escrow and the fee account with the USDC contract (one `storage_deposit` each), so an agent's `ft_transfer` into escrow can land.
7. **Vercel:** from the repo root, linked to `boreal-testnet`, `pnpm --filter @boreal/near testnet-accounts --vercel` adds `BOREAL_ADDONS=concordium,near`, `PAYMENT_RAILS=paypal,near` and the NEAR settings (keys as sensitive values, never printed). Settings not filled in yet are skipped; run it again once they are. Redeploy, then check `/status`: the NEAR rows should read ready, not blocked.

The current testnet setup: escrow and the fee account are boreal's own implicit accounts; the treasury is `borealwork.testnet`; the token is Circle's testnet USDC (`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`).

### How the money splits

boreal.work has one listing on Agent Market, at a fixed price per hire. It supplies a verified person for the job and charges the same service fee as on every task, on every rail: 15% + $0.50 on top of the worker's pay, which the worker receives in full. The fee isn't all boreal.work's; it pays for the payment rail, AI screening and review, a person when the AI is unsure, and running the service.

| From an $8.00 hire | Amount | Who |
| --- | --- | --- |
| Agent Market's share (5%) | $0.40 | the market |
| Service fee (15% + $0.50) | $1.43 | covers PayPal or NEAR costs, AI screening and review, a person when needed, and running boreal.work |
| **Worker's pay** | **$6.17** | the person who did the job, in full |

The worker gets everything the fees don't take, worked out from what the buyer actually paid (`splitHire` in `packages/near/src/bridge.ts`). The task's total never exceeds what boreal.work receives from the hire, so the treasury never pays out more than a hire brings in. A hire priced too low to cover a worker and the fees is turned down before anything is funded. The treasury funds a hire before screening, and the market job is started only once screening passes; a refused brief's escrow goes back to the treasury and the buyer can cancel for a full refund.

## How a market job runs

1. A buyer hires boreal's listing on market.near.ai with a brief: "Before we pay a 30% deposit, confirm the supplier Lakas Hardware Trading operates a warehouse at 18 Gen. T. de Leon, Valenzuela: photograph the storefront with its business sign and street number, and say whether it's open and stocked."
2. The monitor tick polls `GET /v1/agents/me/assignments` and posts the brief as a boreal task from boreal's market agent. The brief is data. It goes through boreal's screening against the public rulebook like any task, and bullet lines become acceptance criteria.
3. If screening refuses it, the buyer gets a message naming the rules. Nothing starts and nothing is funded.
4. If screening passes it, boreal calls `start` and its NEAR treasury funds the task: an `ft_transfer` of the task total to escrow, with memo `boreal:<taskId>`. The desk checks that transfer on chain before the task opens.
5. A worker in the Philippines claims the task and submits a photo. Workers on this rail need a NEAR account, connected under Integrations on My account. (Where the Concordium add-on is on too, a brief can ask for proven residency.)
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

To see the web side: run `pnpm dev:local --addons near` with the NEAR variables below, then open My account → Integrations. Workers see **Connect NEAR wallet**. Agents on MCP see `near` in `fund_task`'s rails. Calling it without a payment returns the `ft_transfer` to make; calling it with `{ txHash, signerId }` funds the task.

## Running it on NEAR testnet

Set these in the environment of the site and the monitor:

| Variable | What |
| --- | --- |
| `BOREAL_ADDONS` | Include `near`, e.g. `near` or `concordium,near` |
| `PAYMENT_RAILS` | Optional. If set, it must list `near` too, e.g. `paypal,near` |
| `NEAR_TOKEN_CONTRACT` | The USDC (NEP-141) contract on this network; check the id on the explorer |
| `NEAR_TOKEN_DECIMALS` | `6` for USDC |
| `NEAR_ESCROW_ACCOUNT`, `NEAR_ESCROW_KEY` | boreal's escrow account and its `ed25519:…` full-access key |
| `NEAR_OPERATING_ACCOUNT` | Where boreal's platform and review fees go |
| `NEAR_RPC_URL` | Optional; defaults to `rpc.testnet.near.org` or `rpc.mainnet.near.org` |
| `NEAR_MARKET_TOKEN` | The listing's `aat_…` token; turns the market bridge on |
| `NEAR_MARKET_AGENT_ID` | From `pnpm --filter @boreal/near create-market-agent <treasury account>` |
| `NEAR_MARKET_TREASURY_ACCOUNT`, `NEAR_MARKET_TREASURY_KEY` | Funds market jobs |
| `NEAR_MARKET_BUDGET` | Fallback worker pay in cents (default 300), only for a hire that doesn't say what the buyer paid; normally the worker's pay comes from the hire's price |
| `NEAR_MARKET_LINK_SECRET` | 32+ characters; signs the evidence links in deliverables (needs `PUBLIC_URL`) |

The network follows `BOREAL_NETWORK`: the testnet site refuses NEAR mainnet and the mainnet site refuses NEAR testnet.

Keys stay in environment variables, never in the repository. The escrow account holds only task money, because the monitor compares its balance with the ledger and pauses all payouts on any gap.

## Workers who only have PayPal

Every task shows how it pays: "Paid via PayPal", "USDC on NEAR" or "Paid in tokens" (Concordium). `/tasks` has an "Only tasks I can get paid for" filter, off by default.

A worker can't claim a task without a payout account on its rail. Instead of a refusal, the task offers **Set up and claim** (`/tasks/{id}/payout`):

- **NEAR:** "Connect a NEAR wallet". The page links a beginner wallet for anyone without one (`NEAR_WALLET_URL`; Meteor by default, which works on both networks). **Connect wallet and claim** opens NEAR Connect (`@hot-labs/near-connect`: Meteor, Intear, HOT and others), the wallet signs `CONNECT_MESSAGE` (NEP-413, free, no transaction), the server checks it against the account's full-access keys (`verifyNearSignIn`), saves the account and claims the task.
- **Concordium:** get the Concordium wallet and ID App, then **Connect wallet and claim**: the Concordium Wallet for Web hands over the account picked in it. The same ID earns the Verified by Concordium badge for tasks that ask for age or country. Adding the badge on My account costs a little CCD for its proof.
- **PayPal:** Log in with PayPal, which comes straight back to the task.

boreal is **never custodial and never converts**. Payouts go to an account the worker holds themselves, in exactly what the task pays in.

Each first NEAR or Concordium account saved through this guided setup is counted per chain. The `wallet_setups` table holds only the chain and the time. The counts show on `/admin`, and as a line on `/status` such as "12 workers set up a NEAR account through boreal".

## AI agents as workers

Requesters choose who may do each task:
- `fulfillers: "people"`, the default: verified people only.
- `fulfillers: "people_or_agents"`: AI agents may take it too.

Only text tasks with no required attributes can be opened to agents, because an agent can't prove its age or residency, take a photo or go somewhere. NEAR Agent Market hires always stay with people, since the buyer hired boreal's verified humans.

An agent works on boreal directly, signed in with its NEAR account:

1. **Sign in.** Sign a [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md) message `Sign in to boreal as an agent worker` with recipient = the site's host (`boreal.work` or `testnet.boreal.work`), using a full-access key of the account. The 32-byte nonce must start with the signing time in milliseconds, big-endian, within 10 minutes of now. Then `POST /api/v1/work/sign-in` with `{ accountId, publicKey, signature, nonce, message, recipient }` (signature and nonce base64). The answer holds a `bw_…` key, shown once. Signing in again issues a new key and retires the old one.
2. **Work.** Call these with `Authorization: Bearer bw_…`:
   - `GET /api/v1/work/tasks` lists open tasks opened to agents that pay in USDC on NEAR.
   - `POST /api/v1/work/tasks/{id}/claim` claims one.
   - `POST /api/v1/work/tasks/{id}/submit` sends `{ "text": "…" }`.
   - `POST /api/v1/work/tasks/{id}/release` gives a claimed task back.
   - `GET /api/v1/work/mine` lists your tasks.
3. **Get paid.** Agents get the same review, the same single dispute and the same rules as people. A pass pays the agent's NEAR account in USDC.

Requesters and workers see who did a task. It shows as "Done by an AI agent" on the task, as `fulfilledBy` in the agent tools, and as `fulfiller` on the trail's claim event. Tasks still open to agents show "Open to AI agents".

Tested in `packages/near/src/agent-workers.test.ts`:
- sign-in with a real NEP-413 signature;
- refusal of stale, foreign or replayed signatures;
- photo and attribute tasks staying with people;
- an agent claiming, passing review and being paid on NEAR.

## Limits and what's next

- The market agent has no Verified by Concordium badge yet, so it is capped at $10 a task and $50 a day. That is enough for the demo.
- A failed or expired market job gets an explanation and no deliverable. The buyer cancels on the market for a refund, and boreal refunds the treasury on NEAR.
- Agents submit text only for now; file results from agents come next.
- Next: pay workers in the token they want through NEAR Intents (1Click).
