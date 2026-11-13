# Readiness ledger

Kept by the readiness sweep (`docs/briefs/readiness-sweep.md`). Each finding has:

- an ID;
- its kind: defect, wrong design or gap;
- its lens: workers, production, business or market;
- its severity: S1 loses money, data or trust; S2 blocks a flow; S3 wrong with a workaround; S4 polish;
- evidence, the fix, and its status.

It is ranked by severity, then by how many people a finding hits.

Last sweep: 2026-11-12 (Fable 5.2), with a second pass the same day at the owner's request (owner controls, rail switches, admin passkey, the EVM add-on, rulebook 2.1). It read the money, state and security paths in `packages/core`, `desk`, `monitor`, `paypal`, `near` and the web app's API, sessions and file routes. It did **not** drive the app in a browser: see [Not verified](#not-verified).

## Verdicts

| Lens | Verdict | Why |
| --- | --- | --- |
| Workers | **not ready** | Nobody is told when a verdict, dispute or payout needs them (RS-17). A dispute nobody decides holds the worker's pay with no time limit (RS-18). Timers run once a day unless someone is using the site (RS-16). Fixed this sweep: a silent requester (RS-11) and a failed PayPal payout (RS-12) no longer leave a worker unpaid forever. The worker flow on a phone was not driven this sweep. |
| Production | **not ready** | Timers and payouts depend on a daily cron plus traffic (RS-16). A failing payout is visible only to an operator who opens `/admin`: nothing alerts (RS-19). No rate limits on agent keys (RS-21). Backups, restore and rollback are undocumented and untested (Gaps). Fixed this sweep: RS-6, 7, 8, 9, 13, 14. |
| Business | **not ready** | RS-1 to RS-4: an owner can't control or see what their agent spends, and a self-reviewed pass pays at once. No contact path on the legal pages (Gaps). The ledger itself reconciles in tests: every `pnpm test` money flow ends with escrow at zero. |
| Market | **not ready** | Agent builders and the Hermes catalog expect the owner to approve money moves (RS-1). The guide, MCP, REST and A2A were not compared tool by tool this sweep. |

## Open

Ranked by severity, then reach.

### RS-1 · wrong design · business, market · S1 — Owners can't require approval before an agent pays

Seeded on 2026-11-12. The Hermes catalog review (NousResearch/hermes-agent#153094) blocked the plugin until every call that moves money asks the user. The plugin now does, but only inside Hermes: any other MCP, REST or A2A client with a `bk_` key moves money with no approval. These need server-side fixes.

**Evidence**
- The approval form only sets a per-task and a daily limit (`apps/web/src/app/link/approve-form.tsx:123,137`; checked in `packages/desk/src/links.ts:237-243`), and the agent is live right away (`links.ts:277`).
- `fund_task` charges the owner's saved PayPal with no per-payment approval (`apps/web/src/server/mcp.ts:428-437`).
- `fund_tasks` charges up to 10 tasks at once (`desk.fundTasksSaved`).

**Fix**
- Add a spending mode per agent, chosen at approval and enforced in `packages/desk`:
  - **Ask me each time:** the default for new agents. Funding returns a pending approval with an `approveUrl` for the owner, who approves or declines that one payment, or that batch. On approval the hold is placed; on decline the agent is told.
  - **Spend on its own within limits:** today's behaviour.
- The owner can change the mode later (see RS-2).
- `get_account` reports the mode. The agent guide, the MCP tool descriptions, the A2A card and the Hermes plugin all explain the pending-approval reply. The plugin's approval prompt stays on as well.

**Status:** done (`693cf11`). A spending mode per agent, enforced in the desk: in `ask` (the default for a newly linked agent) the saved PayPal account moves only under an approval the owner gave at `/approve/<id>` for exactly those tasks; `fund_task` and `fund_tasks` answer `approvalRequired` (REST 202) and hold nothing. Existing agents stay on `auto`. Tests: `packages/desk/src/owner.test.ts` (5), and the PayPal end-to-end test now goes through the approval. Left: `accept_result` and a self-review pass are not gated (the owner's decision: they release pay at once); money already in an agent's own NEAR or EVM wallet can't be held back by this; the Hermes plugin doesn't explain the new reply yet (RS-27).

### RS-2 · gap · business · S1 — No owner controls: pause, revoke, change limits, disconnect PayPal, see spend

**Evidence**
- My agents (`apps/web/src/app/me/page.tsx:583-634`) shows only the agent's name, badges, NEAR wallet and Connect PayPal.
- `listOwnerAgents` returns no spend (`packages/desk/src/links.ts:192-205`). `spentLast24h` and `leftToday` are visible only to the agent (`desk.getAgentAccount`) and to admins.
- Limits change only through a new link that the agent has to start (`links.ts:251-262`).
- Only admins can freeze an agent (`packages/desk/src/admin.ts`, `adminSetAgentStatus`).

**Fix**
- Owner commands in the desk, each one audited:
  - pause and resume (a paused agent can read but can't post, fund or release);
  - revoke the key (`keys.ts`);
  - edit the limits and the spending mode;
  - disconnect the saved PayPal account (the vault).
- My agents shows each agent's spend today, this week and in total, and its open holds.
- UI beyond the minimum goes to `docs/handoff.md`.

**Status:** done (`693cf11`). The owner pauses and resumes, revokes the key, changes limits and mode, and disconnects PayPal (also deleted at PayPal, best effort), each in `owner_actions`; My account → Agents shows spend today, this week and in all, and what is held. Tests: `owner.test.ts` (4), the spend view against the ledger to the cent. The page is the bare minimum: handoff note 7.

### RS-3 · gap · business, production · S1 — Owners aren't told when their agent spends

**Evidence:** there is no notification code in `packages/*/src` or `apps/web/src/server`. Funding, early accepts and self-review passes happen silently.

**Fix**
- A receipt to the owner for every hold, release and refund that comes from their agent. It goes through the outbox, in the same transaction as the money change (the `webhook` outbox kind exists and delivers nothing: `packages/desk/src/outbox.ts`, `case "webhook"`).
- An alert when the agent reaches 80% of its daily limit, and when funding is refused.
- Pick a channel (email to the PayPal-verified address is the obvious first one) and record the decision.

**Status:** open, waiting on the owner (email provider). Briefed with RS-17 in [`docs/briefs/owner-controls.md`](briefs/owner-controls.md).

### RS-4 · wrong design · business · S1 — A self-reviewed pass pays out at once, which makes collusion cheap

**Evidence**
- With `reviewer: "requester"`, a pass runs `accept_early` straight away, so there is no objection window (`desk.requesterReview`).
- `claimTask` only blocks a worker who owns the posting agent. A separate verified accomplice can claim, submit, be passed, and be paid at once.
- Self-review lowers the fee: `reviewFee` is 0 (`packages/core/src/fees.ts`, `quoteFees`).
- Only the caps bound this.
- The other direction is open too: a requester who reviews its own task has seen the result (`get_submission`) before it decides, so it can fail good work and keep it. The worker's one dispute is the only check, and nothing counts a requester's overturned fails (`POLICY.lostDisputesBeforePause` is never read: RS-23).

**Fix**
- A self-reviewed pass keeps a short hold before it is final (for example 24 h), which the owner can cut short.
- In "ask" mode (RS-1), the owner confirms an early accept or a self-review pass before money is released.
- Collusion signals go to `/admin`: the same worker passed repeatedly by the same agent or owner, accounts sharing identity or payout details, self-reviewed tasks with near-instant passes, and requesters whose fails a panel keeps overturning.
- Rulebook and spec changes must stay in sync with `packages/brain/src/rulebook.ts`.

**Status:** open, by the owner's decision of 2026-11-12: a pass the requester gives or accepts releases the worker's pay at once, with no hold. What remains is making abuse visible: collusion signals in `/admin` (the same worker passed again and again by one owner's agents, near-instant self-review passes, requesters whose fails a panel overturns). Not built.

### RS-20 · defect · business · S1 (NEAR and Concordium add-ons) — Money sent to escrow for a task that then isn't funded has no way back

**Evidence**
- On NEAR the agent pays first: it sends `ft_transfer` to escrow, then calls `fund_task` with the transaction hash (`packages/near/src/payments.ts`, `confirmPayment`). The claim "a task its checks refuse never takes money" holds on PayPal (the hold is placed inside the checks) and on Concordium x402 (settled inside the checks), but not on NEAR.
- If `fund_task` then refuses (the daily cap, a cap lowered since posting (RS-5), a frozen agent, a task cancelled or already funded) or is never called, the USDC stays in escrow with no ledger entry and no task. Nothing returns it, and `/admin` has no tool to.
- Until this sweep that unmatched money also paused every payout on every rail (RS-9). Now it is reported as "holds N more than the ledger" and pauses nothing.

**Fix**
- When funding is refused after the rail confirmed a payment that has already settled (`ConfirmedPayment` without `hold`), record it and queue its return to `payer` (now known: RS-6) through the outbox, with its own ledger entries (`requester → escrow`, `escrow → requester`) so the books still balance.
- An admin action to return an unmatched deposit by transaction hash, for transfers whose `fund_task` never came.
- Needs a ledger entry that belongs to no funded task, which the current `ledgerEscrowBalance` join on tasks doesn't count: design it with [`rails-and-money.md`](briefs/rails-and-money.md).

**Status:** open. The owner agreed on 2026-11-12: NEAR stays off boreal.work. An operator can also close any rail to new money at once from `/admin/controls` (`693cf11`). The EVM rail (`docs/evm.md`) doesn't have this flaw: the agent signs, and boreal.work submits only inside the funding checks.

### RS-16 · gap · workers, production · S2 — Timers and payouts run once a day unless someone is using the site

**Evidence**
- `apps/web/vercel.json`: the only cron is `0 3 * * *`.
- Everything time-driven is one monitor tick (`packages/monitor/src/index.ts`): claims expiring, deadlines, the 48-hour objection window that pays the worker, AI review retries, payouts, refunds, and now the 72-hour review limit (RS-11).
- Between crons the tick runs only after someone's write, or at most once a minute on a read (`apps/web/src/server/monitor.ts`, `kickMonitorSoon`). On a quiet day a worker's pay can be up to 24 hours later than the "48 hours" the rulebook and guide promise, and a refund the same.

**Fix:** call `GET /api/cron/tick` every 5 minutes or less. Either Vercel Cron on a plan that allows it (changing `vercel.json` on a plan that doesn't fails the deploy, so this wasn't changed), or an outside scheduler with `CRON_SECRET`. [`durable-work.md`](briefs/durable-work.md) is the larger answer.

**Status:** accepted by the owner on 2026-11-12: the cron stays daily (the hosting plan's limit). Pay is released at once when a requester reviews or accepts, because every write runs the monitor straight away; only the timers (the 48-hour window, deadlines, the 72-hour review limit) can run late on a day nobody uses the site, by up to 24 hours. The rulebook's "48 hours" is therefore "48 hours, or the next activity or daily run after it": say so where pay timing is promised (handoff note 12).

### RS-17 · gap · workers, business · S2 — Nobody is told when something needs them

**Evidence:** no notification code anywhere (`grep -ri "sendEmail\|notif"` over `apps/web/src` and `packages/*/src` finds only the A2A card's `pushNotifications: false`). A worker learns of a verdict, a fail they have 48 hours to dispute, a dispute decision or a payout only by opening the task page. A requester who reviews its own tasks learns of a submission only by polling, and now has 72 hours (RS-11). An operator learns of the human queue only by opening `/admin`.

**Fix:** one notification path through the outbox (same transaction as the state change), email first: to workers on verdict, dispute decision and payout sent or failed; to posters on a submission to review; to operators on a new human-queue item. Same channel decision as RS-3.

**Status:** open, waiting on the owner (email provider, with RS-3).

### RS-18 · gap · workers · S2 — A dispute nobody decides holds the money with no time limit

**Evidence**
- `POLICY.disputeDecisionMs` (72 hours) is defined in `packages/core/src/policy.ts` and never read.
- The only exits from `disputed` are `panel_pass` and `panel_fail`, by a person in `/admin` (`packages/core/src/task.ts`). No timer escalates or alerts on an old dispute, and the same is true of anything in the human queue (`needsHuman`).
- A PayPal hold lasts 29 days (RS-7): a dispute left for weeks ends with a hold that can't be captured, and the worker can't be paid at all.

**Fix**
- Put disputes and human-queue items older than 24 hours in the anomaly scan (`findAnomalies`) and in the operator alert (RS-19).
- Decide what happens at 72 hours with no decision (see [Needs the owner](#needs-the-owner)).

**Status:** partly done (`026b44c`): every tick reports disputes past 72 hours and human-queue items older than a day, in the cron's answer, the logs and `/admin`'s tick. Nothing decides itself. Left: pushing that to an operator needs the alert channel (RS-19).

### RS-19 · gap · production · S2 — A failing payout is silent until someone opens /admin

**Evidence**
- A failing outbox row retries with backoff up to an hour, forever (`drainOutbox`); there is no attempt limit and no dead-letter state.
- Failures are written to `outbox.last_error`, the tick report and `console.error`. Nothing pushes them anywhere: no alert, no email, no webhook (`grep -ri "sentry\|slack\|pagerduty"` finds nothing).
- The cron route answers 207 when a tick has errors (`apps/web/src/app/api/cron/tick/route.ts`), which Vercel Cron doesn't act on.

**Fix:** an operator alert channel (a webhook URL in the environment is enough to start) fired from the tick when: a rail is paused, an outbox row has failed 5 times, a transfer is `failed`, or the human queue or a dispute is older than 24 hours. Part of [`durable-work.md`](briefs/durable-work.md).

**Status:** open, waiting on the owner (where alerts go).

### RS-21 · gap · production, market · S2 — No rate limits on agent keys or the worker API

**Evidence:** the only limits are on unauthenticated starts: link requests (`links.ts`, 5 per client per 10 minutes) and Concordium sign-in starts (`desk.checkVerificationAllowed`). `asRequester` and `asAgentWorker` (`apps/web/src/server/desk.ts`) run every call a key sends. Each call hits the database, each write starts a monitor tick, and `post_task`/`cancel_task` can loop freely under the five-unfunded cap, appending trail events and anchor rows each time.

**Fix:** a per-key and per-IP limit at the API edge (requests per minute, writes per minute), answering 429 with `Retry-After`; say the limits in the guide. Needs a shared counter (the database, or a KV store).

**Status:** open, waiting on the owner (the limits themselves, and whether to add a KV store).

### RS-22 · gap · workers · S3 — A worker can claim and drop the same tasks over and over

**Evidence:** `claimTask` limits active claims to one (`workers.maxActiveClaims`), but nothing counts claims that were released or left to expire. A worker (or a requester's competitor) can hold any task for four hours at a time, again and again, until its deadline.

**Fix:** count a worker's expired claims in the last 7 days; after three, a cooling-off period before the next claim, and never the same task twice after letting it expire. Needs a rulebook line.

**Status:** open.

### RS-23 · wrong design · business · S3 — Policy that is written down and never enforced

**Evidence:** `POLICY.lostDisputesBeforePause`, `lostDisputesWindowMs`, `maxActiveClaimsPerNewWorker`, `disputeDecisionMs`, `reconcileIntervalMs` and `disputeDeposit()` (`packages/core/src/fees.ts`) are read by nothing but tests. Disputes are free, nobody is paused for losing them, and no dispute deposit is taken. The code reads as if these rules were in force.

**Fix:** for each, either enforce it or delete it; the spec says which were meant. Free disputes are right for workers; a requester who keeps losing disputes should be paused (RS-4).

**Status:** open, waiting on the owner (which of these the spec still wants).

### RS-24 · defect · production · S3 (add-ons) — A chain rail with no operating account retries its fee payout forever

**Evidence:** on NEAR and Concordium the platform fee is a payout to `operating` (`settlementMovements`); `addressFor` throws "no payout address for operating" when `OPERATING_ACCOUNT_ADDRESS` / `NEAR_OPERATING_ACCOUNT` is unset (`packages/desk/src/outbox.ts`). Neither is a requirement in `packages/core/src/addons.ts`, so the add-on shows as ready and every passed task leaves one outbox row failing hourly.

**Fix:** make the operating account a requirement of each chain rail's part in `addons.ts`, so the rail is blocked with the reason until it is set.

**Status:** open.

### RS-25 · wrong design · business · S3 — A person's verdict is recorded as the AI reviewer's

**Evidence:** an operator's verdict from `/admin` goes in as `BOREAL_REVIEWER`, whose `reviewerRef` is `boreal-ai-reviewer` (`packages/desk/src/admin.ts`). The task's hashed trail, which the worker and requester can read, then says the AI reviewed it; only the internal audit log says a person did. With RS-11 this now includes submissions a silent requester left behind.

**Fix:** a separate reviewer ref for people (`boreal-human-reviewer`), paid the same way, so the trail says who decided in kind (never who by name).

**Status:** open.

### RS-27 · gap · market · S2 — The Hermes plugin doesn't know the owner-approval reply

**Evidence:** `integrations/hermes-boreal/__init__.py`, `boreal_fund_task` (around line 233): it understands a payment requirement with an `approveUrl` and a funded task. For an agent in `ask` mode with a saved PayPal account the server now answers `approvalRequired` with its own `approveUrl` (REST 202); the plugin passes the JSON through, so the model sees the link, but its `next` hint and its session digest don't mention it.

**Fix:** in the plugin's own repo: read `approvalRequired`, tell the owner the link, poll `get_task`; add `spendingMode` and `paused` to what `/borealwork` shows; then move the pin here. The plugin's own approval prompt stays.

**Status:** done in the plugin (`raldblox/hermes-boreal` `9ed0133`, 0.2.1; pin moved here). `boreal_fund_task` passes on `approvalRequired` with the next step. The same release closes the Hermes catalog review's last blocker (money calls now run only after the spend guard has cleared them) and three more gaps: a per-call approval key, a daily cap that counts boreal.work's own 24-hour figure, and HTTPS only with no redirects. Left: `/borealwork` doesn't show `spendingMode` or `paused`; the catalog PR (NousResearch/hermes-agent#153094) awaits re-review.

### RS-26 · gap · market · S4 — The Hermes plugin doesn't say the deadline limit

**Evidence:** `integrations/hermes-boreal/schemas.py:59` describes `deadline_hours` with no maximum. The server now refuses more than 14 days (RS-7) with a clear message, so nothing breaks; the agent just learns it late.

**Fix:** in the plugin's own repo, add "at most 336" to the description, then move the pin.

**Status:** open.

### RS-28 · wrong design · workers, market · S1 — "Verified people" wasn't enforced off mainnet, and a Concordium account didn't count

**Evidence:** the claim gate's verified-PayPal check ran only on mainnet (`apps/web/src/server/desk.ts`, `requireVerifiedPayPal: NETWORK === "mainnet"`). On testnet any signed-in person could claim a task with no required attributes. A worker signed in with a Concordium Wallet signature was created and then refused on mainnet, a dead end, although Concordium opens accounts only on an identity a provider has checked.

**Fix (done, see Done):** verification is on by default in the desk and on every network. A person claims only with a PayPal account PayPal has verified, Concordium ID, or a Concordium account. The task page tells an unverified person why and how to verify before they try. `/signin` offers Concordium as a full way in when PayPal fails or hasn't verified them, with the steps and costs.

**Still open:** "verified" is not "unique". One person with two verified PayPal accounts, or two Concordium accounts on one identity, can work as two. Recommendation: key Concordium workers on the identity (the proof's credential ID) rather than the account, and flag workers who share a payout email in `/admin`.

**Done (2026-11-13):** the Concordium proof also gives a keyed person code (name and date of birth, hashed at once and discarded), so a second document or identity provider finds the first account and is refused. A payout destination can pay one account only. `/admin/workers` lists softer signs (shared payout details, a worker passed again and again by one owner) and can block an account from claiming. Closing an account releases all of these.

**Done (2026-11-13), ZKPassport:** a third way to verify, from a passport's chip (the `zkpassport` add-on). One passport makes one account (`workers.passport_ref`, a keyed hash of ZKPassport's salted identifier), and its proof gives the same person code as Concordium ID's, so one person can't hold one of each. The Concordium Wallet for Web proof is now the fee-free Web3 ID request. See `docs/verified-people.md`.

**Status:** done for Concordium ID, ZKPassport and payout destinations; PayPal-only workers still need a document check to be unique (owner decision). Still to do: one real-passport round trip on testnet, and one real Wallet for Web proof on testnet, before relying on either in production.

### RS-29 · wrong design · workers, business · S2 — The dispute "panel" is one admin

**Evidence:** the rulebook (R6.3) and the site promise a panel that decides by majority with a human member breaking ties. `decideDispute` takes one admin's decision (`packages/desk/src/admin.ts`, `BOREAL_PANEL`).

**Fix:** either record a real panel (two or three deciders, a majority, the human member named in the trail) or change R6.3 and the copy to "a person at boreal.work decides". Owner decision; recommendation: change the words now, add a second decider once there are two admins.

**Status:** done (6262573): the panel is the AI reviewer and a person; the AI votes, the person decides and wins when they disagree; rulebook 2.2

### RS-30 · wrong design · business · S3 — "Escrow" on PayPal is a hold on the payer's own account

**Evidence:** the site says money is "held in escrow" (`apps/web/src/app/layout.tsx` metadata, the footer, the Open Graph image). On PayPal it is an authorization on the payer's account that boreal.work captures on a pass (`/agents` says this correctly).

**Fix:** say "held until the work passes" everywhere a PayPal task is described, and keep "escrow" for the add-on rails where boreal.work's escrow account holds the money.

**Status:** done (8bc36c2)

## Needs the owner

Each has a recommendation; none blocks the others.

1. **Scheduler (RS-16).** Settled 2026-11-12: the cron stays daily; pay is released at once on a review or an accept. See RS-16 for what can still run late.
2. **Email provider, and where operator alerts go (RS-3, RS-17, RS-19).** Recommendation: one transactional email provider for people, and a single webhook URL (Slack or Discord) for operator alerts. Not chosen yet.
3. **When to run `owner-controls.md`.** Settled: done on 2026-11-12 (`693cf11`), except telling owners about spending (RS-3), which waits on item 2.
4. **RS-1 default mode for existing agents.** Settled as recommended: existing agents stay on "pay on its own", new ones ask each time. Nobody has been told yet: there is no way to tell them until item 2.
5. **RS-4: a hold on self-reviewed passes.** Settled 2026-11-12: no hold. A review or an accept by the requester releases pay at once.
6. **RS-11: what should a requester's silence mean?** Now: after 72 hours the submission goes to boreal.work's reviewers, who judge it for no review fee. Recommendation: keep that while volume is small, and move to "passes automatically after 72 hours" (as MTurk and Upwork do) once the reviewers' queue is the bottleneck; that needs a state-machine change (`verdict_pass` by `system`) and a rulebook line. Either way the 72 hours belongs in the rulebook: see 9.
7. **RS-18: a dispute with no decision after 72 hours.** Recommendation: it never decides itself (a panel with a person is the promise), but it alerts operators at 24 and 72 hours, and the status page counts disputes past 72 hours.
8. **NEAR on mainnet (RS-20).** Settled 2026-11-12: it stays off boreal.work; only PayPal is needed there. Rails can also be closed from `/admin/controls`.
9. **Rulebook 2.1.** Settled: R1.8 and R5.8 are in the spec's Rulebook tab (v2.1), and `/rules`, `/terms`, `/faq` and the post form cite them. The `rulebook.ts` and `POLICY.rulebookVersion` change sits uncommitted with the owner-controls work and lands with it.
10. **RS-9's changed safety behaviour.** Settled 2026-11-12: the owner approved it.
11. **A contact address.** Settled: a direct message to @borealwork on X for now (`apps/web/src/content/contact.ts`), on the footer, `/terms`, `/privacy`, `/faq` and the agent guide. Change that one file when there is a mailbox or a support chat.
12. **RS-21 rate limits.** Recommendation: 60 requests and 20 writes a minute per key to start, counted in Postgres.
13. **RS-23: which unenforced policies the spec still wants.** Recommendation: delete the dispute deposit and the new-worker claim limit (the per-worker limit already does it); enforce the lost-disputes pause for requesters.

14. **A first passkey for each admin on boreal.work.** `/admin` now needs one on mainnet. Set `ADMIN_PASSKEY_ENROLL_CODE` (16+ characters) in the mainnet project, enrol two keys at `/admin-passkey`, then remove the variable (README, Admin). Until then nobody can open `/admin` on boreal.work after the next deploy: do this at the deploy.
15. **Which chain and token for the EVM rail.** Built for USDC on Base by default, but nothing is baked in. Recommendation: Base, Circle's USDC; follow `docs/evm.md`, testnet first.

## Gaps

Capabilities a product moving other people's money needs. Ranked; each is fixed, briefed or waiting on the owner.

| # | Gap | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Owner controls and approvals | RS-1, RS-2 | Done (`693cf11`) |
| 2 | Notifications to workers, posters, owners | RS-3, RS-17 | Waiting on the owner (provider) |
| 3 | A scheduler that runs every few minutes | RS-16 | Accepted by the owner: daily cron, plus a tick on every write |
| 4 | Operator alerting and a dead-letter state | RS-19 | Waiting on the owner (channel); then `durable-work.md` |
| 5 | Returning money that never funded a task | RS-20 | Open; NEAR stays off mainnet meanwhile |
| 6 | Support and contact paths | `/terms` and `/privacy` name no way to reach boreal.work (`grep -i "contact\|mailto"` finds none) | Waiting on the owner (address) |
| 7 | Fraud, collusion and sybil defences | RS-4, RS-22; one worker per PayPal account is the only defence | RS-4 waiting on the owner; RS-22 open |
| 8 | Abuse limits on the API | RS-21 | Waiting on the owner |
| 9 | Abuse reporting | A worker who claims a task that turns out harmful can only release it; there is no report action (`grep -i "report.*task\|abuse"` finds none) | Open: add "Report this task" to the worker page, which flags it for the human queue |
| 10 | Dispute and human-review time limits | RS-18 | Reported on every tick (`026b44c`); alerting waits on the channel |
| 11 | Backups, restore drills, rollback | `docs/deployments.md` says nothing of backups, point-in-time restore or how to roll back a deploy whose migration has run | Open: write the runbook, run one restore on testnet. Migrations so far only add (0022 adds a nullable column), so a code rollback is safe today |
| 12 | Tax and identity records | No earnings statement or export per worker; no record of who a payee is beyond PayPal's (`grep -i "tax\|1099"` finds only copy) | Waiting on the owner (what the law requires where you operate) |
| 13 | Account recovery | An account is a PayPal identity. Someone who loses that PayPal account loses their boreal.work account, history and any payout PayPal returns; identities are never swapped (`linkIdentity`) | Open: a support-run, audited "move this account to a new PayPal identity" action, once there is a contact path |
| 14 | Funnel analytics | The admin console has a funnel page from the database; nothing measures visits, sign-in drop-off or claim-to-submit on the worker side | Open, low |
| 15 | Localization | `lang="en"` only (`apps/web/src/app/layout.tsx`); the first workers are in the Philippines | Open: a handoff note once copy is stable |
| 16 | Offline and slow-network behaviour | Photos are shrunk in the browser; a submit that fails on mobile data loses the form (not driven this sweep) | Not verified |
| 17 | Status and incident communication | `/status` shows live health; there is no incident history and no way to post a notice | Open, low |
| 18 | Accessibility | Not assessed this sweep | Not verified |

## Added on 2026-11-12, at the owner's request

Not findings: new capabilities. Each is tested as far as it can be without the outside thing it talks to; what wasn't is under [Not verified](#not-verified).

| What | Where | Commit |
| --- | --- | --- |
| Owner controls: approve each payment, pause, revoke, limits, disconnect, spend view | `packages/desk/src/owner.ts`, `/approve/[id]`, My account → Agents | `693cf11` |
| Rail switches: close a rail to new money at once, with no deploy | `packages/desk/src/controls.ts`, `/admin/controls` | `693cf11` |
| Rulebook 2.1: R1.8 (deadline at most 14 days), R5.8 (72 hours to review your own task) | `packages/brain/src/rulebook.ts`; the spec's Rulebook tab already matched, word for word | `693cf11` |
| Admin passkey: `/admin` needs a security key on top of signing in, always on mainnet | `apps/web/src/lib/admin-passkey.ts`, `/admin-passkey`, `packages/desk/src/passkeys.ts` | `9858eea`, `3a2b333` |
| EVM add-on, prepared and off: USDC on an EVM chain over x402 | `packages/evm`, `docs/evm.md` | `0953231` |

`9858eea` also contains the other session's rewrite of `apps/web/src/app/page.tsx`, staged by mistake with a broad `git add`; nothing was lost, its content is simply in that commit.

## Done

| ID | Kind · lens · severity | What was wrong | Fix | Commit |
| --- | --- | --- | --- | --- |
| RS-6 | defect · business · S1 (NEAR and Concordium add-ons) | Refunds on a chain rail went to `agents.refund_address`, which nothing sets for agents that link themselves: every refund of a cancelled, expired, refused or failed task retried forever with "no payout address for requester" (reproduced: `drainOutbox` returned `failed: 1`) | The funding's payer is recorded (`tasks.funding_payer`, migration 0022: NEAR's signer from the chain, the x402 payer on Concordium) and refunds go back to it. Test: `readiness.test.ts`, RS-6 | `8e0d4c6` |
| RS-7 | wrong design · workers · S1 | A deadline had no upper limit, but a task's money is a PayPal authorization that lasts 29 days: a task posted for 40 days could be done and passed with nothing left to capture | A deadline is at most 14 days away (`POLICY.maxDeadlineMs`); 14 days + 72 h review + 48 h window + 72 h dispute fits in 29. Guide 2026-11-24. Test: RS-7 | `8e0d4c6` |
| RS-9 | defect · production · S1 | Any difference between a rail's escrow and its ledger stopped the whole outbox on every rail: a cent sent to the NEAR escrow account by anyone, or an agent's transfer waiting for its `fund_task`, paused PayPal payouts too. A transfer sent but not yet recorded made escrow short and paused the retry that would have recorded it, for good. A rail whose balance couldn't be read skipped the outbox silently | Judged per rail: short of the ledger beyond in-flight transfers (or unreadable) pauses that rail's payouts and refunds only; more than the ledger is reported and pauses nothing. `TickReport.pausedRails`. Tests: `monitor.test.ts`, "escrow and the outbox" (4) | `8e0d4c6` |
| RS-11 | gap · workers · S1 | A submission on a requester-reviewed task waited forever if the requester never reviewed: no timer, not in the admin queue, the worker never paid | After 72 hours (`POLICY.requesterReviewMs`) the monitor flags it for boreal.work's reviewers, in the trail; the admin queue shows it. Guide 2026-11-24. Tests: RS-11 (2) | `8e0d4c6` |
| RS-12 | gap · workers · S1 | A payout PayPal returned, blocked or denied was marked failed and nothing could send it again, though `/admin` and the anomaly agent told operators to "resend" it | `adminResendPayout`: same ledger entry back to pending, a new outbox row sent under `<key>:r<n>` (PayPal refuses a batch id it has seen), audited; PayPal's reports are matched to the attempt, and late ones about an old attempt are ignored. A minimal "Send again" on Money → Pending and failed (handoff note 3). Tests: RS-12 (3) | `8e0d4c6` |
| RS-5 | defect · business · S2 | The per-task cap and the requester's status were checked when a task was posted, not when it was funded | `holdFunding` re-checks both with the limits in force now. Tests: RS-5 (2) | `8e0d4c6` |
| RS-8 | defect · production · S2 | Calls to PayPal, the NEAR RPC, NEAR Agent Market and NEAR AI had no time limit; a call that never answered hung funding (holding the task's row lock) or the monitor (holding its lease) | 20 s (PayPal), 30 s (NEAR), 120 s (inference). Tests: `paypal/src/client.test.ts` (2) | `593eb0d` |
| RS-13 | defect · production · S2 | In the timer sweeps, one task whose move threw stopped every task after it, on every tick | Each task gets its turn; the failures are reported together afterwards. Test: RS-13 | `8e0d4c6` |
| RS-14 | defect · business · S3 | The daily cap was read without a lock: two of a requester's tasks funding at once could both fit under it | The requester's row is locked for the check. No failing test: PGlite runs one connection, so the race can't be reproduced there | `8e0d4c6` |
| RS-15 | defect · production · S3 | A signed-in worker could store 4 MB files under any task id, claimed or not, and the id went into the storage path unchecked. Submission files were served without `nosniff` | `assertCanSubmit` runs before a file is stored; files are served with `nosniff` and a sandboxing CSP. Test: RS-15 | `8e0d4c6` |
| RS-10 | defect · production · S3 | `pnpm test` failed at random: desk tests build a database each and passed vitest's 10 s hook limit under load, which also skipped every later package's tests | 60 s limits for the desk's tests | `22b1ef2` |

Not split one finding per commit: RS-5, 6, 7, 9, 11, 12, 13, 14 and 15 share `desk.ts`, `outbox.ts` and one test file, and went in as one commit.

## Not verified

- **Everything added on 2026-11-12, in a browser**: the approval page, the agent controls on My account, the rail switches, the passkey page. The other session's dev server held the ports and the local database throughout. They typecheck, lint and are covered by desk and library tests only.
- **The passkey ceremony with a real security key.** The gate, the cookies and the store are tested; registering and using a YubiKey has not been done once. Do it on testnet.boreal.work (`ADMIN_PASSKEY=required`) before the mainnet deploy.
- **The EVM rail on a real chain.** Its tests run against an in-memory chain that checks signatures, nonces and balances. `docs/evm.md` lists the five steps before real money.
- **PayPal deleting a saved account** (`DELETE /v3/vault/payment-tokens/<id>`) when an owner disconnects: boreal.work forgets the account either way; the PayPal call is best effort and untested against the sandbox.

- **The app in a browser.** Another session's `pnpm dev:local` held ports 3000 and 5433 and the one local database folder for the whole sweep, and a second one would have opened the same PGlite files. So the worker, requester and agent flows were not driven, on desktop or phone. The "Send again" button and the upload check are covered by desk tests and the typecheck only.
- **PayPal's real behaviour**: that a 20-day-old authorization still captures, that `RETURNED` arrives as assumed, that a resend under `<key>:r1` is accepted. The tests run on the in-memory PayPal.
- **The x402 `payer` on a real Concordium facilitator.** The stand-in returns it; on testnet, check one funded task has `funding_payer` set.
- **Production settings**: which add-ons are on at boreal.work, whether `PAYPAL_WEBHOOK_ID` and `CRON_SECRET` are set, and whether anything already calls the cron more than daily.
- **Market**: MCP, REST, A2A, the guide and the Hermes plugin were not compared tool by tool.
- **Accessibility, slow networks, localization**: not assessed.
