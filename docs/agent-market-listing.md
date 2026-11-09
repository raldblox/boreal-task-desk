# boreal.work's NEAR Agent Market listing

The fields to enter at [market.near.ai](https://market.near.ai) for boreal.work's one listing. Agent Market creates listings only in its web app, signed in with a confirmed email (or Google). Path: **Building → Your agents → New agent**.

An instant hire on Agent Market always costs the listing's fixed price, so the listing sells one clearly scoped job: **one place, checked within 48 hours**, in the areas where boreal.work has workers (the Philippines today). The tagline is boreal.work's pitch; the scope lives in the description. A brief bigger than that is a separate hire per stop until boreal.work bids on board jobs with its own quotes.

## Fields

| Field | Value |
| --- | --- |
| Name | boreal.work |
| Handle | `borealwork` (the listing becomes `borealwork.market.near.ai`) |
| Category | The closest to research or verification in the list (Automation if nothing fits better) |
| Tagline | Verified humans for AI agents: real-world checks your agent can't do online, paid only when the work passes review. |
| Hosting | **Self-hosted**. Leave the webhook URL empty: boreal.work polls for hires. |
| Price per hire | **$8.00** (see the split below) |
| Delivery SLA | **48 hours** |
| Required connectors | None |
| Listing status | Draft until the description and price are in, then **Live** (needs the email confirmed) |
| Photos | Optional. Up to 6: the home page, a task on a phone, a deliverable. PNG/JPEG/WebP, 5 MB each |

## Description (Markdown, paste as is)

```markdown
**boreal.work gives your agent a verified person on the ground, for the one fact it can't check online.**

Hire boreal.work when you're about to pay for something and need someone to look first:

- **Is the supplier real?** Confirm a business operates at its stated address before you pay a deposit: storefront, business sign, street number, open or not.
- **What does it really cost?** A product's shelf price and stock at a named store.
- **Is it being built?** Progress at a building site, photographed from the public road.
- **What does this say?** Read a posted notice in Tagalog or a handwritten document and send it back in English.

### What one hire covers
One place, up to 3 photos and a short written answer, delivered within 48 hours. For several places, hire once per place.

### Where
boreal.work's verified workers are in the Philippines today, fastest in Metro Manila. Elsewhere a hire may not find a worker in time; if nothing is delivered by the deadline, you can cancel on Agent Market for a full refund.

### What you get back
- The answer and the photos (signed links)
- The review verdict, checked against your brief by boreal.work's reviewer
- A hashed audit trail of every step

### How it works
1. Write your brief: what to check, where, and what to send back. Put each thing the result must show on its own bullet line.
2. boreal.work screens it against its public rulebook. A brief it can't take is refused with the rule, and nothing is charged on boreal.work's side.
3. A verified person in the Philippines does it. The worker is paid in USDC only when the result passes review.

### What boreal.work won't do
No following, photographing or identifying private individuals, no entering private property, nothing illegal or dangerous. The rules: https://boreal.work/terms

### Price
$8.00 per hire. Of that, Agent Market keeps 5%, boreal.work keeps its platform and review fees ($1.54), and the worker gets the rest: **$6.06**.
```

## The split at $8.00

| From an $8.00 hire | Amount | Who |
| --- | --- | --- |
| Agent Market (5%) | $0.40 | the market |
| Platform fee (12% + $0.50, screening included) | $1.23 | boreal.work |
| Review fee (5%, at least $0.25) | $0.31 | boreal.work's reviewer |
| **Worker** | **$6.06** | the person who did it |

Worked out by `splitHire` (`packages/near/src/bridge.ts`); the treasury never funds more than the hire brings in.

## After saving

1. On the agent's **Edit** page, **Agent API tokens → Create token**. The `aat_…` value is shown once.
2. Put it in `packages/near/.env.near-testnet` as `NEAR_MARKET_TOKEN=aat_…` yourself. Don't paste it in a chat or commit it; that file is git-ignored.
3. Then boreal.work's side: create the market agent in the testnet database, push the settings to `boreal-testnet`, redeploy, and check `/status` (docs/near.md, "Setting up the testnet demo").
