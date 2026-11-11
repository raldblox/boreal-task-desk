# Brief: the readiness sweep

For: the most capable model, Fable 5.2 (see "Who does what" in `CLAUDE.md`). This brief is standing: run it again whenever you like. Start a session on Fable 5.2 and send:

> Read docs/briefs/readiness-sweep.md and do it.

## The goal

boreal.work is ready for real workers, real requesters and real money, on boreal.work (mainnet) and testnet.boreal.work. Each run leaves it measurably closer to that, and the ledger in `docs/readiness.md` says exactly how close.

"Ready" means all four of these hold:

| Lens | It holds when |
| --- | --- |
| **Workers** | A first-time worker on a cheap Android phone, on mobile data, can sign in, find a task, claim it, submit proof, understand the verdict, dispute once, and get paid, with no dead ends or unexplained states. Their pay arrives when we say it will. Nothing personal leaks, on-chain or in the UI. |
| **Production** | Nothing loses or duplicates money. Every failure is retried, dead-lettered or shown to an operator: none is silent. Migrations are safe to run on deploy. Secrets stay out of code and logs. There are rate limits and abuse limits. Deploys can be rolled back. |
| **Business** | Fees, holds, refunds and payouts reconcile to the cent in the ledger and in PayPal. Every rule a worker or requester is held to is in the rulebook and cited by ID. An operator can answer "where is my money?" for any task from `/admin`. |
| **Market** | An agent builder goes from `/agents` to a funded task in minutes over MCP, REST, A2A or the Hermes plugin, and the guide, the API and the plugin never disagree. Pricing, limits and what happens on a fail are clear before anyone pays. |

## Your stance: strict, independent, from first principles

You are not here to check that what we built works as built. You are here to decide what boreal.work **should** be, and close the distance.

- **Don't trust what exists.** Treat the code, the docs, the rulebook, this brief and `CLAUDE.md`'s choices as claims to test, not facts. If a design is wrong for a worker, a requester, an operator or the business, say so and propose the better one, even when it's established, documented or someone's earlier decision. Keep `CLAUDE.md`'s safety rules (money, privacy, state changes) unless you can show a safer design. Then write the proposal under **Needs the owner**; don't break them silently.
- **Start from the people, not the code.** For each person (a worker in the Philippines on a phone, an agent builder, an agent, an owner approving spend, an operator, a disputing party), ask what they need to trust boreal.work with money and work. Then check whether we deliver it. What's missing counts as much as what's broken.
- **Rediscover what's lacking.** Look for whole capabilities a product like this needs and we don't have, not only defects in what we have. For example:
  - support and contact paths;
  - account recovery;
  - notifications when something needs a person;
  - payout schedules and receipts;
  - tax and identity records;
  - fraud, collusion and sybil defences;
  - abuse reporting;
  - terms and privacy pages;
  - status and incident communication;
  - backups and restore drills;
  - alerting;
  - analytics on the funnel;
  - onboarding;
  - localization;
  - accessibility;
  - offline and slow-network behaviour;
  - an operator's daily tools.

  Benchmark against the best marketplaces and payment products you know, and against what regulators and PayPal expect of a business moving other people's money.
- **Be strict.**
  - Nothing is "ready" without evidence: a passing test, a flow you ran, a number you measured.
  - "Works on the happy path" is not ready.
  - "Probably fine" is a finding.
  - A missing safeguard on money is S1 even if nothing has gone wrong yet.
  - Don't soften a finding because the fix is large.
- **Decide, then justify.** When there are options, pick the one that's best for us and write down why in a sentence or two. Weigh trust, money safety, workers' experience, cost and how fast it lets us grow. Don't list options without choosing.

Findings come in three kinds; mark each:

- **Defect:** it's broken.
- **Wrong design:** it works but it's the wrong approach.
- **Gap:** it's missing.

Gaps and wrong designs get fixed like defects when they fit a sweep. When one is too big, it becomes a new brief in `docs/briefs/`, ranked in that folder's README.

## How to work

1. **Read first.** Read `CLAUDE.md`, `README.md`, `docs/readiness.md` (if there is one), `docs/handoff.md` and `docs/briefs/README.md`. Run `pnpm typecheck` and `pnpm test` to know where things stand before you change anything.
2. **Sweep.** Hunt for problems in these areas, using the code, the tests and the app running under `pnpm dev:local` (drive the real flows in the browser as a worker, a requester and an agent):
   - **Bugs:** wrong results, races, missing checks, unhandled errors, timezone and money arithmetic.
   - **Design problems:** a flow a person or agent can't finish, two states that look the same, an action allowed at the wrong time.
   - **Architecture:** a rule enforced in more than one place, a package reaching past `packages/desk`, logic copied instead of shared, dead code.
   - **Scalability:** queries without indexes, N+1 queries, unbounded lists, work done in a request that belongs in the monitor, one slow job blocking others.
   - **Stability:** a timeout or retry missing on an outside call, behaviour when PayPal, NEAR or the AI is down, idempotency, crash recovery.
   - **Confusion:** names that mean two things, copy that contradicts the rulebook, docs that disagree with the code, errors that don't say what to do next.
3. **Write the ledger.** Every finding goes into `docs/readiness.md` with:
   - an ID (`RS-12`);
   - its kind: defect, wrong design or gap;
   - its lens;
   - its severity: **S1** loses money, data or trust; **S2** blocks a flow; **S3** wrong but has a workaround; **S4** polish;
   - evidence: a file and line, a failing test, or the steps to reproduce;
   - the fix;
   - its status.

   Rank the findings by severity, then by how many people they hit.
4. **Fix, highest first.** Fix every S1 and S2 you can, then S3s, in small commits:
   - each commit holds one finding, names its ID, and passes `pnpm typecheck` and `pnpm test`;
   - every bug fix starts with a test that fails without it.

   Mark each finding done with its commit hash.
5. **Always move forward.** Don't stop at a report and don't wait on a question.
   - If a fix needs the owner's decision (pricing, policy, legal, a new outside service), write the question under **Needs the owner** in the ledger with your recommendation, take the safest reversible option if one exists, and move to the next finding.
   - Stop only when every S1 and S2 is fixed or waiting on the owner.
6. **Report.** End with a short summary:
   - what you fixed;
   - what's left, by lens and severity;
   - what the owner must decide;
   - what you couldn't verify, and why.

## UI, copy and visual design: don't code it, hand it off

This model doesn't redesign UI, write copy or do visual design itself. When a fix needs a UI change:

- If the fix can't work without UI (a new state, a missing button), build the smallest working UI with the existing components, and nothing more.
- Write everything else as a note in `docs/handoff.md`: which page and component, what's wrong, and what done looks like on desktop and phone, following the brand rules. Link the note from the finding in the ledger.
- Don't restyle, re-layout, rewrite copy or draw illustrations. Opus 5.5, or a smaller capable model such as Sonnet 5.5, carries out the notes: start a session on that model and send "Read docs/handoff.md and do the open notes."

## Rules

- **Everything in `CLAUDE.md` holds.** In particular:
  - only `packages/core` changes task state, and all writes go through `packages/desk`;
  - money is integer minor units, ledgered before it moves;
  - side effects go through the outbox;
  - with every add-on off, PayPal alone runs the app.
- **Never use real money or production data.**
  - Work against `pnpm dev:local` and testnet.boreal.work only.
  - Never run `CONCORDIUM_MODE=dev` against `.env.local`.
  - Never sign or send on mainnet.
  - Never edit a database by hand to change a task or verdict.
- **Breaking changes.** A change that breaks the public API, MCP tools, the agent guide or the Hermes plugin needs a version bump, the same change in all of them, and an entry in the ledger. The plugin is a submodule, `integrations/hermes-boreal`: change it in its own repo, then move the pin.
- **Commits.** Commit on `main` in the main checkout. Don't push unless the owner asks.
- **Big redesigns.** Anything bigger than a sweep fix (a new subsystem, a payments redesign) becomes a new brief in `docs/briefs/`, not a half-done change.

## Done looks like

- `docs/readiness.md` is current:
  - every finding has evidence and a status;
  - no S1 or S2 is open without an owner question attached;
  - each lens has a one-line verdict, backed by evidence: ready, ready with caveats, or not ready;
  - a **Gaps** section lists every missing capability you found, ranked, each fixed, briefed or waiting on the owner.
- Every fix has a test, and `pnpm typecheck` and `pnpm test` pass on the last commit.
- UI work is waiting in `docs/handoff.md` as notes, not done half-way in code.
- The summary from step 6.
