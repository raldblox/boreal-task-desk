# Briefs for the most capable model

Ambitious, open-ended technical work for Fable 5.2 (see "Who does what" in `CLAUDE.md`). Each brief stands alone: start a session on that model and send "Read docs/briefs/<file> and do it."

Run them **one at a time, in this order**. They all commit on `main` in the main checkout, and several touch the same packages.

| # | Brief | Why now | Touches |
| --- | --- | --- | --- |
| 1 | [near-vault.md](near-vault.md): an on-chain spending-limit vault for agents | NEAR HACKATHON closes Nov 14, 23:59 UTC; adds the AI Security track | a new `contracts/`, `packages/near`, link page, agents.md |
| 2 | [rails-and-money.md](rails-and-money.md): payment rails as plug-ins, money with a currency | Every new payout option (GCash, Stripe, other chains) is a hunt through 34 name checks today, and pesos can't be expressed | `packages/core` or a new `packages/rails`, desk, outbox, monitor, web, a migration |
| 3 | [operations-registry.md](operations-registry.md): one definition per agent operation for MCP, REST, A2A, OpenAPI and the guide | Each new tool is hand-copied into five places; agents depend on these never drifting | `apps/web/src/server`, `/api/v1`, agent guide |
| 4 | [reviewer-evals.md](reviewer-evals.md): measure the AI reviewer, and route between models on evidence | The reviewer is the product's promise, and nothing measures it yet; it backs the "fake photos don't pass" story | `packages/brain`, review loop |
| 5 | [durable-work.md](durable-work.md): background work that survives failures and scales | One tick does everything today; it matters once there's real traffic | `packages/monitor`, outbox, cron, `/admin`, `/status` |

**After the hackathon:** signed in-app photo capture (workers take proof photos in boreal.work's own camera page, signed on the phone) is the next big product brief. Write it once 2–4 are in.

**Between briefs:** a cheaper model clears the open notes in `docs/handoff.md`, so UI and copy keep up with the engineering.
