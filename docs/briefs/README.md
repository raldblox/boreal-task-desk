# Briefs for the most capable model

Ambitious, open-ended technical work for Fable 5.2 (see "Who does what" in `CLAUDE.md`). Each brief stands alone: start a session on that model and send "Read docs/briefs/<file> and do it."

**Standing:** [readiness-sweep.md](readiness-sweep.md) finds and fixes bugs, design and architecture problems, scalability, stability and confusing parts, until boreal.work is ready for workers, production, business and market. Its ledger is `docs/readiness.md`. Run it between the briefs below, or any time.

Run the numbered briefs **one at a time, in this order**. They all commit on `main` in the main checkout, and several touch the same packages.

| # | Brief | Why now | Touches |
| --- | --- | --- | --- |
| 1 | [near-vault.md](near-vault.md): an on-chain spending-limit vault for agents | NEAR HACKATHON closes Nov 14, 23:59 UTC; adds the AI Security track | a new `contracts/`, `packages/near`, link page, agents.md |
| 2 | [owner-controls.md](owner-controls.md): owners approve, limit, pause and are told about what their agents spend | Readiness RS-1 to RS-3: any client with a key moves an owner's money unasked; the Hermes catalog blocked the plugin over it | `packages/desk` (links, funding), `/me`, `/link`, MCP, REST, A2A, the guide, the plugin |
| 3 | [rails-and-money.md](rails-and-money.md): payment rails as plug-ins, money with a currency | Every new payout option (GCash, Stripe, other chains) is a hunt through 34 name checks today, and pesos can't be expressed | `packages/core` or a new `packages/rails`, desk, outbox, monitor, web, a migration |
| 4 | [operations-registry.md](operations-registry.md): one definition per agent operation for MCP, REST, A2A, OpenAPI and the guide | Each new tool is hand-copied into five places; agents depend on these never drifting | `apps/web/src/server`, `/api/v1`, agent guide |
| 5 | [reviewer-evals.md](reviewer-evals.md): measure the AI reviewer, and route between models on evidence | The reviewer is the product's promise, and nothing measures it yet; it backs the "fake photos don't pass" story | `packages/brain`, review loop |
| 6 | [durable-work.md](durable-work.md): background work that survives failures and scales | One tick does everything today; it matters once there's real traffic | `packages/monitor`, outbox, cron, `/admin`, `/status` |

**Promised on the home page:** [witness-features.md](witness-features.md) holds the six "Roadmap, not built" items (mandate document, attestations, standing orders, corroboration, worker standing, webhooks). Ask the owner which first.

**After the hackathon:** signed in-app photo capture (workers take proof photos in boreal.work's own camera page, signed on the phone) is the next big product brief. Write it once 3–5 are in.

**Between briefs:** a cheaper model clears the open notes in `docs/handoff.md`, so UI and copy keep up with the engineering.
