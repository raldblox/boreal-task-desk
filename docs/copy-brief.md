# Copy brief: every word on boreal.work says what the code does

For: the copy session (Opus 5.5 or Sonnet 5.5; see "Who does what" in `CLAUDE.md`). Written by the technical session on 2026-11-12, after reading the terms, privacy policy, FAQ and agent guide against `packages/core`, `packages/desk` and the routes.

Start a session and send: **"Read docs/copy-brief.md and do it."**

## What this is

The copy is in good shape and mostly true. This brief is for the rest:

1. **One word per thing.** The same thing is called two or three names across pages ([Words](#words)).
2. **Facts the copy must obey.** What the product does today, with where it is enforced ([Facts](#facts)). Copy that says otherwise is wrong, however good it reads.
3. **What is wrong or missing, page by page** ([Pages](#pages)), with the sentence to fix or the gap to fill.
4. **What only the owner can supply** for the terms and privacy policy ([Owner](#needs-the-owner)). Don't invent these.

You write the words. The voice is `brand.md` ("Voice and copy"), strictly: plain, direct, short sentences, sentence case, no hype, no exclamation marks, no crypto jargon for workers, phones first. Say what happens, who decides and when money moves. Where this brief proposes a sentence, it is there for its facts; improve the wording, keep the facts.

**Don't change behaviour.** If a fact here looks wrong for a person, don't soften the copy around it: add a line under "Found while writing" at the end and carry on.

## How to work

- Read `brand.md` and `docs/handoff.md` first. Notes 7 to 12 there are the UI for some of the same pages; do copy and UI for a page together when you can.
- Numbers come from code, never typed: `POLICY`, `FEE_POLICY` (`@boreal/core`), `SERVICE_FEE*` (`apps/web/src/content/fees.ts`), `CONTACT` (`content/contact.ts`), `RuleRef` for rule IDs. The terms and FAQ already do this; keep it.
- Integration copy (Concordium, NEAR, EVM) shows only where that integration is on (`getAddons()`, `paymentRails()`, `GUIDE_FACTS`). PayPal alone must read as a whole product.
- The agent guide (`apps/web/src/content/agent-guide.ts`) is a contract agents rely on. Change its wording, never its meaning; bump `GUIDE_VERSION` when a rule or a tool's behaviour is described differently; `agent-guide.test.ts` must pass.
- `pnpm typecheck` and `pnpm test` before each commit. Check each page in the browser on desktop and at 360 px, light and dark.
- Other sessions commit on `main` at the same time. Stage files by name (`git add path/a path/b`), never `git add -A` or a folder. Run one `pnpm dev:local` at a time across sessions.
- When a section is done, tick it in [Progress](#progress) with the commit.

## Words

One word per thing, chosen for the reader. "API" means the agent guide, MCP, REST and the plugin; "people" means every page a person reads.

| The thing | Say (people) | Say (API) | Never |
| --- | --- | --- | --- |
| The product | boreal.work | boreal.work | Boreal, boreal, Boreal Work, "the platform" |
| Who does the work | worker; "you" on worker pages. "Freelancers" only as an audience label (the home page's "Who it is for") | worker | tasker, witness, human (as a noun for a person) |
| Who posted a task (an agent or a person) | the requester; "you" on poster pages | requester | client, buyer (except "NEAR Agent Market buyer"), customer, poster |
| The person who approved an agent and pays for it | owner; "you" on owner pages | owner | user, admin, principal |
| boreal.work's own staff | boreal.work's reviewers (reviewing), boreal.work (everything else) | the same | admin, moderator, "our team" |
| What the worker hands in | result | submission (field and tool names only) | deliverable, proof, output |
| A photo or file in a result | photo, file; "evidence" in the rulebook | file | proof |
| "Proof" | only a cryptographic proof: Concordium ID, the private-review proof | the same | proof for a worker's photo |
| The task's pass conditions | checks | acceptance criteria ("the checks" on first mention) | requirements, conditions |
| Pass or fail | verdict; "pass", "fail" | verdict | decision, outcome, result |
| A verdict that can no longer change | final | final (`final_pass`, `final_fail`) | settled, closed, complete |
| The 48 hours after a verdict | "48 hours to dispute"; "objection window" only in the terms, defined once | objection window | dispute window, cooling-off |
| Objecting to a verdict | dispute; "the panel" decides | dispute | appeal (see fact 14), complaint, challenge |
| What the worker earns | pay | budget (the field) | reward, bounty, earnings (except totals: "your earnings") |
| The one fee | the service fee (`SERVICE_FEE`) | service fee; its two parts are "platform part" and "review part" | platform fee or review fee as if they were two fees; commission |
| Money not yet taken | held; "held by PayPal: authorized, not charged" | held, hold | locked, frozen, charged, in a smart contract |
| Where held money sits | escrow | escrow | vault (that word is PayPal's saved account), wallet |
| Money going back | released (a PayPal hold), returned (USDC) | released, refund | reversed, chargeback |
| Putting a task up | post ("Post a task") | `post_task` | commission, hire, order, list |
| What an owner lets an agent spend | limits (per task, per day) and the mode below | limits, `spendingMode` | mandate, allowance, budget (that is the pay) |
| Reserving a task | claim ("Claim this task") | claim | accept, book, take (fine in headings: "Taking tasks") |
| An owner saying yes to an agent | approve your agent | approve the link | authorize, connect (that is for PayPal and wallets) |
| An owner saying yes to one payment | approve this payment | `approvalRequired`, `approveUrl` | confirm, authorize |
| The mode where that is needed | "Ask me each time" / "Pay on its own" | `spendingMode`: `ask` / `auto` | manual, automatic, supervised |
| An owner stopping their agent | pause, resume | `paused` | freeze, suspend, disable |
| boreal.work stopping an agent | freeze (operators only) | frozen | pause, ban |
| An owner's saved PayPal account | "your saved PayPal account" | saved payment method | vault, billing agreement, card on file |
| NEAR, Concordium, EVM | integration | add-on only in `README.md` and `/admin` | plugin (that is Hermes's), module |
| The site with no real money | testnet; "Testnet: never real money." | testnet | staging, demo, sandbox (PayPal's own word, only for PayPal) |
| Verified with Concordium ID | "Verified by Concordium" badge | the same | KYC'd, ZK-verified |

Rules of use:

- **Register.** A headline states the consequence for the reader ("Paid for being somewhere."), the lines under it state the mechanism in flat sentences. Where boreal.work has a limit or a dependency, say it as a heading, not a footnote ("Today you depend on PayPal and on boreal.work."). Numbers come from code and are shown, not described ("total = pay + 15% + $0.50"). Headlines may use plain verbs (see, check, be somewhere); they never coin a new noun for a thing in the table.

- **"We" or "boreal.work".** Product pages use "boreal.work" as the subject. The terms and the privacy policy may say "we", and then say it throughout.
- **Three approvals now exist** (your agent, a payment, and Hermes's own prompt in the plugin). Never write "approve" without its object.

## Facts

Each line is what the product does today and where it is enforced. "Not live" means it is in `main` but not deployed: write the copy, and publish it with the deploy, not before.

### Tasks and time

1. A task is funded before anyone checks it; nothing is screened until its money is held. (`packages/core/src/task.ts`)
2. A deadline is at most 14 days from posting (R1.8). (`POLICY.maxDeadlineMs`)
3. A requester can cancel until a worker claims the task: before funding, while it is being checked, or while it is open. Not after a claim. (`TRANSITIONS.cancel`)
4. A claim lasts up to 4 hours, or until the deadline if that is sooner, and a worker holds one claim at a time. Nothing raises that number yet, so "a new worker" is wrong: it is every worker. (`claimTask`, `workers.max_active_claims`)
5. Nobody can claim a task they or their own agent posted.
6. On every network a worker needs to be verified to claim: a PayPal account PayPal has verified, Concordium ID, or a Concordium account. One account per person: a second document of the same person, or a payout account already connected elsewhere, is refused. (`claimTask`, `samePerson`, `setPayoutAddress`; f0f3bf4, 24e284c)
7. A result gets one verdict. There is no resubmitting.

### Review and disputes

8. boreal.work's reviewer is an AI by default. Anything it is unsure of goes to a person at boreal.work. A person's verdict currently appears in the task's trail as the same reviewer (readiness RS-25): don't write copy that promises the trail says whether a person or the AI decided.
9. Every fail cites a rule and the check that was missed (R5.3). An unclear check is read in the worker's favour (R5.2).
10. A requester who reviews their own task has 72 hours from the result (R5.8). After that boreal.work's reviewers decide. (`POLICY.requesterReviewMs`, `escalateSilentReviews`)
11. A requester's own pass is final at once and pays the worker. A requester can accept boreal.work's pass early, and can never overrule a pass.
12. **One dispute per task, not one per side.** Either the worker or the requester may dispute, within 48 hours of the verdict; once one has, the other can't. (`disputeUsed`)
13. A panel of two decides a dispute: boreal.work's AI reviewer votes first, then a person decides with that vote in front of them, and the person's verdict stands when they disagree (R6.3, rulebook 2.2). There is no time limit on the panel in code; 72 hours is the target, and overdue disputes are reported to operators. Don't promise "within 72 hours".
14. The panel's decision is final, in code and in R6.3 (rulebook 2.2). There is no appeal.

### Money

15. One service fee on top of the worker's pay: `SERVICE_FEE` (15% + $0.50), or `SERVICE_FEE_SELF_REVIEW` (10% + $0.50) when the requester reviews. The worker receives the pay in full.
16. With PayPal the money is held (authorized), not charged, until the task is final.
17. **When the worker is paid.** At once when the requester passes or accepts. Otherwise when the 48 hours end, which the site acts on at its next activity or its daily run: on a quiet day up to a day later (readiness RS-16). After that, PayPal's own delivery time applies. "48 hours" alone is not true.
18. On a fail under boreal.work's review, only the review part of the fee (5% of the pay) is taken and the rest is released. On a fail the requester gave, nothing is taken.
19. A refused, cancelled, expired or unclaimed task releases everything.
20. A PayPal hold lasts 29 days; the 14-day deadline exists so a task can't outlive it.
21. If PayPal sends a payout back (wrong or unverified account), boreal.work can send it again once the worker has fixed their PayPal account. The worker has to tell boreal.work; nothing notifies anyone (fact 30).
22. Limits: until verified, `POLICY.unverifiedTaskBudget` a task and `unverifiedDailySpend` a day; verified, up to `maxTaskBudget` a task and `maxAgentDailySpend` a day. For an agent, never more than its owner set. The limits in force when a task is funded are the ones that count, not those at posting.
23. USDC (NEAR, and EVM when on): refunds go back to the account that paid.

### Owners and agents (not live until the next deploy)

24. A newly approved agent is on "Ask me each time": paying from the owner's saved PayPal account holds nothing until the owner approves that payment at `/approve/<id>`. A request waits 24 hours, then expires; a declined task can't be asked for again. Agents approved before this stay on "Pay on its own" until their owner changes it.
25. An owner can pause and resume an agent, change its limits and mode, disconnect the saved PayPal account, and revoke its key, on My account → Agents. Paused, an agent can read and cancel, but not post, pay, accept or review.
26. Saving a PayPal account means boreal.work can place later holds on it without PayPal asking again, within the agent's limits and mode. This is the single most important thing an owner agrees to, and the terms don't say it.
27. "Ask me each time" covers the saved PayPal account only. Money an owner has already sent to an agent's own wallet (NEAR, EVM) is the agent's to spend within its limits.
28. Accepting a pass and a requester's own verdict are never held for the owner: they release pay at once (the owner's decision, 2026-11-12).

### Accounts and privacy

29. An account is a PayPal identity (and a Concordium ID where that is on). Two accounts that both have history are never merged. An empty duplicate, such as an accidental second sign-in, is folded into the one in use. "Accounts are never merged" is not quite true. (`linkIdentity`)
30. **Nobody is notified of anything.** No email, no push. A worker learns of a verdict, a fail they have 48 hours to dispute, or a payout by opening the task; an owner learns of a payment request from their agent or from My account. Never write "we'll let you know", "you'll get an email" or "you'll be notified".
31. Contact is a direct message to `CONTACT.handle` on X. There is no email address or support chat.
32. boreal.work keeps: the pseudonym, the PayPal email (to pay the worker), whether PayPal verified the account, proven attributes, any payout account connected (a NEAR, Concordium or EVM address), the account that funded a task on a USDC rail (for refunds), results, verdicts, disputes, and for owners their agents, limits, the saved-account token and a log of the changes they make to their agents.
33. A task's trail and the money ledger are append-only and can't be edited or removed. "Delete what we keep about you" therefore has limits nobody has decided yet (below).
34. There is no way to close an account in the product, for a person or for boreal.work. boreal.work can refuse tasks and freeze agents. "Close accounts" in the terms describes something that doesn't exist yet.
35. Only public keys are stored for admin passkeys; that is operators only and needs no public copy.

## Pages

Ranked by how much a wrong word costs.

### 1. Terms (`apps/web/src/app/terms/page.tsx`)

- **Accounts.** "Accounts are never merged" → fact 29.
- **Owners.** One line today. It needs its own section: what approving an agent means, fact 26 in plain words, the two modes (24), what the owner can do at any time (25), what "Ask me each time" doesn't cover (27, only where a USDC rail is on), and that the owner answers for what the agent posts.
- **Disputes.** "Either side can dispute a verdict once per task" reads as once each → fact 12. Proposed: "A verdict can be disputed once, by the worker or the requester, within 48 hours. Once one side has, the other can't."
- **When the worker is paid.** "once the 48-hour objection window closes" → fact 17. Define "objection window" here, once.
- **Cancelling.** Missing → fact 3.
- **One claim at a time.** Missing → fact 4.
- **A returned payout.** Missing → fact 21: what the worker does and where the money is meanwhile (still held for them).
- **"close accounts".** → fact 34. Say what boreal.work can do today.
- **Changes to the terms.** It says "we may change these terms; the date shows when". The rulebook promises changes are published 14 days before they apply. Make the two agree (owner question 5).
- **Missing clauses** that need the owner: see below. Leave a clearly marked gap in the brief's progress list, not placeholder text on the page.

### 2. Privacy (`apps/web/src/app/privacy/page.tsx`)

- **What we keep about workers** misses the payout account they connect → fact 32.
- **What we keep about agent owners** misses the log of their own changes and, on a USDC rail, the paying account → fact 32.
- **"It can't be turned back into who you are"** is true of the pseudonym alone. The same record holds the PayPal email, which does identify the person. Say both in one breath, as the brand asks ("say what we keep and what we never see").
- **Your requests.** "See, correct or delete" → fact 33. Once the owner decides, say what can be deleted (the account's details, the email, results' files) and what stays and why (the record of money, kept as hashes and amounts).
- **How long things are kept.** Nothing says. Owner question 3.
- **Cookies** is right. Don't add the admin cookies; they aren't public.

### 3. FAQ (`apps/web/src/app/faq/page.tsx`)

- "A new worker holds one task at a time" → fact 4.
- "When am I paid?" → fact 17, in two short lines: the rule, then the honest "sometimes up to a day more".
- "What if my result fails?" add the 48 hours and that the dispute is the task's one (fact 12).
- "When am I charged?" add: a fail you gave yourself takes nothing (fact 18).
- "Can my AI agent post tasks?" says "It asks you to approve it once ... and pays the same way you do." Not true after the deploy → facts 24 to 26. Two questions: "Does my agent need my OK to pay?" and "How do I stop or limit my agent?".
- "Who checks the work?" → fact 8.
- Add "Will I be told when something happens?" with the honest answer (fact 30) and where to look. It is better said than discovered.
- Add "PayPal sent my pay back. What now?" → fact 21.
- Add "Can I cancel a task?" → fact 3.

### 4. Agent setup (`apps/web/src/app/agents/page.tsx`) and the link form (`app/link/approve-form.tsx`)

- Wherever it says an agent, once approved, funds tasks "without asking each time": that is now a choice, and not the default (fact 24). The empty state on My account → Agents says the same thing (`apps/web/src/app/me/page.tsx`, `MyAgents`).
- The two radio labels on the approval form are placeholders. They carry fact 26: write them so an owner on a phone knows what they are agreeing to.
- The Hermes plugin block: the plugin asks through Hermes's own prompt before every funding, acceptance and verdict, and its limits sit on top of boreal.work's. With Hermes's approvals switched off (`--yolo`), Hermes doesn't ask; "Ask me each time" on boreal.work still does. Say this in one or two lines, no more.

### 5. The payment approval page (`apps/web/src/app/approve/[id]/page.tsx`) and My account → Agents

Functional placeholders throughout (handoff notes 7 and 8). Every state needs its sentence: waiting, approved (with which tasks couldn't be paid and why), declined, expired, paused, no key, nothing saved. The reader is an owner on a phone who got a link from their agent.

### 6. The task page (`apps/web/src/app/tasks/[id]/page.tsx`) and the posted-task page (`app/me/posted/[id]/page.tsx`)

- The passed state promises pay in 48 hours → fact 17 (handoff note 12).
- A failed state should carry the deadline to dispute as a time, not a duration, and say it is the task's one dispute.
- Check each of the 13 statuses says what happens next and who it is waiting on (`TASK_STATUSES` in `packages/core/src/task.ts`; `posterStatus` in `apps/web/src/lib/format.ts`). `disputed` must not promise a time (fact 13).

### 7. The home page (`apps/web/src/app/page.tsx`) and the agent guide

- The home page was rewritten on 2026-11-12. Read it once against the facts, especially any claim about how fast pay arrives, who approves spending, and what a fail costs.
- The agent guide: read steps 3, 6 and 7 against facts 17, 24 and 28. Its account of `spendingMode` and `paused` is technically right and reads like a changelog; make it read like the rest of the guide.
- The name: user-facing strings only. `boreal` inside commands (`claude mcp add ... boreal`), package names and code comments is fine.

### 8. Refusals people read

`DeskError` messages reach workers, posters and agents word for word. They are lower-case clauses by design (pages turn them into sentences). Read the ones a person can hit and fix any that break the word list: `packages/desk/src/desk.ts` (claim, fund, submit, dispute), `owner.ts`, `links.ts`. Change the words only; tests match some of them (`pnpm test` will say).

## Needs the owner

Legal facts the copy session must not make up. Each has a recommendation; write the surrounding copy now and leave the item open in Progress.

**The owner's answers (2026-11-13).** 1: no company yet; boreal.work is an open-source project run by its maintainer (written in the terms and privacy policy). 2: 18 or older, and a person (written in the terms). For 3 to 7 the owner asked for suggestions; the copy session's are below each item as **Suggested**, waiting for the owner's yes. Item 3 needs code before its words can go live.

1. **Who boreal.work is**: the legal name and country behind it, for the terms' first paragraph and the privacy policy's "who is responsible for your data". Recommendation: state it plainly even if it is one person.
2. **Minimum age.** Recommendation: 18, since PayPal requires it and Concordium ID proves "18 or older".
3. **How long results and accounts are kept**, and what "delete" covers (fact 33). Recommendation: files of a result for 90 days after the task is final, then deleted; the account's email until the account is closed; the money record kept as amounts and hashes.
   **Suggested:** a result's photos and files 90 days after the task is final, then deleted (long enough for any dispute); the PayPal email and payout accounts while the account is open, deleted within 30 days of a request to close it; the trail and ledger kept for good, as amounts, hashes and pseudonyms; the hashed IP used for rate limits, 30 days. Nothing deletes files today: this needs a scheduled job (Fable) before the privacy policy may promise it.
4. **An appeal after the panel** (fact 14). Recommendation: keep "the panel's decision is final", and change R6.3 in the rulebook to match, as rulebook 2.2.
   **Suggested:** the panel is final (the terms already say so); R6.3 changes to match in rulebook 2.2, in the spec's Rulebook tab and `rulebook.ts` together.
5. **Notice before the terms change.** Recommendation: 14 days, the same as the rulebook, shown on the page.
   **Suggested:** 14 days' notice on the page for any change that takes something away from people (fees, limits, rights); fixes and new features apply at once. The date stays at the top.
6. **Liability, governing law and taxes.** Recommendation: a short, plain clause each (workers are responsible for their own taxes; boreal.work's liability is limited to the fees it kept on the task in question; the law of the country in item 1), written by or checked with a lawyer before the live site takes real volume.
   **Suggested:** provided as is; boreal.work's liability on a task is at most the service fee it kept on that task; workers are independent and handle their own taxes, and boreal.work is not their employer; the law of the maintainer's country (the site shows times in PHT, so the Philippines, if that's right). Have a lawyer read it before real volume.
7. **Closing an account** (fact 34). Recommendation: say today that an account can be closed on request through the contact address, and build the action later.
   **Suggested:** on request by direct message on X, done within 30 days: sign-in removed, email and payout accounts deleted, open tasks cancelled or finished first; the trail and ledger stay, as in item 3. A button on My account later.

## Progress

Tick with the commit hash. Add what you found under the last heading.

- [x] Words: the list reconciled with the house style (d6b3429), and every page in this brief follows it. Swept on 2026-11-13: `/post`, `/tasks`, `/rules`, `/status` and the status labels. `/signin` and My account swept with the ZKPassport change (2026-11-13): each way to verify says what it costs and needs, and a finished payment reads "paid"
- [x] 1. Terms: a27f8d9 (owner items 1, 5, 6 and 7 still open: no legal name, liability, governing law, notice period or account closing written)
- [x] 2. Privacy: a27f8d9 (owner item 3, how long things are kept, still open)
- [x] 3. FAQ: 0aad9b2
- [x] 4. Agent setup and the link form: 0aad9b2
- [x] 5. Payment approval page and My account → Agents (with handoff notes 7 and 8): 238253f
- [x] 6. Task page and posted-task page (with handoff note 12): 311b080
- [x] 7. Home page and agent guide read against the facts: d6b3429 (home), f2c565f (guide, `GUIDE_VERSION` 2026-11-26)
- [x] 8. Refusals: db22a3b
- [ ] Owner items 1 to 7 answered and written in: 1 and 2 written in; 3 to 7 suggested, waiting for the owner

### Found while writing

- **An owner can read an agent's refusal.** If an owner approves a payment for a paused agent, each task's reason on `/approve/<id>` is the agent-facing desk message ("your owner has paused you; ..."). The page now warns before approving, but the reason itself should be owner-facing. Needs `decideFundingApproval` to say it in the owner's words, or check paused before funding.
- **The 29-day PayPal hold is typed, not from code.** The terms say it (fact 20), and it's PayPal's rule, but nothing in `POLICY` names it. A `PAYPAL_HOLD_DAYS` beside `maxDeadlineMs` would keep the two together.
- **"a fail you give takes nothing"** (fact 18) is written on the requester's own pages. Confirm it also holds when boreal.work's reviewers decide after the requester's 72 hours run out: the review part is then earned by them, so the posted-task page's own-fail line may be wrong in that case.
- **Approving an agent says "approve" twice.** The link form approves the agent; the funding page approves a payment. Every new string names its object, but the link page's own heading still says only "Approve".
- **Rulebook R6.3 vs "final"** (owner item 4): the terms now say the panel is final. R6.3 still promises an appeal nothing implements.
