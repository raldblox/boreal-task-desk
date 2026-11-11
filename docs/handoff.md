# Handoff: UI, copy and design notes

Notes from the model doing deep technical work, for a cheaper model to carry out (see "Who does what" in `CLAUDE.md`). Each note is small enough to do in one sitting and checkable in the browser.

**How to write a note:** where (file and component, or page and URL), what's wrong or missing, what done looks like, and anything that must not change (behaviour, rules from `CLAUDE.md`). Keep the brand rules: always write "boreal.work"; illustrations are hand-built SVG, never generated images.

**Who carries them out:** Opus 5.5, or a smaller capable model such as Sonnet 5.5. Start a session on that model and send "Read docs/handoff.md and do the open notes." Fable 5.2 writes notes here and doesn't carry them out.

**How to finish one:** do it, check it in the browser (desktop and phone), then move it to Done with the commit hash.

## Open

### 1. Tell the worker who is reviewing, and by when (RS-11)

- **Where:** `apps/web/src/app/tasks/[id]/page.tsx`, the `submitted` state.
- **What's wrong:** on a task its requester reviews (`task.reviewMode === "requester"`), the page doesn't say the requester has 72 hours (`POLICY.requesterReviewMs`, counted from the submission), or that after that boreal.work's reviewers decide. Once the monitor hands it over, the task has `needsHuman: true` and still reads as waiting on the requester.
- **Done looks like:** while it waits on the requester, one line saying who reviews and the latest time they have ("The requester reviews this by …"), in the worker's local time. Once `needsHuman` is true: "The requester didn't review in time, so boreal.work's reviewers are judging it." No new buttons. Readable on a 360 px phone without scrolling past the result.
- **Don't change:** the states themselves, or when the worker can dispute.

### 2. Tell the poster their review time (RS-11)

- **Where:** `apps/web/src/app/me/posted/[id]/page.tsx`, the review form for a `submitted` task with `reviewMode === "requester"`.
- **What's wrong:** nothing says the review has a time limit.
- **Done looks like:** above the pass/fail form, the time left ("Review by … After that boreal.work's reviewers decide."). When `needsHuman` is true, the form is replaced by a line saying boreal.work's reviewers have it (the desk still accepts the poster's verdict until a reviewer's lands, so keeping the form is also fine: pick one and say which in the commit).

### 3. Money → Pending and failed: the "Send again" action (RS-12)

- **Where:** `apps/web/src/app/admin/money/page.tsx`, `EntryTable` with `resend`, and the section's description.
- **What's wrong:** the button is the bare minimum: an unlabelled last column, and the description still says only "resending it is an operator's call". An operator can't see why PayPal sent the payout back (the reason is on the `reconcile` outbox row's `detail`, shown under "Money on its way" only while that row is open) or how many times it has been sent.
- **Done looks like:** the failed row shows PayPal's reason and the attempt count; the description says what "Send again" does (a new PayPal payout for the same ledger entry, to the worker's current PayPal email) and what to check first (that the worker has logged in with PayPal again if the email was the problem). Works at laptop width; the table may scroll sideways on a phone.
- **Don't change:** `resendPayout` or the desk's checks.

### 4. Overview: escrow against the ledger now has three states (RS-9)

- **Where:** `apps/web/src/app/admin/page.tsx`, the escrow table (around line 40), and `/status` if it repeats it.
- **What's wrong:** any gap is shown in red as one thing. There are now three: **short** (`short > 0`: that rail's payouts and refunds are paused), **in flight** (`gap < 0` and `short === 0`: a transfer sent and not yet recorded, settles by itself) and **unmatched** (`gap > 0`: money no task accounts for, nothing paused). `adminReconcile()` returns `gap`, `inFlight` and `short` per rail.
- **Done looks like:** each state has its own label and tone (red only for short), and a paused rail says so in words. The page's own reconcile call keeps `short` and `inFlight` (it currently keeps only `expected`, `actual`, `gap`).

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

_None yet._
