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
pnpm dev
```

`pnpm dev` runs the web app on http://localhost:3000 and the monitor loop together, both reading `.env.local`.

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

Funding and the worker routes arrive with the x402 and Concordium ID adapters.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm lint
```
