# Brief: an on-chain spending-limit vault for agents on NEAR

For: the most capable model (see "Who does what" in `CLAUDE.md`). Read `CLAUDE.md`, `docs/near.md` and `docs/near-demo.md` first.

## Why

An agent on boreal.work pays for tasks in USDC on NEAR. Today (commit `d9b28e1`) the owner sends USDC straight to the agent's own wallet, and the agent holds a full-access key to it. That works, but it's crude: the only limit on the chain is the balance, and whoever holds the agent's key holds all the money.

The upgrade is the NEAR-native version of PayPal's saved account, and it's non-custodial: **give an AI money without giving it the keys.** It's built for NEAR HACKATHON's AI Security & Defense track (`security`: "spending limits, policy engines, sandboxed wallets… function call keys"), alongside `agents`, `realworld` and `privacy`. The deadline is **Nov 14, 23:59 UTC**.

## What to build

**1. A vault contract** (Rust, `near-sdk`), in a new `contracts/agent-vault/`:

- One vault per owner (or one shared contract keyed by owner; your call, write down why).
- The owner deposits USDC into it with `ft_transfer_call` (the vault implements `ft_on_transfer`) and withdraws what's left whenever they like.
- The owner registers an agent with on-chain limits: per payment, per rolling day, and an allowlist of payees (boreal.work's escrow account). The owner can pause or remove the agent at any time.
- The agent calls one method, `pay_task(task_id, amount)`, through a **function-call access key** the owner added for that method only. No deposit is attached, so a restricted key can call it. The vault checks the limits, then `ft_transfer`s to the allowed payee with memo `boreal:<taskId>` (the memo `packages/near/src/payments.ts` already checks).
- Correctness that must hold, each with a test:
  - A failed transfer rolls back what it counted toward the limits (the callback undoes it).
  - Two payments sent together can't exceed a limit.
  - Only the owner can withdraw, change limits or add payees; an agent key can do nothing but `pay_task`.
  - Storage is paid for, and a payee not registered with USDC fails cleanly with nothing lost.
  - The same `task_id` can't be paid twice.
- Tests run on a local sandbox (`near-workspaces` or equivalent) with a test USDC contract.

**2. boreal.work's side:**

- `packages/near`: confirming funding accepts a payment that came from the vault (the transfer's signer is the vault, called by the agent's key). Keep `fund_task`'s checks exactly as strict: the amount, the payee, the memo and finality.
- The agent's flow: `get_account` shows the vault, its balance and its limits. A small helper (like `packages/near/scripts/agent-pay.ts`) calls `pay_task` with a function-call key.
- The owner's flow: on the link page after Approve, and on My account → Your agents, **Set up a vault** does everything in one wallet approval (or as few as possible): create or reuse the vault, deposit USDC, register the agent with the limits the owner already set on boreal.work, and add the agent's restricted key. Build it working and plain; write the polish as notes in `docs/handoff.md`.
- Keep yesterday's direct wallet funding as the fallback, so nothing that works today breaks.
- agents.md (`apps/web/src/content/agent-guide.ts`): a short section on paying from a vault, with tests in `agent-guide.test.ts`.
- `docs/near.md`: the vault in "What was built", the `security` track row, and a "do X, see Y" for it.

**3. Deploy:** build it so a testnet deploy is one command. The deploy itself needs the owner's testnet account and their go-ahead. Ask; never sign or send for them, and never on mainnet.

## Rules

- Everything in `CLAUDE.md` still holds: `transition()` only in `packages/core`, all writes through `packages/desk`, the ledger entry before the transfer, side effects through the outbox, with every add-on off the app runs on PayPal alone.
- Commit on `main` in the main checkout (no branches, no worktrees), in pieces that each pass `pnpm typecheck` and `pnpm test`. Don't push; the owner pushes.
- No secrets in the repo or in output: keys go in git-ignored env files, as `packages/near/.env.agent-wallet` does.
- If the Rust toolchain or anything else is missing, say exactly what to install and stop at that step, rather than working around it.

## Done looks like

- The contract with passing sandbox tests for every rule above, and a one-command testnet deploy.
- An agent paying a real testnet task from a vault through a function-call key, `fund_task` accepting it, and the task opening.
- The owner's **Set up a vault** working end to end on testnet.
- agents.md, `docs/near.md` and `docs/handoff.md` updated, and a short note in `docs/near-demo-run.md` on whether the film should show the vault instead of direct funding.
- A summary of what was built, what was tested, what wasn't, and the risks left.
