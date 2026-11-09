# Devpost submission: PayPal AI Hackathon

Paste-ready fields for https://devpost.com/submit-to/31302-paypal-ai-hackathon/manage/submissions/1288424/project-overview

## Project name

boreal work

## Elevator pitch (200 characters max)

AI agents can think, but some answers need a person in the right place. boreal work lets any agent hire verified people, holds the money with PayPal, and pays them the moment the work passes.

## Video demo link

https://youtu.be/V2vEPrQ3G_M

## Try it out

- https://testnet.boreal.work (PayPal sandbox; money is never real)
- https://testnet.boreal.work/agents.md (the skill any agent reads to connect)
- https://github.com/raldblox/boreal-task-desk

## Built with

typescript, next.js, react, postgresql, neon, drizzle, vercel, paypal-orders-v2, paypal-vault, paypal-payouts, log-in-with-paypal, model-context-protocol, a2a, claude, remotion

## About the project

### Inspiration

AI agents are learning to shop, book and pay. But a lot of what businesses need is still a fact only a person can check on the spot: whether a supplier's warehouse exists before a deposit is paid, what a product really sells for on a Manila shelf, whether a pre-selling building is actually going up. Meanwhile hundreds of millions of people already earn online, and in the Philippines PayPal is how many of them get paid. We wanted an agent to be able to ask the world for help and pay the people who answer, safely, without its owner typing a card number every time.

### What it does

boreal work is a task desk for AI agents.

- **Agents connect in one read.** Any agent reads `agents.md` (a skill), connects over MCP, REST or A2A, and asks its owner for one approval.
- **PayPal is the money layer.** The owner logs in with PayPal and saves it once (PayPal Vault), inside limits they set per task and per day. The agent then funds tasks itself, and boreal work, not the agent, enforces the limits: until PayPal has verified the owner's account, the agent stays at $10 a task and $50 a day whatever the owner sets; after that, up to $50 a task and $500 a day. Every task is an **authorization, not a charge**: PayPal holds the money and boreal work captures it only when the work passes, or voids it if it fails, expires or is cancelled. Several tasks fund in one step.
- **Agents spend only where a person is needed.** In the demo, Hermes answers two of Ji-woo's five questions online for free and sends only the three real-world tasks to boreal work.
- **People do the work.** Workers log in with PayPal, which is also where they get paid. With real money, only a PayPal account PayPal has verified can claim tasks. They claim a task and submit photo proof and notes. boreal work keeps a one-way code for their PayPal account, never the account ID itself.
- **Every answer is checked before money moves.** A reviewer (the requester's own agent, or Claude) decides pass or fail against a public rulebook. In the demo, Hermes catches two generated photos and timing that didn't add up; Ji-woo passes the honest one.
- **Workers are paid through PayPal Payouts** the moment a task passes, and see it on their earnings page.

### How we built it

- A pnpm monorepo on Next.js 16, deployed to Vercel with Neon Postgres. A pure TypeScript state machine (`packages/core`) is the only thing that moves a task between states; every command runs in one transaction that locks the task, appends a hashed audit event, writes ledger entries with idempotency keys and queues side effects in an outbox.
- **PayPal:** Orders v2 with `intent=AUTHORIZE` for escrow, capture on pass and void on fail, PayPal Vault for owner-approved agent funding, Payouts for workers, Log in with PayPal for both sides, and webhooks to settle payouts. Payouts are journaled on their outbox row before sending and are never resent while the first could still execute.
- **Agents:** an MCP server and a REST API, an A2A agent card, and an `agents.md` skill. Funding tools return a plain-language message for the agent to relay to its owner.
- **AI:** Claude screens tasks and can review submissions; the AI never changes state itself, and anything undecided goes to a person.
- **Runs on PayPal alone.** Everything above is the PayPal core. boreal work also has optional add-ons (Concordium identity and NEAR stablecoin payments), switched on per deployment; with them off, none of their code loads and nobody is asked for a wallet. They aren't part of this entry.
- The demo film is a Remotion project in the same repo, voiced with ElevenLabs through Runway.

### Challenges we ran into

- PayPal refuses several authorizations in one multi-unit order, so batch funding pays each task from the saved PayPal account in one call, each with its own hold.
- Making sure a refused task never takes money: payment confirmation runs inside the funding transaction's own checks.
- Payout safety: a payout must never be sent twice, so it is recorded before it is sent and retried only when the first provably can't execute.

### Accomplishments that we're proud of

- A real end-to-end loop on the PayPal sandbox: owner approval, saved PayPal, held funds, worker claim, review, capture and payout.
- The agent caught fake proof in our own demo before any money moved.
- Any agent can use it: Hermes connected from a desktop app with nothing but a link.
- One PayPal login does everything: it signs people in, verifies them and pays them, so nobody needs a wallet or a new password.

### What we learned

Holds, not charges, are what make agents safe to give money to. An owner will let an agent spend when nothing is captured until the work is checked.

### What's next for boreal work

Live PayPal on boreal.work, Hyperwallet and local payout options for workers in the Philippines, more agent platforms listing the skill, and verified-human tasks for agent marketplaces.

## Notes for the form

- The video is 2:59.5, under the 3-minute limit.
- Some task photos and counts in the demo are illustrative; the end card says so.
- Required before submitting: a licence file in the repo, and the repo made public.
- The limits in "What it does" are the PayPal-only setup (`BOREAL_ADDONS=none`). testnet.boreal.work also runs the Concordium and NEAR add-ons for another hackathon, and there Concordium ID, not PayPal verification, lifts the $10 / $50 caps. The video shows the PayPal flow either way.
