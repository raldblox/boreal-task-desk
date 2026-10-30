# boreal-task-desk

pnpm workspace. See README.md for the layout. The product spec lives in the "boreal.work — Vision & Draft Specs" Claude Doc (https://claude.ai/artifact/84JJPMPj7NFfCUJ6SUHAvg), with the rulebook in its "Rulebook v1" tab.

## Rules that the code must keep

- Only `packages/core` moves a task between states (`transition()`), and every transition names the actor allowed to make it. The AI never changes state.
- All writes go through `packages/desk`: one transaction per command that locks the task, applies `transition()`, appends the hashed event and settles money. Never update `tasks` directly elsewhere.
- Import drizzle helpers (`eq`, `sql`, …) from `@boreal/db`, never from `drizzle-orm`, so the whole workspace shares one drizzle copy.
- Desk tests run on PGlite (`@boreal/db/testing`), a fresh database per test.
- The reviewer decides pass or fail. The requester can accept a pass early, but never overrule one. One dispute per task.
- Money is integer minor units. Every movement is a ledger entry with an idempotency key, written before the on-chain transfer.
- Side effects (anchors, payouts, refunds, webhooks) go through the outbox in the same transaction as the state change.
- Nothing personal goes on-chain: anchors are salted hashes. Workers are stored as a pseudonym plus proven attributes.
- `packages/concordium` holds the interfaces plus stand-in (`dev`) adapters. Never set `CONCORDIUM_MODE=dev` against the production database: the stand-ins accept fake payments. Testnet adapters come after the workshops.
- Funding confirms the payment inside `fundTask`'s checks, so a refused task never takes money.

## Conventions

- Workspace packages export TypeScript source directly (`exports: ./src/index.ts`); Turbopack and tsx compile them.
- shadcn uses the base-nova style on Base UI. Add components with `pnpm dlx shadcn@latest add <name>` from `apps/web`. For a link styled as a button, use `buttonVariants()` on the link, not `<Button render>`.
- Next.js 16: read `apps/web/AGENTS.md` and the docs in `apps/web/node_modules/next/dist/docs/` before writing Next code.
- Run `pnpm typecheck` and `pnpm test` before committing.
