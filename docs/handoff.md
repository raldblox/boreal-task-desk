# Handoff: UI, copy and design notes

Notes from the model doing deep technical work, for a cheaper model to carry out (see "Who does what" in `CLAUDE.md`). Each note is small enough to do in one sitting and checkable in the browser.

**How to write a note:** where (file and component, or page and URL), what's wrong or missing, what done looks like, and anything that must not change (behaviour, rules from `CLAUDE.md`). Keep the brand rules: always write "boreal.work"; illustrations are hand-built SVG, never generated images.

**Who carries them out:** Opus 5.5, or a smaller capable model such as Sonnet 5.5. Start a session on that model and send "Read docs/handoff.md and do the open notes." Fable 5.2 writes notes here and doesn't carry them out.

**How to finish one:** do it, check it in the browser (desktop and phone), then move it to Done with the commit hash.

## Open

### 13. The copy pass: words, facts, terms and privacy

- **Status:** pages 1-8 done (see the brief's Progress). Open: the owner's seven legal answers, and the pages the brief didn't cover.

- **Where:** [`docs/copy-brief.md`](copy-brief.md). It is its own brief because it covers every page: start a session and send "Read docs/copy-brief.md and do it."
- **What's wrong:** the same thing has two or three names across pages; the terms, privacy policy and FAQ say a few things the code doesn't do (when pay arrives, one dispute per task, "accounts are never merged", "approve it once"); and nothing yet tells an owner what saving a PayPal account lets an agent do.
- **Done looks like:** its Progress list ticked, with the owner's seven legal answers written in once they exist.

### 14. ZKPassport on /signin and My account: the working minimum, to be designed

- **Where:** `apps/web/src/components/zkpassport-sign-in.tsx` (`ZkPassportSignIn`), `PassportSignIn` in `apps/web/src/app/signin/page.tsx`, and the "Passport (ZKPassport)" row in `Identity` in `apps/web/src/app/me/page.tsx`.
- **What's wrong:** it works but is plain. The QR code is a bare image in a box; the steps are a text list; the progress is only the button's label (waiting for the app, approve and scan, phone building the proof, checking); there's no ZKPassport mark; and on a phone the "Open in the ZKPassport app" link should be the main action, with the QR code secondary. `/signin` now has PayPal plus two collapsed `<details>` blocks (ZKPassport, Concordium ID) and reads as a list of alternatives rather than a choice.
- **Done looks like:** `/signin` shows the three ways to verify as a clear choice, with what each needs and costs (ZKPassport: free; an NFC passport or ID card, not PhilSys; a phone with NFC that passes the app's device check; about 400 MB; a selfie for the face check). The ZKPassport flow shows a step indicator matching the states above, a phone-first layout, and a retry that starts a fresh request. A ZKPassport-verified worker sees a "Verified with passport" state on My account, with their nationality as an attribute badge (`attributeLabel` in `apps/web/src/lib/format.ts` has no label for `nationality` yet).
- **Must not change:** the request is built only by `passportQuery()`; the proofs go to `/api/worker/passport/finish` and nowhere else; no ZKPassport logo is redrawn (use their published mark or none). Always write "boreal.work".

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
- 10b. My account → Integrations: an EVM payout card (only once the EVM add-on is on): (this commit)
