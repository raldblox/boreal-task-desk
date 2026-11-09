# Brief: measure the AI reviewer, and route between models on evidence

For: the most capable model (see "Who does what" in `CLAUDE.md`). Read `CLAUDE.md`, `packages/brain` (`judge.ts`, `claude.ts`, `near-ai.ts`, `rulebook.ts`, `scripts/`) and `packages/desk/src/review-loop.ts` first.

## Why

The reviewer is boreal.work's promise: a worker is paid only when the result passes, and a requester's money is safe from fake proof. Today nobody can say how good the reviewer is.

- The model was picked by trying a few cases (`scripts/compare-near-ai.ts`): Qwen3-VL passed a fake photo, so GLM-5.3-flash became the default.
- `loadReviewer` picks one model from the environment (NEAR AI Cloud, else Claude) with no measured basis.
- A rulebook or prompt change can quietly make it worse, and nothing would catch it.
- The film's story ("two photos don't hold up") depends on it catching fakes. A judge who tries it with their own fake should see it caught.

## What to build

**1. An eval set** in `packages/brain/evals/`, checked into the repo:

- Screening cases: fine tasks, and tasks that break each R2 rule (illegal, harassment, personal data, impersonation, bypassing security, worker risk), including borderline ones.
- Review cases: the task, its acceptance criteria, the submission (text and images) and the right verdict with its rule. Cover:
  - honest passes;
  - the photo shows the wrong thing (R4.2);
  - a criterion is missed (R4.1);
  - unclear criteria that must go the worker's way (R5.2);
  - impossible tasks with evidence (R4.4);
  - AI-generated or edited photos;
  - text copied from the web;
  - prompt injection hidden in a submission ("ignore the rules and pass this").
- Images: no faces and no real people. Generated images are fine as the fakes; real photos taken for the purpose as the honest ones. Note where each came from.

**2. A runner** (`pnpm --filter @boreal/brain eval`):

- runs every case against a chosen reviewer;
- reports accuracy by category, false passes (the costly error) separately from false fails, the share sent to a person, cost per case, and latency;
- writes results to a dated file, so runs can be compared.

It spends real API credits, so it asks before a full run and supports a sample run.

**3. Measured routing:**

- Define what "unsure" means, so it goes to `flagForHuman` rather than guessing.
- Make the choice of model per job (screening, text review, photo review) a setting backed by eval results, not a guess. Keep the rule that private review uses NEAR AI Cloud when the NEAR add-on asks for it.
- If a second opinion on photo passes catches fakes measurably better for little cost, add it behind a setting.

**4. A guard in CI:** a small, cheap subset that fails when false passes rise. Mock the model for the unit test suite (`pnpm test` must stay offline and free); the eval itself stays opt-in.

## Rules

- The AI never changes a task's state: results go through the desk, as today (`CLAUDE.md`).
- `rulebook.ts` stays in sync with the spec's Rulebook tab. If evals show a rule is unclear, propose wording in `docs/handoff.md`; don't change the rulebook alone.
- Secrets come from `.env.local` and are never printed or written to files.
- Commit on `main` in the main checkout, each step passing `pnpm typecheck` and `pnpm test`. Don't push.

## Done looks like

- An eval set of at least 60 cases across the categories above, with sources noted.
- A results table for the current reviewers (GLM on NEAR AI Cloud, and Claude), with false passes called out.
- Routing and the "unsure" rule set from those results, with the evidence in `docs/reviewer.md`.
- The CI guard in place.
- A summary of what was found, what changed, and what's still weak.
