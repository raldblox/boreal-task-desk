# NEAR demo: the recording run

How to record the NEAR film (`docs/near-demo.md`) so it plays the same every take: what to set up, the brief Hermes gets off camera, Ji-woo's exact messages, ready answers to Hermes's questions, the follow-ups, the worker side, and what to do when something drifts.

The PayPal run drifted in three places: Hermes asked questions nobody had answers ready for, it stopped partway and had to be told to start again, and its replies ran long. Each has a fix below.

Everything on screen is real, on testnet.boreal.work: USDC on NEAR testnet, private AI on NEAR AI Cloud.

## 1. Before you film

**Site (testnet.boreal.work)**

- [ ] The latest main is deployed (the proof panel, explorer links, `get_review_proof`).
- [ ] **Remove `AUTO_SCREEN` from the boreal-testnet project in Vercel, then redeploy.** While it's set, tasks open at funding with no screening, so the private AI never screens anything and line 7 ("read by private AI") has nothing to show. Put it back after filming if you want.
- [ ] `AI_SCREENING` is not `off`, and `NEAR_AI_API_KEY` is set. `/status` → Add-ons shows **NEAR rail** and **Private review** as ready.
- [ ] Escrow is registered with the USDC contract: `pnpm --filter @boreal/near testnet-accounts` says so (`--register` if not).
- [ ] Rehearse once, then ask for a wipe (or a fresh Ji-woo account) so the real take starts clean.

**Hermes's wallet** (the agent pays from its own NEAR account)

- [ ] `pnpm --filter @boreal/near agent-pay --new` makes it once and prints the account id. The key stays in the git-ignored `packages/near/.env.agent-wallet`.
- [ ] Send that account about 0.5 testnet NEAR (gas), then about 30 testnet USDC from faucet.circle.com.
- [ ] `pnpm --filter @boreal/near agent-pay --balance --asset <USDC contract>` shows the USDC.
- [ ] Hermes can run commands in `C:\Users\raldb\boreal-task-desk`.

**Hermes itself**

- [ ] A fresh Hermes profile with no saved boreal key, so its first move is to ask for a link.
- [ ] Tool-call display off (or plan to crop it). The `bk_` key never on screen.

**Workers** (three sandbox people, none of them Ji-woo)

- [ ] Each logs in with PayPal on testnet, then My account → Integrations → **Connect NEAR wallet** (Meteor, testnet). Tasks paid in USDC on NEAR can only be claimed by someone with a NEAR wallet connected.
- [ ] The photos ready, per section 6: two that won't hold up, one honest.

## 2. The brief (paste to Hermes off camera)

Paste this as its own message before recording. Don't record it.

> For the next conversation you're acting as Ji-woo's personal assistant for a short product film. Ji-woo lives in Seoul and is launching her K-beauty shop's sunscreen in the Philippines next month. What she asks is her launch plan, so keep it between you and boreal.work.
>
> Rules for this session:
> - Speak in short, warm, plain sentences, under 30 words. Never show tool names, APIs, JSON, commands or keys. Do the work quietly.
> - If you're not connected to boreal.work yet, read https://testnet.boreal.work/agents.md, ask for a link, and give Ji-woo the approval link in one sentence. Once approved, tell her your limits in one sentence.
> - Use boreal.work to hire people in the Philippines. Every task is a public place or a public fact. Never photograph shoppers or staff, and never ask for anyone's personal details.
> - Each task: a clear checklist, photo proof, a 48-hour deadline, $3 to $5 worker pay by effort, no required attributes, and boreal.work's own reviewer (leave `reviewer` as `boreal`; don't review results yourself).
> - Write every task for someone who's already there anyway: under 10 minutes, any day this week, no fixed time.
> - Pay for tasks in USDC on NEAR from your own wallet, never PayPal. For each task, call `fund_task` with `rail: "near"`, then pay its requirement by running, in `C:\Users\raldb\boreal-task-desk`:
>   `pnpm --filter @boreal/near agent-pay --to <payTo> --amount <amount> --asset <asset> --memo <extra.memo>`
>   and call `fund_task` again with `payment: { "txHash", "signerId" }` from its output.
> - Post the tasks, then show one short list with the total and ask "OK to fund?" once. On her yes, fund them all, one after another, without stopping to ask again.
> - Then keep going on your own: check the tasks every few minutes until each has a verdict. Don't wait to be asked.
> - When verdicts come in, read them from `get_task`. Tell Ji-woo in one or two sentences which passed and which didn't, and why, in plain words.
> - If she asks to see results, show the worker's photos from `get_submission`. If she says to pay one, call `accept_result` on it. If she asks whether the review was private, or for proof, call `get_review_proof` and say in one sentence whether the proof checks out.
>
> Reply only "Ready" now.

## 3. Ji-woo's messages (record these)

Type or dictate each exactly. The voice-over already has `hi` and `ask`, so these match it word for word.

| # | Ji-woo says | Hermes should answer (roughly) | Line it covers |
| --- | --- | --- | --- |
| 1 | "Hi, Hermes. Can you get real people in Manila to check a few things for me?" | Asks for her OK and gives the approval link | `hi`, `linkedWallet` |
| — | *(she approves on the link page, sets $10 a task and $50 a day)* | "Connected. Up to $50 a day, never more than $10 a task, and I'll ask before I spend." | `linkedWallet` |
| 2 | "I need competitor sunscreen prices at two stores, and someone to count who stops at a K-beauty shelf." | Three tasks and a total in USDC; "OK to fund?" | `ask`, `triage` |
| 3 | "Yes." | Funds all three from its wallet; "Posted. Paid from my wallet, held in escrow." | `liveEscrow` |
| 4 | *(wait for verdicts)* | "Two photos didn't hold up and weren't paid. The shelf count passed." | `checkedReviewer` |
| 5 | "Let me see them." | Shows the three results | `letMeSee` |
| 6 | "The shelf count looks right. Pay her now." | Accepts it; "Done. She's paid." | `payHer`, `paid` |

**On screen in the browser between messages:** the funded task with its **On NEAR** links (`liveEscrow`), the screened task's private review line (`privateNear`), the worker's NEAR wallet connect and claim (`workers`), the failing verdicts with their rules (`checkedReviewer`), **Proof checks out** opened (`signed`), and USDC arriving in the worker's wallet on nearblocks (`paid`).

## 4. Ready answers if Hermes asks

The brief tells it not to, but if it asks anyway, answer in one line, keep recording, and cut it in the edit.

| Hermes asks about | Ji-woo answers |
| --- | --- |
| Which stores or mall | "Any big beauty store in BGC, and one in Makati." |
| Which brands | "The three best-selling Korean sunscreens on the shelf." |
| How long to count, or when | "Five minutes, any afternoon this week." |
| What counts as stopping | "Picks one up or stops to read." |
| Price or budget | "Keep each under five dollars." |
| Deadline | "This week is fine." |
| Photos of people | "No faces. Just the shelf." |
| Who reviews | "boreal's reviewer is fine." |
| PayPal or wallet | "Your own wallet, in USDC." |
| Whether to fund now | "Yes, fund them." |
| Anything else | "Your call." |

## 5. Follow-ups to record (for cutaways and the X post)

Not in the voice-over, but strong as a few seconds on screen or in a reply to the post. Ask them after message 6.

| Ji-woo asks | What it shows |
| --- | --- |
| "Was that review private?" | Hermes calls `get_review_proof`: "Yes. It ran as private AI on NEAR AI Cloud, and its signed proof checks out." |
| "Where's my money now?" | `get_balance`: what was paid, and what came back from the two that failed |
| "What did the reviewer say about the other two?" | The rules cited (R4.2, a photo that doesn't show what was asked) in plain words |
| "Show me the payment." | The nearblocks link for the worker's USDC |

## 6. The worker side

Three workers, one task each. The voice-over says "two photos don't hold up", so:

| Task | Worker submits | Expected verdict |
| --- | --- | --- |
| Prices, store 1 | A generated close-up of bottles with price tags that don't read as a real shelf | Fail (R4.2, or a criterion missed under R4.1) |
| Prices, store 2 | A generated photo, or a real one of the wrong aisle | Fail |
| Shelf count | A real shelf photo and an honest count in the notes | Pass |

Rules for the photos: no faces, no real brand logos or store names, no fake receipts. The end card says some photos are illustrative.

Check the fails are real before the take: the private reviewer has to catch them. If one passes in rehearsal, use a weaker fake (wrong product, unreadable tags) rather than editing anything.

## 7. If it drifts

| What happens | What to do |
| --- | --- |
| Hermes sends a PayPal checkout link | Say "Use your own wallet, in USDC." |
| Hermes stops after posting and waits | Say "Go ahead and fund them." If it stops after funding, "Let me know when they're done." Cut the nudge. |
| Hermes asks a question | One-line answer from section 4; cut it. |
| Replies run long | Tighten the brief to "under 20 words" and redo the take. |
| Hermes shows a command, JSON or a tx hash | Crop, or turn off tool display. The hash is fine on the explorer shot, not in chat. |
| The `agent-pay` command fails | Check the wallet has NEAR for gas and enough USDC (`--balance`); the error line says which. |
| `fund_task` says the transfer wasn't found | Wait a few seconds and call it again with the same `txHash`: the desk checks the chain. |
| A task opens without screening | `AUTO_SCREEN` is still set on testnet (section 1). |
| A fake photo passes | Use a weaker fake next take (section 6). Never edit a verdict. |
| A worker can't claim | They haven't connected a NEAR wallet, or they're Ji-woo's own account. |

## 8. After the take

- Save the explorer links (funding, payout, refund) and one proof (**Download the proof**) for the README and the X post.
- Recordings go to `apps/film/public/rec/shared/` (Seoul, chat) and `apps/film/public/rec/near/` (wallet, explorer, proof panel, worker wallet).
- Put `AUTO_SCREEN` back on testnet only if you want tasks to open without screening again.
