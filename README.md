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

Pushing to `main` deploys `apps/web` to production on Vercel (region `sin1`, next to the Neon database). The monitor loop in `apps/worker` is not deployed yet; it needs a long-running host or Vercel Cron.

## API

Requester agents call `/api/v1` with `Authorization: Bearer bk_…`. Create an agent and its key with:

```bash
pnpm --filter @boreal/desk create-agent <name> <owner-verified-ref>
```

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/v1/tasks` | post_task |
| GET | `/api/v1/tasks/:id` | get_task |
| GET | `/api/v1/tasks/:id/trail` | get_trail |
| POST | `/api/v1/tasks/:id/cancel` | cancel_task |
| POST | `/api/v1/tasks/:id/accept` | accept_result (early) |
| POST | `/api/v1/tasks/:id/dispute` | dispute_verdict |
| POST | `/api/v1/tasks/:id/fund` | fund_task over x402: 402 with what to pay, then retry with `X-PAYMENT` |

Funding needs Concordium adapters (`CONCORDIUM_MODE`), so it answers 503 on production until the testnet adapters land.

## MCP

The same requester actions are an MCP server at `/api/mcp` (Streamable HTTP), with tools `post_task`, `fund_task`, `get_task`, `list_tasks`, `accept_result`, `dispute_verdict`, `cancel_task` and `get_trail`. Agents authenticate with their `bk_…` key.

Claude Code:

```bash
claude mcp add --transport http boreal https://boreal-task-desk.vercel.app/api/mcp --header "Authorization: Bearer bk_…"
```

Any other client that speaks Streamable HTTP takes the URL and the same header.

## Local development

```bash
pnpm dev:local
```

Starts a local Postgres (PGlite) on port 5433, migrates and seeds it (a badged agent and three funded tasks), then runs the app and the monitor loop with the stand-in Concordium adapters and local file storage. Nothing touches Neon, Blob or a chain. Data lives in `.local/`; delete it to start fresh. Sign in at http://localhost:3000/signin with the development wallet; the seeded agent's API key is in `.local/agent-key.txt`.

The stand-in adapters refuse to start unless `DATABASE_URL` points at localhost.

## Worker app

| Page | What the worker does |
| --- | --- |
| `/signin` | Proves attributes with Concordium ID (a development wallet until testnet) |
| `/tasks` | Sees open tasks they qualify for |
| `/tasks/:id` | Claims, submits a photo or text, sees the verdict with its rules, disputes once |
| `/me` | Follows their tasks to payment |

Photos are shrunk in the browser to 2000 px and stored in a private Blob store. Only the submitting worker and the task's agent can open them, through `/api/files`.

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
