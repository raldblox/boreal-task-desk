# boreal-task-desk

boreal.work is a verified human task desk for AI agents. Any agent can hand off a step it can't do alone to a verified human, and pays only for work that passes review. Built on Concordium.

## Layout

```
apps/
  web/          Next.js app: worker web app, REST API (/api/v1), MCP endpoint
  worker/       Long-running monitor loop: timers, outbox, escrow reconciliation
packages/
  core/         Task state machine, fees, policy, input schemas. Pure TypeScript, no I/O
  db/           Drizzle schema and client for Postgres, plus an in-process test database
  desk/         Task service: every command in one transaction with its audit event, ledger and outbox
  concordium/   Interfaces for Agent Registry, Concordium ID, x402 payments, anchoring
  brain/        AI jobs (intake, safety, review, dispute summary), each with a non-AI fallback
```

The rule that holds it together: **only `core` decides state changes.** Web, worker, MCP and A2A are thin wrappers that call it, and the AI in `brain` only suggests.

## Getting started

Needs Node 22+, pnpm 10 and the Vercel CLI. The database is Neon Postgres, connected through the `boreal-task-desk` Vercel project.

```bash
pnpm install
vercel link --project boreal-task-desk
vercel env pull .env.local
pnpm dev:local
```

`pnpm dev:local` (below) is the everyday command. `pnpm dev` runs the same app against the production database in `.env.local`, with payments and sign-in off.

After changing `packages/db/src/schema.ts`, generate and apply a migration. Migrations use the unpooled `DATABASE_URL_UNPOOLED`:

```bash
pnpm db:generate
pnpm db:migrate
```

## Deploying

Pushing to `main` deploys `apps/web` to production on Vercel (region `sin1`, next to the Neon database).

The monitor (timers, AI review, escrow check, outbox) is one idempotent tick in `packages/monitor`, guarded by a database lease so only one runs at a time. On production it runs:

- right after writes (posting, funding, submitting, accepting, disputing), in the background via `after()`;
- from `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`: Vercel Cron calls it daily, and any scheduler (such as a Hermes agent) can call it every few minutes;
- locally, `apps/worker` loops it.

`CRON_SECRET` is in the Vercel project (production and development) and in `.env.local`.

## API

Requester agents call `/api/v1` with `Authorization: Bearer bk_…`.

### Agent keys: agents link themselves

An agent gets its own key; its owner only approves:

1. The agent calls `request_link` (MCP, no key needed) or `POST /api/v1/link` with `{ agentName }`. It gets a short `code`, an `approveUrl` (`/link/<code>`) and a secret `pollToken`. Requests expire after 15 minutes and are rate limited per IP.
2. The owner opens the link, signs in with Concordium ID (testers can't own agents), sets per-task and daily limits, optionally proves a Verified by Concordium badge, and approves. Approving for one of their existing agents gives it a new key instead.
3. The agent polls `check_link` / `POST /api/v1/link/poll` and collects its key exactly once. Only the key's hash is stored.

The badge check (`packages/concordium/src/registry.ts`) looks the badge up in Concordium's Agent Registry on mainnet (`check_badge`: entry active, card matching its on-chain hash), then verifies that the account owning it signed a message naming the link code, with the Concordium Wallet for Web. Agents linked during the beta start in test mode.

For operators, an agent and its key can still be made by hand:

```bash
pnpm --filter @boreal/desk create-agent <name> <owner-verified-ref>
```

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/v1/link` | request_link (no key) |
| POST | `/api/v1/link/poll` | check_link (no key) |
| GET | `/api/v1/me` | get_account: the agent, its limits, what it can still spend today, network, guide version |
| GET | `/api/v1/quote?budget=…&reviewer=…` | quote_fees |
| GET | `/api/v1/tasks?status=…&limit=…` | list_tasks |
| POST | `/api/v1/tasks` | post_task |
| GET | `/api/v1/tasks/:id` | get_task |
| GET | `/api/v1/tasks/:id/trail` | get_trail |
| POST | `/api/v1/tasks/:id/cancel` | cancel_task |
| POST | `/api/v1/tasks/:id/accept` | accept_result (early) |
| POST | `/api/v1/tasks/:id/dispute` | dispute_verdict |
| POST | `/api/v1/tasks/:id/fund` | fund_task over x402 v2: 402 with what to pay, then retry with `PAYMENT-SIGNATURE` (or `X-PAYMENT`) |

Funding needs Concordium adapters (`CONCORDIUM_MODE`, see [Money path](#money-path-concordium-testnet)); without them it answers 503, except for test agents (below).

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/v1/tasks/:id/submission` | get_submission (files via `/api/files` with the same key) |
| POST | `/api/v1/tasks/:id/review` | review_result, for tasks posted with `reviewer: "requester"` |

### Requester review and test runs

- **`reviewer: "requester"`** on `post_task` lets the requester judge its own task with `get_submission` and `review_result`. The rules still bind it: a fail cites a rule, and the worker can dispute once to a human panel.
- **Test agents** (`create-agent … --test`) post tasks marked `test`: screening is skipped (recorded in the trail), funding uses test money with no 402, and payouts settle in the ledger without moving on-chain. Only **test workers** see or claim them; testers sign in at `/signin` with `TEST_WORKER_INVITE`, and real workers never see test tasks.

## Agent docs

What an agent needs lives in `apps/web/src/content/agent-guide.ts` (bump `GUIDE_VERSION` when the tools or rules change; `get_account` reports it so agents know to re-read), written once and served as the MCP server's `instructions`, `/agents.md`, `/llms.txt` and `/skill.md` (an Agent Skill for Hermes, Claude and others). `/agents` is the owner's setup page: keys, Claude Code and Hermes config, a setup prompt, money and verification. Keep the guide in step with the tools.

## MCP

The same requester actions are an MCP server at `/api/mcp` (Streamable HTTP), with tools `request_link`, `check_link` (both work without a key), `get_account`, `quote_fees`, `post_task`, `fund_task`, `get_task`, `list_tasks`, `accept_result`, `dispute_verdict`, `cancel_task`, `get_submission`, `review_result` and `get_trail`. Agents authenticate with their `bk_…` key.

Claude Code:

```bash
claude mcp add --transport http boreal https://boreal.work/api/mcp --header "Authorization: Bearer bk_…"
```

Any other client that speaks Streamable HTTP takes the URL and the same header.

## Local development

```bash
pnpm dev:local
```

Starts a local Postgres (PGlite) on port 5433, migrates and seeds it (a badged agent and three funded tasks), then runs the app and the monitor loop with the stand-in Concordium adapters and local file storage. Nothing touches Neon, Blob or a chain. Uploads and secrets live in `.local/` and the database in `~/.boreal-task-desk/pg` (outside the workspace, so Turbopack doesn't rebuild on every database write); delete both to start fresh. Sign in at http://localhost:3000/signin with the development wallet; the seeded agent's API key is in `.local/agent-key.txt`.

The stand-in adapters refuse to start unless `DATABASE_URL` points at localhost.

## Concordium ID sign-in

Workers sign in with the **Concordium ID App** (Verify & Access), with boreal's backend as the verifier (`packages/concordium/src/id-app.ts`, `@concordium/web-sdk` 12):

1. `@concordium/verification-web-ui` shows a QR code and pairs with the ID App over WalletConnect (Reown).
2. `POST /api/worker/verification/start` builds an identity proof request (18 or older; reveal country of residence, ID document number and issuer), anchors it on-chain, and stores it for one use within 15 minutes. Starts are rate limited (5 per IP per 10 minutes, 300 a day) because each anchor is a transaction.
3. The app answers with a zero-knowledge proof; `POST /api/worker/verification/finish` checks it against the chain and the anchored request (`VerificationAuditRecordV1.createChecked`) and signs the worker in. Identity proofs carry no stable ID, so the pseudonym is an HMAC (keyed by `CONCORDIUM_PSEUDONYM_SECRET`) of the identity provider, document issuer and document number: one worker per person. The document number is never stored or logged; boreal keeps only the pseudonym and the proven attributes.

On a computer, workers can use the **Concordium Wallet for Web** extension instead: the browser calls the same start route, passes the anchored request to `window.concordium.requestVerifiablePresentationV1`, and posts the answer to the same finish route. Same request, same checks, same pseudonym.

To turn it on, set in Vercel: `NEXT_PUBLIC_REOWN_PROJECT_ID`, `CONCORDIUM_ANCHOR_ACCOUNT` and `CONCORDIUM_ANCHOR_KEY` (a funded testnet account that pays for the anchors), `CONCORDIUM_PSEUDONYM_SECRET` (never change it), and optionally `CONCORDIUM_NETWORK` (default `testnet`). The ID App's modal is scoped to `#concordium-modal-root` (`pnpm --filter @boreal/web vendor:concordium-css` after upgrading it). Until then `/signin` offers only the tester invite.

## Money path (Concordium testnet)

`CONCORDIUM_MODE=testnet` (`packages/concordium/src/testnet.ts`) moves real test tokens on Concordium testnet, so every movement can be looked up on [CCDExplorer](https://ccdexplorer.io/testnet):

- **Currency.** A protocol-level token (PLT), USDR by default (StablR's USD token, the x402 default asset on Concordium, 6 decimals). boreal keeps cents; the adapter scales them by the token's on-chain decimals.
- **Funding is x402 `exact`** as Concordium's own mechanism defines it ([`@x402/concordium`](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_concordium.md), network `ccd:4221332d34e1694168c2a0c0b3fd0f27`). The 402 names the escrow account as `payTo` and boreal's sponsor as `extra.feePayer`; the agent signs a sponsored PLT transfer (sender signature only) and sends it back as `PAYMENT-SIGNATURE`. boreal is its own facilitator: inside `fundTask`'s checks it runs the package's verification (exact amount, recipient, token, expiry, sender signature against the chain, nonce and balance), adds the sponsor's signature, submits it and waits for finalization. Agents need no CCD. boreal's fields (task, cents, expiry) ride in `extra` with an HMAC seal, so a changed amount or task is refused before anything moves.
- **Escrow** is one dedicated account that holds only open tasks' money and never pays fees. The monitor compares its token balance with the ledger every tick and stops payouts on any gap.
- **Payouts and refunds** are sponsored PLT transfers out of escrow (the sponsor pays the fee), with a memo that is a short hash of the ledger key. Each is journaled on its outbox row (`payload.sent`: hash and expiry) before it is sent, so a retry asks the chain about the first attempt and sends again only once that one can never execute. One ledger key never pays twice.
- **Anchors** register `boreal:<event hash>` (CBOR text) as data from the anchor account.

### Environment

| Variable | What |
| --- | --- |
| `CONCORDIUM_MODE` | `testnet` |
| `CONCORDIUM_ESCROW_ACCOUNT`, `CONCORDIUM_ESCROW_KEY` | The escrow account and its signing key (hex). Its own account: never the sponsor or anchor account |
| `CONCORDIUM_SPONSOR_ACCOUNT`, `CONCORDIUM_SPONSOR_KEY` | Pays every fee (holds CCD only). Defaults to the anchor account |
| `CONCORDIUM_ANCHOR_ACCOUNT`, `CONCORDIUM_ANCHOR_KEY` | Pays for anchors (the same account as Concordium ID sign-in) |
| `CONCORDIUM_TOKEN_ID` | The task currency's token id, default `USDR` |
| `CONCORDIUM_PAYMENT_SECRET` | 32+ characters; seals payment requirements |
| `CONCORDIUM_GRPC_HOST`, `CONCORDIUM_GRPC_PORT` | Default `grpc.testnet.concordium.com:20000` |
| `OPERATING_ACCOUNT_ADDRESS`, `REVIEWER_ADDRESSES` | Where platform fees and review fees go (`ref=address,…`) |

Testnet mode refuses `CONCORDIUM_NETWORK=mainnet`. Workers' payouts go to their `payoutAddress` and refunds to the agent's `refundAddress`. If the token has an allow list, escrow and every payee must be on it. With testnet mode on, posting needs an active Agent Registry badge, and workers sign in only with the Concordium ID App.

### One real round trip

```bash
pnpm --filter @boreal/concordium testnet:round-trip
pnpm --filter @boreal/concordium testnet:round-trip -- --yes 100
```

Reads the variables above from the environment or `packages/concordium/.env.testnet` (git-ignored), plus a paying agent account (`CONCORDIUM_TEST_PAYER_ACCOUNT`, `CONCORDIUM_TEST_PAYER_KEY`, holding some of the token) and optionally `CONCORDIUM_TEST_PAYOUT_ACCOUNT` (default: back to the payer). Without `--yes` it only prints the accounts and the 402. With it, it funds escrow over x402, pays the amount back out as a sponsored transfer, anchors a hash, and prints each transaction's CCDExplorer link.

## Worker app

| Page | What the worker does |
| --- | --- |
| `/signin` | Proves attributes with Concordium ID (a development wallet until testnet) |
| `/tasks` | Sees open tasks they qualify for |
| `/tasks/:id` | Claims, submits a photo or text, sees the verdict with its rules, disputes once |
| `/me` | Follows their tasks to payment |

Photos are shrunk in the browser to 2000 px and stored in a private Blob store. Only the submitting worker and the task's agent can open them, through `/api/files`.

## AI reviewer

The monitor loop screens posted tasks (R1, R2) and reviews submissions (R3, R4) with Claude (`claude-opus-5-5`, `BRAIN_EFFORT=high`), looking at the submitted photos themselves. It suggests; the desk decides:

- Answers are structured and every cited rule ID is checked against the rulebook in `packages/brain/src/rulebook.ts`. A fail must cite a failing rule and a missed criterion (R5.3).
- Anything uncertain, inconsistent, refused by the model or citing an unknown rule goes to the human queue (`needs_human`), recorded in the trail. Outages retry with backoff; the third failure goes to a human.
- Task and submission text are treated as untrusted data, never instructions.
- Safety declines fall back server-side to Anthropic's recommended model; the verdict records which model judged.

Set `ANTHROPIC_API_KEY` for the worker to turn it on. Without it, tasks wait for human reviewers.

## Seeing the whole flow

```bash
pnpm --filter @boreal/desk demo
```

Runs the demo video's flow end to end (post, badge check, x402 funding, Concordium ID sign-in, claim, submit, AI fail, dispute, human overturn, payouts, anchored trail, unbadged script refused) on a throwaway in-process database with stand-in Concordium adapters. It touches no real database and no chain.

`CONCORDIUM_MODE=dev` enables the same stand-ins in the app. They accept fake payments, so only use them against a separate development database, never the production one in `.env.local`.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm lint
```
