# Brief: owners approve, limit, pause and are told about what their agents spend

For: the most capable model (see "Who does what" in `CLAUDE.md`). Read `CLAUDE.md`, `docs/readiness.md` (RS-1 to RS-5, RS-17), `packages/desk/src/links.ts`, `desk.ts` (`holdFunding`, `fundTasksSaved`, `requesterReview`), `packages/desk/src/keys.ts`, `apps/web/src/app/link/` and the Agents tab in `apps/web/src/app/me/page.tsx` first.

## Why

An owner approves an agent once, sets two limits, and connects PayPal. From then on anything holding the agent's `bk_` key can place holds on the owner's PayPal account, up to the daily limit, with nobody asked and nobody told. The owner can't see what was spent, change a limit, pause the agent or take the key back; only an operator can freeze it.

The Hermes catalog review (NousResearch/hermes-agent#153094) blocked the plugin until every money move asked the user. The plugin now asks, but that is the client being polite. The server must hold the line for every client: MCP, REST, A2A and the plugin.

## What to build

1. **A spending mode per agent**, set at approval and enforced in `packages/desk`, never in a client:
   - **Ask me each time** (the default for new agents). `fund_task` and `fund_tasks` don't place a hold. They record a pending approval and return it with an `approveUrl`; the owner, signed in, approves or declines that payment or batch; the agent polls or is told. An approval expires (15 minutes, like a link request) and covers exactly the tasks and total it showed.
   - **Spend within limits**: today's behaviour.
   - Decide, and write down, whether "ask" also covers `accept_result` and a self-review pass (readiness RS-4). The recommendation there is a 24-hour hold on self-reviewed passes that the owner can release.
2. **Owner commands in the desk**, each audited (who, what, when; an `owner_actions` table or `admin_actions` with an owner ref):
   - pause and resume an agent: paused, it reads but can't post, fund, accept or review. Funding already refuses a requester that isn't active (RS-5);
   - revoke the key, with a new one only through a new link;
   - change the limits and the mode;
   - disconnect the saved PayPal account, here and in PayPal's vault.
3. **What the owner sees**: per agent, spent today, this week and in total, open holds, and the last payments with their tasks. A desk view; the minimal table on My account → Agents, the rest as notes in `docs/handoff.md`.
4. **Telling the owner** (needs the email provider the owner picks: `docs/readiness.md`, Needs the owner): a receipt for each hold, capture, release and refund from their agent, an alert at 80% of the daily limit and on a refused funding. Through the outbox, in the same transaction as the money change. Use the same path for the worker and poster notifications in RS-17, so there is one notification system.
5. **Every surface says the same thing**: `get_account` reports the mode and whether the agent is paused; the pending-approval reply is described once and served to the guide, MCP tool descriptions, REST, the A2A card and the Hermes plugin. This changes what `fund_task` can answer, so it is a breaking change: bump `GUIDE_VERSION`, change the plugin in its own repo and move the pin, and enter it in the ledger.

## Rules

- Everything in `CLAUDE.md` holds. Funding still confirms the payment inside `fundTask`'s checks; an approval is one more check before it, not a second way to move money.
- Existing agents keep working: migrate them to "spend within limits" and tell their owners once (the owner's call; see the ledger).
- An approval is bound to the owner's signed-in session and to the exact tasks and amount. It can't be replayed, widened or used by the agent itself.
- With every add-on off, PayPal alone runs the whole flow. On NEAR the agent pays from its own wallet, which its owner topped up: say plainly in the UI and guide that "ask me each time" can't hold back money already in the agent's wallet, and what does (the on-chain vault in `near-vault.md`).
- Don't design the pages: minimal working UI, then notes in `docs/handoff.md`.
- Commit on `main` in the main checkout in reviewable steps, each passing `pnpm typecheck` and `pnpm test`. Don't push.

## Done looks like

- A new agent can't place a hold until its owner approves that payment; a test drives it over REST, MCP and A2A.
- An owner pauses, revokes, re-limits and disconnects from My account, each in the audit trail, each with a desk test.
- The owner's spend view matches the ledger to the cent in a test.
- RS-1, RS-2 (and RS-3 and RS-17, if the provider is chosen) marked done in `docs/readiness.md` with their commits.
- A summary of what changed, what was tested, and the risks left.
