# Handoff: UI, copy and design notes

Notes from the model doing deep technical work, for a cheaper model to carry out (see "Who does what" in `CLAUDE.md`). Each note is small enough to do in one sitting and checkable in the browser.

**How to write a note:** where (file and component, or page and URL), what's wrong or missing, what done looks like, and anything that must not change (behaviour, rules from `CLAUDE.md`). Keep the brand rules: always write "boreal.work"; illustrations are hand-built SVG, never generated images.

**Who carries them out:** Opus 5.5, or a smaller capable model such as Sonnet 5.5. Start a session on that model and send "Read docs/handoff.md and do the open notes." Fable 5.2 writes notes here and doesn't carry them out.

**How to finish one:** do it, check it in the browser (desktop and phone), then move it to Done with the commit hash.

## Open

### 5. Say the two new limits where people read the rules (blocked on the owner)

- **Blocked on:** "Rulebook 2.1" under Needs the owner in `docs/readiness.md`. Do this only once the rulebook has the two rules and their IDs.
- **Where:** `/rules`, `/terms`, `/faq`, and the deadline help text in `apps/web/src/app/post/post-form.tsx`.
- **What's missing:** a deadline can be at most 14 days away (RS-7), and a requester who reviews their own task has 72 hours before boreal.work's reviewers take over (RS-11). Both are enforced and in the agent guide; none of the pages people read mention them.
- **Done looks like:** each page states the limit once, citing the rule ID, using `POLICY.maxDeadlineMs` and `POLICY.requesterReviewMs` rather than typed numbers.

### 6. A way to reach boreal.work (blocked on the owner)

- **Blocked on:** the contact address (Needs the owner, item 11).
- **Where:** `/terms`, `/privacy`, `/faq`, the site footer, and the agent guide's last section.
- **Done looks like:** one line with the address on each, and on `/privacy` what to write for a privacy request.

## Done

- 1. Tell the worker who is reviewing, and by when (RS-11): 8dd3302
- 2. Tell the poster their review time (RS-11): 8dd3302
- 3. Money → Pending and failed: the "Send again" action (RS-12): 8dd3302
- 4. Overview: escrow against the ledger now has three states (RS-9): 8dd3302
