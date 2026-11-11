# Readiness ledger

Kept by the readiness sweep (`docs/briefs/readiness-sweep.md`). Each finding has:

- an ID;
- its kind: defect, wrong design or gap;
- its lens: workers, production, business or market;
- its severity: S1 loses money, data or trust; S2 blocks a flow; S3 wrong with a workaround; S4 polish;
- evidence, the fix, and its status.

It is ranked by severity, then by how many people a finding hits.

## Verdicts

| Lens | Verdict | Why |
| --- | --- | --- |
| Workers | not assessed | |
| Production | not assessed | |
| Business | **not ready** | RS-1 to RS-5: an owner can't control or even see what their agent spends |
| Market | **not ready** | Agent builders and the Hermes catalog expect the owner to approve money moves (RS-1) |

## Open

Seeded on 2026-11-12. The Hermes catalog review (NousResearch/hermes-agent#153094) blocked the plugin until every call that moves money asks the user. The plugin now does, but only inside Hermes: any other MCP, REST or A2A client with a `bk_` key moves money with no approval. These need server-side fixes.

### RS-1 · wrong design · business, market · S1 — Owners can't require approval before an agent pays

**Evidence**
- The approval form only sets a per-task and a daily limit (`apps/web/src/app/link/approve-form.tsx:123,137`; checked in `packages/desk/src/links.ts:237-243`), and the agent is live right away (`links.ts:277`).
- `fund_task` charges the owner's saved PayPal with no per-payment approval (`apps/web/src/server/mcp.ts:428-437`).
- `fund_tasks` charges up to 10 tasks at once (`packages/desk/src/desk.ts:757-775`).

**Fix**
- Add a spending mode per agent, chosen at approval and enforced in `packages/desk`:
  - **Ask me each time:** the default for new agents. Funding returns a pending approval with an `approveUrl` for the owner, who approves or declines that one payment, or that batch. On approval the hold is placed; on decline the agent is told.
  - **Spend on its own within limits:** today's behaviour.
- The owner can change the mode later (see RS-2).
- `get_account` reports the mode. The agent guide, the MCP tool descriptions, the A2A card and the Hermes plugin all explain the pending-approval reply. The plugin's approval prompt stays on as well.

**Status:** open

### RS-2 · gap · business · S1 — No owner controls: pause, revoke, change limits, disconnect PayPal, see spend

**Evidence**
- My agents (`apps/web/src/app/me/page.tsx:583-634`) shows only the agent's name, badges, NEAR wallet and Connect PayPal.
- `listOwnerAgents` returns no spend (`packages/desk/src/links.ts:192-205`). `spentLast24h` and `leftToday` are visible only to the agent (`desk.ts:1531-1532`) and to admins.
- Limits change only through a new link that the agent has to start (`links.ts:251-262`).
- Only admins can freeze an agent (`packages/desk/src/admin.ts:124-134`).

**Fix**
- Owner commands in the desk, each one audited:
  - pause and resume (a paused agent can read but can't post, fund or release);
  - revoke the key (`keys.ts`);
  - edit the limits and the spending mode;
  - disconnect the saved PayPal account (the vault).
- My agents shows each agent's spend today, this week and in total, and its open holds.
- UI beyond the minimum goes to `docs/handoff.md`.

**Status:** open

### RS-3 · gap · business, production · S1 — Owners aren't told when their agent spends

**Evidence:** there is no notification code in `packages/*/src` or `apps/web/src/server`. Funding, early accepts and self-review passes happen silently.

**Fix**
- A receipt to the owner for every hold, release and refund that comes from their agent. It goes through the outbox, in the same transaction as the money change.
- An alert when the agent reaches 80% of its daily limit, and when funding is refused.
- Pick a channel (email to the PayPal-verified address is the obvious first one) and record the decision.
- Needs: an email provider. This is an owner decision; recommend one in **Needs the owner**.

**Status:** open

### RS-4 · wrong design · business · S1 — A self-reviewed pass pays out at once, which makes collusion cheap

**Evidence**
- With `reviewer: "requester"`, a pass runs `accept_early` straight away, so there is no objection window (`packages/desk/src/desk.ts:1386-1390`).
- `claimTask` only blocks a worker who owns the posting agent (`desk.ts:797-800`). A separate verified accomplice can claim, submit, be passed, and be paid at once.
- Self-review lowers the fee: `reviewFee` is 0 (`packages/core/src/fees.ts:41-45`).
- Only the caps bound this.

**Fix**
- A self-reviewed pass keeps a short hold before it is final (for example 24 h), which the owner can cut short.
- In "ask" mode (RS-1), the owner confirms an early accept or a self-review pass before money is released.
- Collusion signals go to `/admin`: the same worker passed repeatedly by the same agent or owner, accounts sharing identity or payout details, and self-reviewed tasks with near-instant passes.
- Rulebook and spec changes must stay in sync with `packages/brain/src/rulebook.ts`.

**Status:** open

### RS-5 · defect · business · S2 — The per-task cap is checked when a task is posted, not when it is funded

**Evidence**
- The cap is enforced at post time (`packages/desk/src/desk.ts:558-568`).
- `holdFunding` checks the quote and the daily cap, but not the per-task cap (`desk.ts:652-674`).
- An owner who lowers the limit (once RS-2 lets them) would still be charged at the old limit for tasks already posted.

**Fix:** re-check the per-task cap and the verification caps inside `holdFunding`, using the limits in force at funding time. Add a test that lowers the limit between posting and funding.

**Status:** open

## Needs the owner

- **RS-1 default mode for existing agents.** Recommendation: leave existing agents on "spend within limits", tell each owner once, and default every new agent to "ask me each time".
- **RS-3 email provider.** Not chosen yet.

## Gaps

RS-2 and RS-3 so far. The sweep adds the rest.

## Done

_None yet._
