# Handoff: UI, copy and design notes

Notes from the model doing deep technical work, for a cheaper model to carry out (see "Who does what" in `CLAUDE.md`). Each note is small enough to do in one sitting and checkable in the browser.

**How to write a note:** where (file and component, or page and URL), what's wrong or missing, what done looks like, and anything that must not change (behaviour, rules from `CLAUDE.md`). Keep the brand rules: always write "boreal.work"; illustrations are hand-built SVG, never generated images.

**Who carries them out:** Opus 5.5, or a smaller capable model such as Sonnet 5.5. Start a session on that model and send "Read docs/handoff.md and do the open notes." Fable 5.2 writes notes here and doesn't carry them out.

**How to finish one:** do it, check it in the browser (desktop and phone), then move it to Done with the commit hash.

## Open

### 7. My account → Agents: the owner's controls (RS-1, RS-2)

- **Where:** `apps/web/src/app/me/page.tsx`, `MyAgents`, and `apps/web/src/components/owner-agent-controls.tsx`.
- **What's wrong:** it works and is the bare minimum: one grey sentence with every number in it, and a `<details>` holding four stacked forms. Paused, no key and "asks you first" don't stand out. Each agent's last payments and the owner's own changes exist in the desk (`ownerAgentActivity`) and aren't shown.
- **Done looks like:** per agent: its state at a glance (active, paused, no key; asks first or pays on its own), spend today, this week and in all with what is held, a clear "approve or decline" call when a payment is waiting, then the controls, with revoke and disconnect visibly the destructive ones. The latest payments and changes listed. Usable on a 360 px phone.
- **Don't change:** the actions in `apps/web/src/app/owner/actions.ts` or what the desk enforces.

### 8. The page where an owner approves a payment (RS-1)

- **Where:** `apps/web/src/app/approve/[id]/page.tsx`. Agents send owners this link, usually to a phone.
- **What's wrong:** plain boxes. The amount, who is asking and what "held, not charged" means should be readable in a few seconds; after deciding, the page should say plainly what happened, per task when some couldn't be paid.
- **Done looks like:** the total and the agent's name first, each task as a short card, Approve as the one primary action with Decline beside it, the states (pending, approved, declined, expired) each with their own words. The same care on the same form in `apps/web/src/app/link/approve-form.tsx`, where the owner now picks "ask me each time" or "pay on its own".

### 9. The admin passkey page

- **Where:** `apps/web/src/app/admin-passkey/page.tsx`, `apps/web/src/components/admin/passkey-panel.tsx`.
- **What's wrong:** functional only. A first-time admin isn't told what a passkey is or to enrol a second one before relying on the first; the list of keys is bare.
- **Done looks like:** three clear states: enrol your first key (with the code field only when one is needed), use your key, manage your keys. Errors from the browser in plain words. Desktop is enough; security keys are used there.
- **Don't change:** the actions, or anything in `apps/web/src/lib/admin-passkey.ts`.

### 10. A button for workers to connect an EVM wallet (only once the EVM add-on is switched on)

- **Where:** My account → Integrations (`apps/web/src/components/addons-panel.tsx`, `connect-wallet.tsx`) and the guided setup on a task page, beside the NEAR and Concordium ones.
- **What's missing:** the server side exists (`connectPayoutAccount({ rail: "evm", address, issuedAt, signature })` in `apps/web/src/app/actions.ts`; the message to sign is `evmConnectMessage(host, issuedAt)` from `@boreal/evm`), but nothing asks the wallet. Use `window.ethereum`: `eth_requestAccounts`, then `personal_sign` of that message. Nobody types an address.
- **Done looks like:** a Connect button like NEAR's, the connected address shown shortened, and the claim blocked with a clear reason until it is connected (`canBePaidOn` in `apps/web/src/lib/rails.ts` already takes `evmAddress`; pass it from `getWorker`). Also `RAIL_LABEL.evm` says "USDC on Base": make it name the configured chain.

### 11. Admin → Controls: the rail switches

- **Where:** `apps/web/src/app/admin/controls/page.tsx`, `Rails`.
- **What's wrong:** a plain table. A closed rail should be impossible to miss, here and on the admin overview, and `/status` should say a rail isn't taking new payments (the desk has `closedRails()`).

### 12. Say when pay really arrives (RS-16)

- **Where:** wherever "48 hours" is promised to a worker: the task page's passed state, `/faq`, the agent guide's step 7.
- **What's wrong:** the monitor runs on every write and once a day. A verdict nobody objects to becomes final after 48 hours at the next activity on the site or the next daily run, which on a quiet day can be up to a day later. A pass the requester gives or accepts pays at once.
- **Done looks like:** the promise reads "within 48 hours, sometimes up to a day more" (or better words), and says that a requester's own pass or accept pays straight away.

### 13. The copy pass: words, facts, terms and privacy

- **Where:** [`docs/copy-brief.md`](copy-brief.md). It is its own brief because it covers every page: start a session and send "Read docs/copy-brief.md and do it."
- **What's wrong:** the same thing has two or three names across pages; the terms, privacy policy and FAQ say a few things the code doesn't do (when pay arrives, one dispute per task, "accounts are never merged", "approve it once"); and nothing yet tells an owner what saving a PayPal account lets an agent do.
- **Done looks like:** its Progress list ticked, with the owner's seven legal answers written in once they exist.

## Done

- 1. Tell the worker who is reviewing, and by when (RS-11): 8dd3302
- 2. Tell the poster their review time (RS-11): 8dd3302
- 3. Money → Pending and failed: the "Send again" action (RS-12): 8dd3302
- 4. Overview: escrow against the ledger now has three states (RS-9): 8dd3302
- 5. Say the two new limits where people read the rules (blocked on the owner): d551dab
- 6. A way to reach boreal.work (blocked on the owner): d551dab
