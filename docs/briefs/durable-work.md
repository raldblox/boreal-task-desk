# Brief: background work that survives failures and scales

For: the most capable model (see "Who does what" in `CLAUDE.md`). Read `CLAUDE.md`, `packages/monitor/src/index.ts`, `packages/desk/src/outbox.ts`, `apps/web/src/app/api/cron/tick`, `apps/worker` and `apps/web/vercel.json` first. Do this last of the four briefs: it matters once there's real traffic.

## Why

Everything time-driven runs in one **monitor tick**: claims that expire, deadlines, objection windows closing, AI screening and review, the outbox (payouts, refunds, captures, anchors), the NEAR market bridge and the escrow check. A database lease makes sure only one tick runs at a time. It's triggered by Vercel cron, by the local worker loop, and "soon" after user actions.

It's simple and correct today, but it won't hold:

- One tick does everything in sequence, inside one function's time limit (300 s). A slow AI review or a stuck chain RPC delays every payout behind it.
- One global lease means one tick at a time for the whole site, however many tasks are waiting.
- A payout that keeps failing is retried on every tick with nothing smarter, and an operator finds out only by looking.
- Work started "after" a user action (`after(kickMonitor)`) can be cut off with the function.

## What to build

1. **Split the tick into independent jobs:** timers, screening, reviewing, the outbox per rail, the market bridge, reconciliation. Each job has its own lease or claim. A slow one can't hold up the others, and one task's work can run in parallel with another's.
2. **Durable steps for the outbox:** claim a row, send, record. Resume after a crash with no double send; the journaling rule in `CLAUDE.md` still holds. Back off on failures, and dead-letter after a limit, with the reason shown in `/admin`.
3. **Pick the runtime on evidence.** Compare staying on Postgres-backed queues (`FOR UPDATE SKIP LOCKED`) with Vercel's queue or workflow products. Read the current docs; don't rely on memory. Weigh cost, local development (`pnpm dev:local` must keep working with no cloud services), and lock-in. Write the decision down in `docs/background-work.md`, then build it.
4. **Observability:** per-job counts, how long the oldest item has waited, failures, and dead letters, on `/status` (public, no personal data) and `/admin`. Warn an operator when a payout is stuck.

## Rules

- Correctness first. A payout or refund is never sent twice, and a verdict never lands twice. Keep the existing idempotency keys and the escrow-against-ledger check that pauses a rail's payouts whenever its escrow is short of the ledger.
- Everything in `CLAUDE.md` holds; with every add-on off, PayPal-only still works.
- `pnpm dev:local` and the desk tests on PGlite keep working with no external services.
- Add a load test: hundreds of tasks moving through screening, review and payout at once, with exact money at the end.
- Commit on `main` in the main checkout in reviewable steps, each passing `pnpm typecheck` and `pnpm test`. Don't push.

## Done looks like

- Independent jobs, with a slow or failing job shown not to block payouts.
- The outbox resuming after a crash with no double send, proven by tests that kill it mid-step.
- Dead letters visible in `/admin`; job health on `/status`.
- The runtime decision written down with its trade-offs.
- A summary of what changed, what was tested, and the risks left.
