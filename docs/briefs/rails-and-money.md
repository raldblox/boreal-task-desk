# Brief: payment rails as plug-ins, and money that carries its currency

For: the most capable model (see "Who does what" in `CLAUDE.md`). Read `CLAUDE.md`, `README.md`, `docs/near.md` and `docs/paypal.md` first. Do this **after** `near-vault.md` lands, since both touch `packages/near`.

## Why

boreal.work has three rails (PayPal, USDC on NEAR, Concordium tokens), and the next ones are already in view: local payouts for Filipino workers (GCash, Hyperwallet), Stripe, other chains. Adding one today is a hunt:

- The rail is checked by name in **34 places** across `apps/web` and the packages (`paymentRail === "near"` and the like): labels, payout setup, explorer links, refund wording, claim rules.
- The shared rail types (`PaymentRail`, `Payments`, `PaymentRails`) live in `@boreal/concordium`, an **add-on**, even though PayPal is the core and every package imports them from there.
- Money has **no currency**: every amount is "US cents". NEAR pays in USDC and Concordium in USDR, both USD-pegged, so it works by luck. A peso payout, or a euro task, can't be expressed.
- What differs between rails (a hold versus an escrow, who pays fees, how a payout is proven, what a payee needs to have connected) is decided in many places, instead of each rail saying it once.

## What to build

**1. A rail contract, in a package that isn't an add-on** (`packages/core`, or a new `packages/rails`; your call, write down why). Each rail declares, once:

- its id, label and the currencies it settles in;
- how funding works: a hold (captured or voided) or an escrow (transferred), and how a funding proof is verified;
- how payouts and refunds are sent, journaled and proven final (the rule in `CLAUDE.md`: journaled before sending, resent only when the first can never execute);
- what a payee must have connected (a PayPal login, a NEAR wallet, a Concordium account), and how to check it;
- public explorer links, if any;
- which add-on part gates it.

PayPal, NEAR and Concordium become three implementations. The desk, outbox, monitor, MCP and web read the rail registry instead of branching on names.

**2. Money with a currency.** Amounts become integer minor units **plus** an ISO currency (USD first; design for PHP and EUR). That means:

- a migration that backfills `USD` everywhere it's implied today: tasks, ledger, quotes, limits;
- fees and limits that know their currency;
- a task that settles in one currency, refusing a rail that can't settle it, with no silent conversion anywhere;
- ledger checks and the escrow reconciliation in the monitor stay exact per currency.

**3. Remove the 34 name checks.** The UI gets labels, payee requirements and links from the registry. A test fails if a rail's name is compared outside its own implementation.

**4. Prove it with a fourth rail.** Add a stand-in rail (a `dev` rail like the Concordium stand-ins: fake, local only, refused on production) that settles in PHP. The test is that it plugs in without touching the desk, outbox or pages.

## Rules

- Everything in `CLAUDE.md` holds. With every add-on off, the app runs on PayPal alone, and nothing an add-on owns loads.
- No behaviour change for existing tasks: every existing test passes unchanged, apart from imports. Add tests that pin today's behaviour before moving it.
- Migrations are additive and safe to run on both live databases (deploys run them).
- Commit on `main` in the main checkout in reviewable steps, each passing `pnpm typecheck` and `pnpm test`. Don't push.
- UI: keep it working and plain; any wording or design that should change goes to `docs/handoff.md`.

## Done looks like

- The rail registry and the three rails behind it; no rail name compared outside its own implementation, enforced by a test.
- Currency on every amount, migrated, with tests for refusing a mismatched rail and for exact per-currency reconciliation.
- The PHP stand-in rail working end to end locally, with no edits to the desk, outbox or pages.
- `docs/rails.md`: how to add a rail, as a checklist.
- A summary of what changed, what was tested, and the risks left.
