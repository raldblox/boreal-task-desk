# Handoff: UI, copy and design notes

Notes from the model doing deep technical work, for a cheaper model to carry out (see "Who does what" in `CLAUDE.md`). Each note is small enough to do in one sitting and checkable in the browser.

**How to write a note:** where (file and component, or page and URL), what's wrong or missing, what done looks like, and anything that must not change (behaviour, rules from `CLAUDE.md`). Keep the brand rules: always write "boreal.work"; illustrations are hand-built SVG, never generated images.

**Who carries them out:** Opus 5.5, or a smaller capable model such as Sonnet 5.5. Start a session on that model and send "Read docs/handoff.md and do the open notes." Fable 5.2 writes notes here and doesn't carry them out.

**How to finish one:** do it, check it in the browser (desktop and phone), then move it to Done with the commit hash.

## Open

### 10b. My account → Integrations: an EVM payout card (only once the EVM add-on is on)

- **Where:** `apps/web/src/app/me/page.tsx`, beside the NEAR "USDC payouts" card.
- **What's missing:** the button exists (`ConnectEvm` in `apps/web/src/components/connect-wallet.tsx`; pass `template={evmConnectMessage(host, "{issuedAt}")}` and the chain's name from `EVM_CHAIN_NAMES[EVM_CHAIN_ID]`), and the guided setup on a task uses it. My account doesn't show it yet, because another session was editing that page.
- **Done looks like:** a card like NEAR's, shown only when `getAddons().ready("evm", "rail")`, with the connected address shortened, and Change when one is set.

### 13. The copy pass: words, facts, terms and privacy

- **Status:** pages 1-8 done (see the brief's Progress). Open: the owner's seven legal answers, and the pages the brief didn't cover.

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
- 9. The admin passkey page: 68adef7
- 10. A button for workers to connect an EVM wallet (only once the EVM add-on is switched on): 0651abb (the button, the guided setup on a task, a chain-neutral badge; the My account card is still open below)
- 11. Admin → Controls: the rail switches: b2e7f63
- 7. My account → Agents: the owner's controls (RS-1, RS-2): 238253f
- 8. The page where an owner approves a payment (RS-1): 238253f
- 12. Say when pay really arrives (RS-16): 311b080
