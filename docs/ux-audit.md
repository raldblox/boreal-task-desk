# boreal.work UX, copy and docs audit

Audited 2026-11-01 from the source in `apps/web` (both sites run the same code; `BOREAL_NETWORK` decides the testnet banner, PayPal sandbox or live, and network wording). Ranked by how much a real user is hurt, highest first. **Owner** says who fixes it: *this pass* (copy/UI session), or *PayPal session* when the file was being edited by the "Sign in with PayPal; Concordium ID as verified badge" session at the time.

Terms used below, and the ones the site should use everywhere:

- **testnet** (testnet.boreal.work, never real money) and **live site** (boreal.work, real money);
- task statuses as workers see them (`apps/web/src/lib/format.ts`): Open, Claimed by you, Under review, Passed, Failed, Disputed, Paid, Not paid, Expired, Cancelled;
- money states: **held** (in escrow, or passed but the 48-hour objection window is still open), **on its way** (payout sent, settling), **paid**.

## High impact

| # | Where | Finding | Fix | Owner |
|---|---|---|---|---|
| H1 | Header, every page on a phone | The nav (`Find tasks`, `For agents`) is `hidden sm:flex`: under 640 px there is no way to reach tasks except the home hero or the footer. Most workers are on phones. | Show a compact nav row on small screens. | this pass |
| H2 | Unknown URLs, `notFound()` (task not found, admin), thrown errors | No `not-found.tsx`, `error.tsx` or `global-error.tsx`: users get Next's bare default pages, unbranded and with no way back. | Branded 404 and error pages with a next step (find tasks, home, try again, status). | this pass |
| H3 | Footer on boreal.work | Footer says "on Concordium testnet" on the live site too. | Say which site this is from `NETWORK`; add Privacy and Terms links once they exist. | PayPal session (footer) |
| H4 | Home hero | "Paid real-world tasks, proven with Concordium ID" and "Sign in to work" still describe the Concordium-only flow; sign-in is now Log in with PayPal, with Concordium ID as an optional badge. Pillar copy says "zero-knowledge proofs" (jargon for workers). | Lead with PayPal sign-in and "you're paid when it passes"; describe Concordium ID as an optional badge in plain words. | PayPal session (`page.tsx`) |
| H5 | Sign-in return | `/tasks` and `/tasks/[id]` send signed-out users to `/signin` without `next`, so after signing in from a shared task link they land on `/tasks`, not the task. | Pass `?next=` on those links. | PayPal session (`tasks/*`) |
| H6 | Task detail: expired, cancelled, refused | `NextStep` returns nothing for these, so a worker whose claim lapsed or whose task was cancelled sees a status badge and no explanation or next step. | One line per state and a "Find another task" link. | PayPal session (`tasks/[id]`) |
| H7 | Money wording | `/me` shows "On its way" and "Passed, pending"; task detail says "paid when the objection window closes"; status badge says "Passed". Three different words for "held". | Use held / on its way / paid everywhere; badge "Passed, paying soon". | this pass (`format.ts`); `/me` copy: PayPal session |
| H8 | PayPal return `/paypal/approved` | The person reading is the agent's owner, but the page tells them about `fund_task` (a tool name) and has no link anywhere. | Plain words ("your agent finishes funding the task"), and links to My account and the tasks. | this pass |

## Medium impact

| # | Where | Finding | Fix | Owner |
|---|---|---|---|---|
| M1 | `/status` | The "Concordium ID sign-in" row reads as if Concordium were the sign-in; Log in with PayPal, now the main sign-in, has no row. | Rows for "Log in with PayPal" and "Concordium ID (verified badge)". | this pass |
| M2 | Task progress bar | During a dispute or after a fail, step 3 just says "Reviewed"; the worker has to read the badge to know the verdict. | Step 3 names the verdict: Passed, Failed, Disputed. | this pass |
| M3 | `/link/[code]` approve form | The badge input has only a placeholder (no label for screen readers); the "Is this one of your agents?" select has no focus ring. Error text is capitalised by string slicing. | Label the input, give the select the input's focus styles, write the error as a sentence. | this pass |
| M4 | `/agents` step 3 | The link text says `boreal.work/link` on the testnet too. Fees and caps are right (read from `FEE_POLICY`), but the home page hard-codes "12% platform, 5% review". | Use `SITE`; read fees from `FEE_POLICY` on the home page. | PayPal session (`agents`, home) |
| M5 | `/me` earnings | "A pass is paid 48 hours after the verdict" is hard-coded; `POLICY.objectionWindowMs` is the source. `Payouts` and `MyAgents` suspend with no fallback, so the page jumps as they load. | Read the window from `POLICY`; add fallbacks. | PayPal session (`me`) |
| M6 | Task detail, claimed | "Release task" has no explanation; workers may fear it costs them. | "Can't do it? Release it so someone else can. Nothing is held against you." | PayPal session (`tasks/[id]`) |
| M7 | Task detail, paid | "Paid $x to your account" doesn't say which (PayPal or Concordium). | Name the rail from `task.paymentRail`. | PayPal session (`tasks/[id]`) |
| M8 | `/link` | The code page doesn't say what happens next or that requests expire in 15 minutes. | One line under the form. | this pass |
| M9 | README | Still describes the tester invite (`TEST_WORKER_INVITE`), "Until then /signin offers only the tester invite", a single `boreal-task-desk` Vercel project, typed PayPal emails, and a worker route table without `/status`, `/link`, `/agents`, `/admin`, `/privacy`, `/terms`. | Rewrite the overview, per-site setup and routes. | after PayPal session commits README |

## Low impact

| # | Where | Finding | Owner |
|---|---|---|---|
| L1 | `/signin` loading | The fallback is an empty card the height of the options; fine, but a pulse would show it's loading. | PayPal session |
| L2 | `/link/[code]` deny | "Deny this request" acts at once with no confirm; it's harmless (the agent can ask again), so leave it. | — |
| L3 | Header account button | Shows the pseudonym handle (`ab12…cd34`) with a `title` only; on a phone it reads as a code. "My account" would be clearer. | this pass |
| L4 | `layout.tsx` metadata | Description still says "proven with Concordium ID". | PayPal session (layout touches the footer/banner) |
| L5 | `globals.css.bak` | A stray backup file in `src/app`. | leave (not ours) |

## Flows walked

- **Worker:** home → Sign in (PayPal, or Concordium ID / dev wallet) → `/tasks` (empty state, or cards) → task → Claim → submit (photo shrunk in the browser) → Under review → Passed (held for the objection window) or Failed (dispute once) → Paid on `/me`. Gaps: H1, H5, H6, H7, M6, M7.
- **Owner:** agent sends `/link/<code>` → sign in (returns to the link) → set limits, optional badge → Approve → Connect PayPal (vault) → `/me?paypal=saved` → Your agents. Gaps: M3, M8; the PayPal checkout return (H8) when PayPal can't save accounts.
- **Agent:** `request_link` → `check_link` → `post_task` → `fund_task` (402 → pay → retry) → `get_task` / `get_submission` → `review_result` or wait → `accept_result`. Covered by the agent guide; site-side gap only H8.
- **Dispute:** Failed → dispute form (once, until the window closes) → Disputed → panel decision (Paid or Not paid). Gap: M2.
- **Refund / expiry / cancel:** money goes back to the agent; the worker side has no message (H6).

## States

- **Empty:** `/tasks` (signed out, none open) and `/me` (no tasks) are good. `/me` agents section hides when empty, which is right.
- **Loading:** every page that reads a session suspends with a pulse fallback, except `/me` Payouts/MyAgents and the PayPal notice (M5), and sign-in (L1).
- **Error:** server-action errors show inline alerts. Page-level errors had no boundary (H2).
- **Mobile:** layouts stack well; the header nav was the one break (H1).
