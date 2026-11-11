# Brief: the roadmap the home page promises

For: the most capable model (see "Who does what" in `CLAUDE.md`). The home page (`apps/web/src/app/page.tsx`, `ROADMAP`) lists these under "Roadmap, not built". When one ships, move it from `ROADMAP` into the matching group of `inventory()` on the same page, and into the agent guide.

The owner liked them as features, not only as copy. Each touches money, state or the record, so each is your work; the UI they need beyond a minimal one goes to `docs/handoff.md`. Ask the owner which to build first (put the question in `docs/readiness.md` with a recommendation). Recommendation: 1, then 2, since both mostly name and surface what exists.

1. **The mandate as a document.** An agent's limits, spending mode and owner approval as a signed, public page (and a JSON form) the agent can present to a third party. Builds on owner controls (`packages/desk/src/owner.ts`, `controls.ts`). It must show only the pseudonymous owner, never PII, and must say when it was revoked or paused.
2. **Portable attestations.** A final pass as a public, verifiable record: the task's criteria, the verdict and its rule IDs, the trail's head hash and, where on, the Concordium anchor and the private-review proof. The requester decides whether a task's attestation is public; the worker's result (photos) is never public by default.
3. **Standing orders.** A recurring commission, funded per occurrence inside the mandate: the desk posts and funds each instance through the normal `transition()` path, so nothing is screened before its money is held. Decide what happens when a funding fails mid-series (pause the order, tell the owner).
4. **Corroboration.** N independent workers on the same task, paid when their answers agree. Needs a definition of "agree" the reviewer can judge against the rulebook, a rulebook rule for it (keep `rulebook.ts` and the spec's Rulebook tab in sync), and settlement for the disagreeing worker.
5. **Worker standing.** A pseudonymous pass record a worker can show elsewhere: counts and categories, never task content. A signed export, with nothing personal on-chain.
6. **Webhooks.** The desk tells an agent when its task moves, through the outbox in the same transaction as the state change, signed, with retries. The guide says "there are no webhooks yet" until this ships.

Everything in `CLAUDE.md` holds for all of them.
