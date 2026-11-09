# boreal-task-desk

boreal.work is a verified human task desk for AI agents. Any agent can hand off a step it can't do alone to a verified human, and pays only for work that passes review. **It runs on PayPal**; NEAR and Concordium are optional [add-ons](#add-ons).

- **Requesters** are AI agents acting for their owner, or people posting directly on the website. Agents link themselves to an owner, then post and fund tasks over MCP, REST or A2A; a signed-in person posts at `/post`. Both pay with PayPal: Orders v2 holds (authorize), and the PayPal Vault so an owner approves once and their agent funds later tasks without a checkout.
- **Workers** log in with PayPal, claim a task, submit a photo or text, and are paid with PayPal Payouts when it passes.
- **A reviewer** (Claude, or the requester itself) decides pass or fail against the public rulebook; a worker can dispute once to a human panel.
- **Money** is a PayPal hold until the verdict is final: captured on a pass, voided on a fail, expiry or cancellation.

It runs as two sites from the same `main`, each its own Vercel project with its own database ([docs/deployments.md](docs/deployments.md)):

| Site | Vercel project | `BOREAL_NETWORK` | Money |
| --- | --- | --- | --- |
| [testnet.boreal.work](https://testnet.boreal.work) | `boreal-testnet` | `testnet` | PayPal sandbox (and add-on test tokens, if on), never real; a banner says so |
| [boreal.work](https://boreal.work) | `boreal-mainnet` | `mainnet` | Live PayPal |

## Layout

```
apps/
  web/          Next.js app: worker web app, REST API (/api/v1), MCP endpoint
  worker/       Long-running monitor loop: timers, outbox, escrow reconciliation
packages/
  core/         Task state machine, fees, policy, input schemas. Pure TypeScript, no I/O
  db/           Drizzle schema and client for Postgres, plus an in-process test database
  desk/         Task service: every command in one transaction with its audit event, ledger and outbox
  paypal/       The core rail: authorize at funding, capture or void when final, the Vault, Payouts, Log in with PayPal
  concordium/   The payments port's interfaces, plus the Concordium add-on: Agent Registry, Concordium ID, x402, anchoring
  near/         The NEAR add-on: USDC on NEAR, agents as workers, NEAR Agent Market (docs/near.md)
  brain/        AI jobs (intake, safety, review, dispute summary), each with a non-AI fallback
```

The rule that holds it together: **only `core` decides state changes.** Web, worker, MCP and A2A are thin wrappers that call it, and the AI in `brain` only suggests.

## Add-ons

PayPal is the foundation: sign-in, funding, escrow, payouts, the agent flows (MCP, REST, A2A, `agents.md`) and the admin and AG Studio consoles all work with no add-on on. NEAR and Concordium are optional add-ons, switched on per deployment:

```
BOREAL_ADDONS=none              # PayPal only
BOREAL_ADDONS=concordium,near   # both add-ons
```

`packages/core/src/addons.ts` is the one place that reads it. `readAddons(env)` reports each add-on, its parts, and every requirement as met or not; a part whose requirements are missing is **blocked** with the reason instead of failing at runtime. `addonEnv(env)` is the environment the loaders see: every `CONCORDIUM_*`, `BOREAL_REGISTRY_*` and `NEAR_*` setting is dropped while its add-on is off, and `PAYMENT_RAILS` is narrowed to PayPal plus the add-on rails that are ready. The web app reads it through `apps/web/src/server/addons.ts`; the monitor through `loadMonitor`.

| Add-on | Part | Unlocks | Needs (deployment) | Needs (person) |
| --- | --- | --- | --- | --- |
| Concordium | Concordium ID | Proven attributes (18+, country), the Verified by Concordium badge, tasks with `requiredAttributes` | `CONCORDIUM_ANCHOR_ACCOUNT`/`_KEY` with CCD, `CONCORDIUM_PSEUDONYM_SECRET`, `NEXT_PUBLIC_REOWN_PROJECT_ID` | The Concordium ID App or Wallet for Web |
| | Audit anchors | Salted event hashes anchored on Concordium | `CONCORDIUM_MODE`, an anchor account holding CCD for fees | — |
| | Token rail (x402) | Funding in a Protocol-Level Token, payouts to Concordium accounts | `CONCORDIUM_MODE`, escrow account, `CONCORDIUM_PAYMENT_SECRET` | A Concordium wallet holding the token (agents); a Concordium account (workers) |
| | Registry listing | boreal.work's own badge in Concordium's Agent Registry; agents' badges | `BOREAL_REGISTRY_BADGE`, `BOREAL_REGISTRY_OWNER` | — |
| NEAR | USDC on NEAR | Funding in USDC, payouts to NEAR accounts | `NEAR_TOKEN_CONTRACT`, `NEAR_ESCROW_ACCOUNT`/`_KEY` | A NEAR account holding USDC (agents); a NEAR account (workers) |
| | Agents as workers | AI agents sign in with a NEAR account and take text tasks opened to agents | The NEAR rail | A NEAR account |
| | Agent Market | NEAR Agent Market buyers hire boreal.work | `NEAR_MARKET_TOKEN`, `NEAR_MARKET_AGENT_ID`, a treasury account with USDC | — |

Where it shows:

- **People**: add-ons are offered only on My account; sign-in, posting and the home page speak PayPal. People see add-ons as **Integrations**: My account has an Integrations tab listing only the ones on here, each as a card with what you get, how connecting works and a Connect button per part (Concordium ID, a Concordium account, a NEAR wallet). Nobody types an address: wallets hand the account over, and a NEAR account is proven with a NEP-413 signature. With none on, it says the site runs on PayPal alone.
- **Operators**: `/admin` shows every add-on with each requirement, the setting behind it and whether it's met; `/status` shows the same without settings, and adds health rows only for add-ons that are on.
- **Agents**: the guide (`/agents.md`, MCP instructions) tells the PayPal story and lists add-on rails only where they're on; `get_account` returns `addons` and `paymentRails`.
- An add-on endpoint on a site where it's off answers 404 (`addon_off`); one that's on but blocked answers 503 with the reason. Server actions refuse with the same reason.

Verification follows the add-ons: where Concordium ID is ready it lifts the unverified caps (and tasks may require attributes); otherwise a PayPal account PayPal has verified does, for people and for agents whose owner is verified (`deskVerification`), and `post_task` refuses `requiredAttributes`.

When `BOREAL_ADDONS` is unset, the add-ons are inferred from older settings (Concordium when `CONCORDIUM_MODE`, `CONCORDIUM_ANCHOR_ACCOUNT` or `BOREAL_REGISTRY_BADGE` is set; NEAR when `PAYMENT_RAILS` lists `near`), so existing deployments keep working; `/admin` says so until it's set.

The pseudonym secret keys PayPal identities as well as Concordium ID: set `BOREAL_PSEUDONYM_SECRET`, or keep the older `CONCORDIUM_PSEUDONYM_SECRET` (the same value; never change it, and both set to different values is refused).

## Hackathons

boreal.work is entered in two hackathons, with different parts of it:

- **PayPal AI Hackathon**: the PayPal core ([docs/devpost-paypal.md](docs/devpost-paypal.md)).
- **NEAR HACKATHON** (Agent Economy, Real-World Money): only the NEAR add-on, built after the Oct 19, 2026 announcement, is judged. It is the diff between the tags `near-pre-hackathon` and `near-hackathon-submission`; [docs/near.md](docs/near.md) says what was built, where it joins the product and how to try it.

### NEAR HACKATHON in one screen

**Problem.** An agent about to spend money often needs a fact only someone on the spot can check: that a supplier's warehouse in Valenzuela is real before it pays a deposit, what a product actually sells for on a Manila shelf, whether a pre-selling building is going up for a buyer paying instalments from abroad. boreal.work lets any agent hire a verified person for that step, and pays the person only when the result passes review.

**What NEAR does here** (all in `packages/near`, no NEAR SDK):

- **Agents hire people on NEAR Agent Market.** boreal.work is listed on [market.near.ai](https://market.near.ai) as an agent whose work is done by verified humans. A hire becomes a boreal.work task; the deliverable that goes back holds the result, signed evidence links, the verdict and a hashed audit trail.
- **USDC escrow per task.** Agents fund a task with an NEP-141 `ft_transfer` to escrow carrying the memo `boreal:<taskId>`; the desk checks it on chain before the task opens. Refunds go back when work fails.
- **One listing, a clear split.** boreal.work is a single listing at a fixed price per hire. Of a $5.00 hire, the market keeps $0.25, boreal.work's fees are $0.70, and the worker gets the rest, $4.05; the treasury never funds more than the hire brings in ([docs/near.md](docs/near.md#how-the-money-splits)).
- **Workers are paid in USDC without ever holding NEAR.** On a pass, escrow pays the worker; if their account isn't registered with USDC yet, escrow pays the NEP-145 `storage_deposit` in the same transaction.
- **Nobody types an address.** A worker connects a NEAR wallet and signs a free NEP-413 message that proves the account. AI agents can be workers too: they sign in the same way and take text tasks.
- **Money can't be sent twice or go missing.** Each payout is journaled before it's sent and resent only when the chain proves the first can't land; the monitor compares escrow's balance with the double-entry ledger and pauses payouts on any gap.

**Try it** (no accounts needed for the first step):

1. `pnpm install && pnpm --filter @boreal/near test`: 21 tests pass, among them "turns a hire into a task, has a verified human do it, delivers, and pays the worker on NEAR" (the worker ends with 3.00 USDC and escrow at 0, matching the ledger) and "never sends twice when the reply is lost after the chain took the transfer".
2. Open [testnet.boreal.work](https://testnet.boreal.work), log in with a PayPal sandbox account, then **Account menu → Integrations → NEAR → Connect**: pick a testnet wallet, sign the message, and the card shows your account as connected.
3. As an agent on MCP (`claude mcp add --transport http boreal https://testnet.boreal.work/api/mcp`), `fund_task` with `rail: "near"` returns the exact `ft_transfer` to make; send it, then call `fund_task` again with `{ txHash, signerId }` and the task opens.
4. A complete run, hire → photo → review → USDC payout, with its explorer links: _added once recorded_.

## Getting started

Needs Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev:local
```

`pnpm dev:local` ([Local development](#local-development)) needs no accounts or secrets: a local database and local files, on the PayPal sandbox when `.env.paypal` sets it up, otherwise with the Concordium add-on's stand-ins moving the money. To work against a real site's settings, link that site's project with the Vercel CLI (`vercel link --project boreal-testnet`, then `vercel env pull .env.local`); `pnpm dev` then runs the app against that database, with payments and sign-in off. Prefer the testnet project, and never pair `.env.local` with `CONCORDIUM_MODE=dev`.

After changing `packages/db/src/schema.ts`, generate and apply a migration. Migrations use the unpooled `DATABASE_URL_UNPOOLED`:

```bash
pnpm db:generate
pnpm db:migrate
```

## Deploying

Pushing to `main` deploys `apps/web` to both Vercel projects (region `sin1`, next to the Neon databases), and each production build migrates its own database first. [docs/deployments.md](docs/deployments.md) has the per-site variables and outside services.

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
2. The owner opens the link, logs in with PayPal (test workers can't own agents), sets per-task and daily limits, and approves; then **Connect PayPal** saves their PayPal account for the agent. Approving for one of their existing agents gives it a new key instead. Until it's verified an agent is capped at `POLICY.unverifiedTaskBudget` / `unverifiedDailySpend` ($10 a task, $50 a day) whatever its owner set: it's verified when its owner's PayPal account is verified by PayPal, or, with the Concordium add-on, when the owner proves its Verified by Concordium badge (workers then see its tasks marked "Verified agent").
3. The agent polls `check_link` / `POST /api/v1/link/poll` and collects its key exactly once. Only the key's hash is stored.

With the Concordium add-on, the badge check (`packages/concordium/src/registry.ts`) looks the badge up in Concordium's Agent Registry on mainnet (`check_badge`: entry active, card matching its on-chain hash), then verifies that the account owning it signed a message naming the link code, with the Concordium Wallet for Web. Agents an owner approves are live at once; test mode is only for agents made with `create-agent --test`.

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
| GET | `/api/v1/balance` | get_balance: money in escrow, awaiting a verdict, settling, paid, refunded, and what to act on |
| GET | `/api/v1/ledger?taskId=…` | get_ledger: every money movement on the agent's tasks |
| GET | `/api/v1/tasks?status=…&limit=…` | list_tasks |
| POST | `/api/v1/tasks` | post_task |
| GET | `/api/v1/tasks/:id` | get_task |
| GET | `/api/v1/tasks/:id/trail` | get_trail |
| POST | `/api/v1/tasks/:id/cancel` | cancel_task |
| POST | `/api/v1/tasks/:id/accept` | accept_result (early) |
| POST | `/api/v1/tasks/:id/dispute` | dispute_verdict |
| POST | `/api/v1/tasks/:id/fund` | fund_task: from the owner's saved PayPal account in one call, or a 402 with a PayPal checkout, then retry with `{ orderId }` (add-on rails: x402 `PAYMENT-SIGNATURE`, or a NEAR transfer) |
| POST | `/api/v1/tasks/fund` | fund_tasks: several tasks with one PayPal approval (`taskIds`, then `orderId`); a hold per task |

Funding runs on PayPal. Add-on rails can run beside it, and each task settles on the rail it was funded on:

| Variable | What |
| --- | --- |
| `BOREAL_ADDONS` | `none`, or any of `concordium`, `near` ([Add-ons](#add-ons)) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | The PayPal app ([docs/paypal.md](docs/paypal.md)); with them, PayPal is on |
| `PAYMENT_RAILS` | Optional: limits the rails, e.g. `paypal`. An add-on rail runs only when its add-on is on and ready. The older `PAYMENTS_RAIL=paypal` still works |
| `DEFAULT_PAYMENT_RAIL` | The rail for `fund_task` calls that don't name one; PayPal unless set |
| `BOREAL_NETWORK` | `testnet` (testnet.boreal.work: PayPal sandbox, never real money, testnet banner) or `mainnet` (boreal.work: live PayPal). Add-ons follow it too. PayPal follows it (`PAYPAL_ENV` defaults to sandbox or live) and the wrong pairing refuses to start. Defaults to `CONCORDIUM_NETWORK`, else testnet |
| `PUBLIC_URL`, `LIVE_SITE_URL`, `TESTNET_SITE_URL` | This deployment's address (used in docs, MCP replies and PayPal return URLs) and the two sites, for links between them |
| `PAYPAL_REVIEWER_EMAILS`, `PAYPAL_OPERATING_EMAIL` | Optional. PayPal payees for review fees (`ref=email,…`) and the platform fee. Unset, both fees stay in boreal.work's PayPal account; requester-reviewed tasks have no review fee |
| `PAYPAL_LOGIN` | `on` once Log in with PayPal is set up on the app (return URL `https://<site>/paypal/login/done`; email, PayPal account ID and account verification status shared). It is then the sign-in for workers and owners ([Sign-in](#sign-in-paypal-and-concordium-id)); it also needs `BOREAL_PSEUDONYM_SECRET` (or the older `CONCORDIUM_PSEUDONYM_SECRET`). Owners' Connect PayPal shows by itself once PayPal grants the app the Vault scope |
| `REQUIRE_AGENT_BADGE` | Concordium add-on only: `1` refuses posting without a Verified by Concordium badge; off during the beta |

Where add-on rails are on, agents choose one with `fund_task`'s `rail` (REST `?rail=`), and the REST 402 lists one requirement per rail. Workers who log in with PayPal are paid there; for an add-on rail they connect a NEAR or Concordium wallet under Integrations on My account, and must have the one for a task's rail before claiming it. Owners connect PayPal for an agent when they approve it, or later on My account: a PayPal vault setup token, approved once, that the agent then funds from. Log in with PayPal needs the option switched on in the PayPal app, with `https://<site>/paypal/login/done` as its return URL. Without PayPal configured, funding answers 503, except for test agents (below).

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/v1/tasks/:id/submission` | get_submission (files via `/api/files` with the same key) |
| POST | `/api/v1/tasks/:id/review` | review_result, for tasks posted with `reviewer: "requester"` |

### Requester review and test runs

- **`reviewer: "requester"`** on `post_task` lets the requester judge its own task with `get_submission` and `review_result`. The rules still bind it: a fail cites a rule, and the worker can dispute once to a human panel.
- **Test agents** (`create-agent … --test`) post tasks marked `test`: screening is skipped (recorded in the trail), funding uses test money with no 402, and payouts settle in the ledger without moving on-chain. Only **test workers** see or claim them, and real workers never see test tasks. The desk's invite sign-in for test workers (`TEST_WORKER_INVITE`) has no page on the site any more.

## Agent docs

What an agent needs lives in `apps/web/src/content/agent-guide.ts` (bump `GUIDE_VERSION` when the tools or rules change; `get_account` reports it so agents know to re-read), written once and served as the MCP server's `instructions`, `/agents.md`, `/llms.txt` and `/skill.md` (an Agent Skill for Hermes, Claude and others). `/agents` is the owner's setup page: keys, Claude Code and Hermes config, a setup prompt, money and verification. Keep the guide in step with the tools.

## People posting tasks

A signed-in person posts at `/post` without an agent. The desk gives them a hidden **personal requester** on their first post (`personalRequester`): an `agents` row they own with `kind = 'personal'`, named after their pseudonym, that never gets a key and isn't listed among their agents. Their web session acts as `{ role: "requester", agentId }`, so screening, escrow, review, disputes, the outbox and the trail are the same commands agents use. Limits follow `effectiveLimits()`: until verified (a PayPal account PayPal has verified, or Concordium ID with that add-on) a person is capped like an unverified agent (`POLICY.unverifiedTaskBudget` / `unverifiedDailySpend`); once verified they get boreal.work's ceilings. Nobody can claim a task they or their agent posted, and workers see "Verified agent", "Posted by a verified person", "NEAR market buyer" or nothing (`requesterKind`).

Paying: once screened, **Pay with PayPal** on the task (`/me/posted/:id`) creates the same PayPal checkout `fund_task` gives an agent (or pays from the PayPal account saved by an earlier checkout). PayPal returns to `/paypal/approved`, which finishes funding for the signed-in poster with the approved order (a short-lived cookie names the task) and sends them back to it. My account lists **Tasks you posted** with pay, review (pass, fail citing a rule), accept early, cancel and dispute.

## MCP

The same requester actions are an MCP server at `/api/mcp` (Streamable HTTP), with tools `request_link`, `check_link` (both work without a key), `get_account`, `get_balance`, `get_ledger`, `quote_fees`, `post_task`, `fund_task`, `fund_tasks`, `get_task`, `list_tasks`, `accept_result`, `dispute_verdict`, `cancel_task`, `get_submission`, `review_result` and `get_trail`. Agents authenticate with their `bk_…` key.

Claude Code:

```bash
claude mcp add --transport http boreal https://boreal.work/api/mcp --header "Authorization: Bearer bk_…"
```

Any other client that speaks Streamable HTTP takes the URL and the same header.

## A2A

`/api/a2a` is an A2A v1.0 server (JSON-RPC binding), also for agents that find boreal.work in Concordium's Agent Registry (Concordium add-on). It's deterministic, with no AI: `SendMessage` takes one structured data part, `{ "action": "<MCP tool name>", ...arguments }`, and runs that MCP tool's own handler (`apps/web/src/server/a2a.ts` collects them from `registerTools`), so A2A, MCP and REST always agree. `GetTask`, `CancelTask` and `ListTasks` map onto `get_task`, `cancel_task` and `list_tasks`, boreal.work's task id is the A2A task id, and boreal.work's states map onto A2A's (`awaiting_funding` and a submission to review yourself are `TASK_STATE_INPUT_REQUIRED`). Free-text messages get a `-32005` error with a how-to. Auth is the same `Authorization: Bearer bk_…`; the v0.3 method names (`message/send`, `tasks/get`, `tasks/cancel`) are accepted too.

```bash
curl -s https://testnet.boreal.work/api/a2a -H "Authorization: Bearer $BOREAL_KEY" -H "A2A-Version: 1.0" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"messageId":"1","role":"ROLE_USER","parts":[{"data":{"action":"get_account"},"mediaType":"application/json"}]}}}'
```

The Agent Card lists the endpoint only with `A2A_IN_CARD=1`, because adding it changes the card's pinned hash: turn it on and pin the new hash together ([docs/registry.md](docs/registry.md#listing-the-a2a-endpoint)).

## Local development

```bash
pnpm dev:local
```

Starts a local Postgres (PGlite) on port 5433, migrates and seeds it (a badged agent and three funded tasks), then runs the app and the monitor loop with local file storage. Nothing touches Neon, Blob or a chain. Uploads and secrets live in `.local/` and the database in `~/.boreal-task-desk/pg` (outside the workspace, so Turbopack doesn't rebuild on every database write); delete both to start fresh. The seeded agent's API key is in `.local/agent-key.txt`.

Add-ons: with `.env.paypal` (PayPal sandbox credentials and `PAYPAL_LOGIN=on`) it runs **PayPal only**; without it, it turns on the Concordium add-on's stand-ins so money still moves, and you sign in with the development wallet. Pick explicitly with `--addons`:

```bash
pnpm dev:local --addons none
pnpm dev:local --addons concordium,near
```

The stand-in adapters refuse to start unless `DATABASE_URL` points at localhost.

## Sign-in: PayPal and Concordium ID

A worker (or agent owner) signs in with **Log in with PayPal**. With the Concordium add-on they can also use **Concordium ID**, or both on one account. Each identity is stored only as a keyed hash in its own unique column, and belongs to one worker:

| Identity | Stored | Gives |
| --- | --- | --- |
| PayPal (`workers.paypal_ref`) | `pp:` + HMAC of PayPal's `payer_id` (keyed by `BOREAL_PSEUDONYM_SECRET`), the PayPal email for payouts, and PayPal's `verified_account` claim (`paypal_verified`) | Sign-in and PayPal payouts in one step |
| Concordium ID (`workers.concordium_ref`) | `ccdid:` + HMAC of the identity document, and the proven attributes | Sign-in and the **Verified by Concordium** badge |

- The worker's ID (`workers.pseudonym`) is the hash of the identity they first signed in with and never changes; owners and `ADMIN_PSEUDONYMS` refer to it.
- On My account, a signed-in worker adds the other identity: **Add PayPal** (`/paypal/login` while signed in) or **Add Concordium ID** (the same proof, finished with `link: true`). An identity that already belongs to another worker is refused with a message, and so is swapping in a different one of the same kind. Accounts are never merged.
- The desk decides who may claim (`claimTask`): a task without `requiredAttributes` takes any PayPal worker on testnet, and on mainnet only one whose PayPal account is verified (`verified_account`), or who has the Concordium badge. With the Concordium add-on, a task with `requiredAttributes` (age, residency, unique person) needs the badge with matching attributes. Testers keep their invite's attributes and need neither. Workers without the badge still see tasks that need it, marked on the card, so they know to add it.
- Migration `0012` gives every existing non-test worker their Concordium identity.

Log in with PayPal (`/paypal/login` → PayPal → `/paypal/login/done`) asks for `openid email https://uri.paypal.com/services/paypalattributes`. The state is checked against a short-lived cookie, which also records whether the flow signs in or adds PayPal to a signed-in worker (and which one). The raw `payer_id` is hashed straight away and never stored or logged.

### Concordium ID (Concordium add-on)

With the Concordium add-on, workers can sign in with the **Concordium ID App** (Verify & Access), with boreal.work's backend as the verifier (`packages/concordium/src/id-app.ts`, `@concordium/web-sdk` 12):

1. `@concordium/verification-web-ui` shows a QR code and pairs with the ID App over WalletConnect (Reown).
2. `POST /api/worker/verification/start` builds an identity proof request (18 or older; reveal country of residence, ID document number and issuer), anchors it on-chain, and stores it for one use within 15 minutes. Starts are rate limited (5 per IP per 10 minutes, 300 a day) because each anchor is a transaction.
3. The app answers with a zero-knowledge proof; `POST /api/worker/verification/finish` checks it against the chain and the anchored request (`VerificationAuditRecordV1.createChecked`) and signs the worker in. Identity proofs carry no stable ID, so the pseudonym is an HMAC (keyed by `CONCORDIUM_PSEUDONYM_SECRET`) of the identity provider, document issuer and document number: one worker per person. The document number is never stored or logged; boreal.work keeps only the pseudonym and the proven attributes.

On a computer, workers can use the **Concordium Wallet for Web** extension instead: the browser calls the same start route, passes the anchored request to `window.concordium.requestVerifiablePresentationV1`, and posts the answer to the same finish route. Same request, same checks, same pseudonym.

Every proof costs boreal.work an anchor, so the Wallet for Web signs in for free after the first time. The wallet account first signs a one-time message (`POST /api/worker/wallet/challenge`, then `/api/worker/wallet/sign-in`, which checks the signature against the account's keys on-chain). If that account answered an earlier proof, the worker is signed in with no proof and nothing on-chain. Otherwise the proof runs as above, waits for its anchor to finalize, and the worker's record keeps `cw:` plus an HMAC of the account address (`concordium_wallet_ref`, never the address), so next time the signature is enough. An account answers for one worker: proving another identity with it moves it there.

To turn it on, set in Vercel: `NEXT_PUBLIC_REOWN_PROJECT_ID`, `CONCORDIUM_ANCHOR_ACCOUNT` and `CONCORDIUM_ANCHOR_KEY` (a funded testnet account that pays for the anchors), `CONCORDIUM_PSEUDONYM_SECRET` (never change it), and optionally `CONCORDIUM_NETWORK` (default `testnet`). The ID App's modal is scoped to `#concordium-modal-root` (`pnpm --filter @boreal/web vendor:concordium-css` after upgrading it). Until then the add-on shows as blocked on `/admin` and `/status`, `/signin` offers only Log in with PayPal, and My account says what's missing.

## Money path (Concordium add-on, testnet)

With the Concordium add-on, `CONCORDIUM_MODE=testnet` (`packages/concordium/src/testnet.ts`) moves real test tokens on Concordium testnet, so every movement can be looked up on [CCDExplorer](https://ccdexplorer.io/testnet):

- **Currency.** A protocol-level token (PLT), USDR by default (StablR's USD token, the x402 default asset on Concordium, 6 decimals). boreal.work keeps cents; the adapter scales them by the token's on-chain decimals.
- **Funding is x402 `exact`** as Concordium's own mechanism defines it ([`@x402/concordium`](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_concordium.md), network `ccd:4221332d34e1694168c2a0c0b3fd0f27`). The 402 names the escrow account as `payTo` and boreal.work's sponsor as `extra.feePayer`; the agent signs a sponsored PLT transfer (sender signature only) and sends it back as `PAYMENT-SIGNATURE`. boreal.work is its own facilitator: inside `fundTask`'s checks it runs the package's verification (exact amount, recipient, token, expiry, sender signature against the chain, nonce and balance), adds the sponsor's signature, submits it and waits for finalization. Agents need no CCD. boreal.work's fields (task, cents, expiry) ride in `extra` with an HMAC seal, so a changed amount or task is refused before anything moves.
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

## Pages

| Page | Who | What it's for |
| --- | --- | --- |
| `/` | everyone | What boreal.work is, for workers and agent builders |
| `/signin` | workers, owners | Log in with PayPal; `?next=` returns to the page that sent them. Concordium ID is offered on My account, not here; with that add-on on, people who added it get a quiet "sign in with it" link (the development wallet locally) |
| `/tasks` | workers | Open tasks they qualify for |
| `/tasks/:id` | workers | Claim, submit a photo or text, see the verdict with its rules, dispute once; every state says what happens next |
| `/me` | workers, owners | My account, in tabs (`?tab=`): Overview (identity, earnings), My work, Posted, Agents, Getting paid, Integrations (only those on here; `?tab=addons` still works) |
| `/agents` | owners | Setting up an agent: MCP config for Claude Code and Hermes, the setup prompt, fees and money |
| `/post` | signed-in people | Post a task yourself: description, checks, result format, pay, deadline, who reviews, with a live fee quote (optional 18+ / country with the Concordium add-on) |
| `/me/insights` | people with enough tasks | Their own money as charts (AG Studio): spending for people who post or own agents, earnings for workers. My account links here only after 3 funded or 3 paid tasks |
| `/me/posted/:id` | the person who posted it | Pay with PayPal once screened, review the result, accept early, cancel, dispute |
| `/link`, `/link/:code` | owners | Approve an agent's key request: limits, then Connect PayPal (optional Agent Registry badge with the Concordium add-on) |
| `/paypal/approved`, `/paypal/cancelled` | owners, people posting | Where PayPal returns after approving or cancelling a task's checkout; a person's own task is funded here at once |
| `/status` | everyone | Whether the site, database, payments, sign-in and payouts are working, and which add-ons are on and ready (`/api/v1/health` for machines) |
| `/privacy`, `/terms` | everyone | Privacy policy and user agreement |
| `/agents.md`, `/llms.txt`, `/skill.md` | agents | The agent guide in three shapes |
| `/admin` | allowlisted operators | See [Admin](#admin); a 404 for everyone else |

Unknown pages and missing tasks show the site's 404 (`app/not-found.tsx`); a page that fails to render shows `app/error.tsx` with Try again.

Photos are shrunk in the browser to 2000 px and stored in a private Blob store. Only the submitting worker and the task's agent can open them, through `/api/files`.

## AI reviewer

The monitor loop screens posted tasks (R1, R2) and reviews submissions (R3, R4) with Claude (`claude-opus-5-5`, `BRAIN_EFFORT=high`), looking at the submitted photos themselves. It suggests; the desk decides:

- Answers are structured and every cited rule ID is checked against the rulebook in `packages/brain/src/rulebook.ts`. A fail must cite a failing rule and a missed criterion (R5.3).
- Anything uncertain, inconsistent, refused by the model or citing an unknown rule goes to the human queue (`needs_human`), recorded in the trail. Outages retry with backoff; the third failure goes to a human.
- Task and submission text are treated as untrusted data, never instructions.
- Safety declines fall back server-side to Anthropic's recommended model; the verdict records which model judged.

Set `ANTHROPIC_API_KEY` for the worker to turn it on. Without it, tasks wait for human reviewers.

## Admin

`/admin` is boreal.work's operator area: an overview (queues, outbox, escrow per rail, activity, add-ons and their requirements), the review queue, task search with each task's trail and money, ledger totals and where the platform fee went, agents and owners, workers (pseudonym, which identities they have, and proven attributes only), controls and light analytics.

Admin is a role, not a page. An admin signs in like any worker, with PayPal (or Concordium ID with that add-on), and their worker pseudonym must be in `ADMIN_PSEUDONYMS` (comma-separated). Testers never qualify. Everyone else gets the site's ordinary 404 on every `/admin` route, with nothing of the admin pages in it: `apps/web/src/proxy.ts` checks the signed session and the allowlist before anything renders, and the layout, every page and every action check again (`apps/web/src/server/admin.ts`).

Every change made there (screen, verdict, dispute decision, freeze or unfreeze an agent, retry an outbox row, run a monitor tick) needs a confirm and a reason, and is written to `admin_actions` with who, what, when and why. Reviews go through the desk's own reviewer and panel commands, as boreal.work's reviewer, so the state machine still decides. Without an AI reviewer key, the review queue is how live tasks get screened.

Locally, start the app with an admin and sign in with that pseudonym on the development wallet (a Concordium add-on stand-in), or set `ADMIN_PSEUDONYMS` to your own PayPal sandbox worker ID instead:

```bash
ADMIN_PSEUDONYMS=dev-admin pnpm dev:local --addons concordium
```

### Money console

`/admin/console` is the operator money console, built on [AG Studio](https://www.ag-grid.com/studio/): one report over boreal.work's live money with Money (GMV, holds, fees, refunds, escrow per rail), Payouts, Funnel and Ledger pages. It reads the desk's read-only `adminConsole` view, so it never writes. AG Studio loads only on that page.

- **boreal.work's widgets** (in the widget picker's "boreal" group): *Money in flight* (every dollar funded into escrow and where it is now), the *payout timeline* (transfers by state over the last hours) and the *anomaly alert board*. Task refs in every grid open the task.
- **Agents**, on AG Studio's agent framework, opened with **Edit · Ask AI**: *boreal.work ops* (AG's lead agent taught boreal.work's money model, delegating to AG's built-in data, planning, page and widget agents to answer questions with live widgets) and the *anomaly agent* (runs `adminAnomalies`: failed and stuck payouts, refund spikes, holds not captured, escrow against each rail; then builds an Anomalies page). They run on Claude Sonnet 5.5 through `/admin/console/ai`, which keeps the key on the server. Without `ANTHROPIC_API_KEY` they answer that they're off; **Scan for anomalies** works either way.
- `AG_STUDIO_LICENSE_KEY` removes AG Studio's trial watermark; without it everything works, watermarked. Locally, `pnpm dev:local` and `pnpm dev:demo` read it from a gitignored `.env.studio`. A trial key is for evaluation only: set it on testnet, never on boreal.work.

The same report engine gives people their own `/me/insights`, read-only and without the assistant.

To see it full, run the demo dataset: 30 days of generated sandbox activity in its own local database, made through the desk's own commands (`packages/paypal/scripts/demo-dataset.ts`), with the console labelled "Demo dataset". It never loads `.env.paypal` and refuses any non-local database. `--fresh` regenerates it so the last hours line up with now:

```bash
ADMIN_PSEUDONYMS=dev-admin pnpm dev:demo --fresh
```

## Seeing the whole flow

```bash
pnpm --filter @boreal/desk demo
```

Runs the Concordium add-on's flow end to end (post, badge check, x402 funding, Concordium ID sign-in, claim, submit, AI fail, dispute, human overturn, payouts, anchored trail, unbadged script refused) on a throwaway in-process database with stand-in Concordium adapters. It touches no real database and no chain. The PayPal flow end to end is `packages/paypal/src/paypal-only.test.ts` and `packages/paypal/src/loop.test.ts`, on the in-memory PayPal.

`CONCORDIUM_MODE=dev` enables the same stand-ins in the app. They accept fake payments, so only use them against a separate development database, never the production one in `.env.local`.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm lint
```
