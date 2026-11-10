# boreal-task-desk

pnpm workspace. See README.md for the layout. The product spec lives in the "boreal.work — Vision & Draft Specs" Claude Doc (https://claude.ai/artifact/84JJPMPj7NFfCUJ6SUHAvg), with the rulebook in its Rulebook tab (v2.0, also published at `/rules`).

## Rules that the code must keep

- Only `packages/core` moves a task between states (`transition()`), and every transition names the actor allowed to make it. The AI never changes state.
- All writes go through `packages/desk`: one transaction per command that locks the task, applies `transition()`, appends the hashed event and settles money. Never update `tasks` directly elsewhere.
- Import drizzle helpers (`eq`, `sql`, …) from `@boreal/db`, never from `drizzle-orm`, so the whole workspace shares one drizzle copy.
- Desk tests run on PGlite (`@boreal/db/testing`), a fresh database per test.
- The reviewer decides pass or fail. The requester can accept a pass early, but never overrule one. One dispute per task.
- Money is integer minor units. Every movement is a ledger entry with an idempotency key, written before the on-chain transfer.
- Side effects (anchors, payouts, refunds, webhooks) go through the outbox in the same transaction as the state change.
- Nothing personal goes on-chain: anchors are salted hashes. Workers are stored as a pseudonym plus proven attributes.
- PayPal is the core; NEAR and Concordium are add-ons (`BOREAL_ADDONS`, `packages/core/src/addons.ts`). With every add-on off the app must run on PayPal alone. Loaders read add-on settings only through `addonEnv()` (web: `gatedEnv()` in `apps/web/src/server/addons.ts`), and add-on UI, routes and actions check `getAddons()` / `addonRefusal()` / `requireAddonPart()` so an add-on that's off or blocked says why instead of failing.
- `packages/concordium` holds the interfaces, stand-in (`dev`) adapters and the testnet adapters (`CONCORDIUM_MODE=testnet`). Never set `CONCORDIUM_MODE=dev` against the production database: the stand-ins accept fake payments.
- A payout or refund is journaled on its outbox row before it is sent, and resent only once the chain can never execute the first one.
- A task is funded before it is screened: posting only quotes (`awaiting_funding`), funding holds the money and sends it to screening (`posted`). Nothing is screened, by a person or an AI, until its money is held. A refused task's money is released in full (a PayPal hold is voided). Funding still confirms the payment inside `fundTask`'s checks, so a task its checks refuse never takes money. AI screening runs by default; `AI_SCREENING=off` leaves it to people in `/admin`.
- The AI reviewer (`packages/brain`) never changes state itself: `runAiReview` feeds its result to the desk, and anything undecided goes to `flagForHuman`. Keep `rulebook.ts` in sync with the spec's Rulebook tab.

## Conventions

- Workspace packages export TypeScript source directly (`exports: ./src/index.ts`); Turbopack and tsx compile them.
- shadcn uses the base-nova style on Base UI. Add components with `pnpm dlx shadcn@latest add <name>` from `apps/web`. For a link styled as a button, use `buttonVariants()` on the link, not `<Button render>`.
- Next.js 16: read `apps/web/AGENTS.md` and the docs in `apps/web/node_modules/next/dist/docs/` before writing Next code.
- Develop with `pnpm dev:local` (local PGlite Postgres, stand-in adapters, local files). `.env.local` points at production.
- Pages read sessions and data inside `<Suspense>` (Cache Components); `workerFromSession()` calls `connection()` first.
- Run `pnpm typecheck` and `pnpm test` before committing.

## Who does what (models)

- **The most capable model (Fable 5.2) takes the ambitious, open-ended technical work:** money and security paths, smart contracts, cross-package architecture, hard debugging. Briefs for that work live in `docs/briefs/`.
- **It does not polish UI, copy or visual design itself.** It builds the minimal working UI its feature needs, then writes what should change (layout, wording, states, visual design) as notes in `docs/handoff.md` for a cheaper model to carry out. Notes name the file and component, say what's wrong and what done looks like, and follow the brand rules (always "boreal.work"; illustrations are hand-built SVG).
- **Any model doing UI, copy or design work reads `docs/handoff.md` first**, carries out the open notes that fit its task, and marks each one done with its commit.
