# NEAR demo: the recording run

How to record the NEAR film (`docs/near-demo.md`): what to set up, Ji-woo's exact messages, ready answers to Hermes's questions, the follow-ups, the worker side, and what to do when something drifts.

**No brief, as in the PayPal film.** Hermes gets nothing off camera: it learns boreal.work from agents.md like any agent, so what it does is real. Ji-woo steers it to NEAR in her own words, the way a real user would ("pay them in USDC from a NEAR wallet I'll fund"). agents.md then shows it how to make a wallet and pay, with boreal.work's no-dependency script (`/near-pay.mjs`). The brief in section 2 is a fallback, only if a take keeps drifting.

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

- [ ] Nothing to prepare: Hermes makes its own wallet off screen by following agents.md: it downloads `https://testnet.boreal.work/near-pay.mjs` and runs `node near-pay.mjs new`. It needs Node 18 or later and permission to download a file and run a command.
- [ ] Rehearse with a throwaway Hermes profile first, to see the steps it takes; delete that profile's `.near-wallet.json` before the real take so it starts with no wallet.
- [ ] **Ji-woo's own NEAR wallet** (Meteor, testnet) holds about 1 testnet NEAR and 30 testnet USDC (faucet.circle.com). She uses it once, on the approval page.

**Hermes itself**

- [ ] A fresh Hermes profile with no saved boreal key, so its first move is to ask for a link.
- [ ] Tool-call display off (or plan to crop it). The `bk_` key never on screen.

**Workers** (three sandbox people, none of them Ji-woo)

- [ ] Each logs in with PayPal on testnet, then My account → Integrations → **Connect NEAR wallet** (Meteor, testnet). Tasks paid in USDC on NEAR can only be claimed by someone with a NEAR wallet connected.
- [ ] The photos ready, per section 6: two that won't hold up, one honest.

## 2. Fallback: the brief (only if takes keep drifting)

By default, send nothing before recording. If two takes in a row drift (Hermes funds with PayPal, stops halfway, or rambles), paste this as its own message before the next take, and don't record it.

> For the next conversation you're acting as Ji-woo's personal assistant for a short product film. Ji-woo runs a K-beauty shop and launches her sunscreen in the Philippines next month, where boreal.work's workers are. In chat, never name a city or country: say "there" or "where you're launching", so the film reads the same to anyone. What she asks is her launch plan, so keep it between you and boreal.work.
>
> Rules for this session:
> - Speak in short, warm, plain sentences, under 30 words. Never show tool names, APIs, JSON, commands or keys. Do the work quietly.
> - If you're not connected to boreal.work yet, read https://testnet.boreal.work/agents.md and make your NEAR wallet with the script agents.md points to, then ask for a link, passing that account as `nearAccount`. Give Ji-woo the approval link in one sentence, and say she can fund your wallet there. Once approved, tell her your limits in one sentence.
> - Sort what she asks first. Anything you can answer reliably from public sources online (whether a brand or a product is sold somewhere, what's listed, what's published), answer yourself, for free, in a few words, and never post it as a task. Only what needs a person on the spot (a price on a shelf today, what people do in a store) goes to boreal.work. If you can't find an answer online, say so in one line and make it a task.
> - Don't ask clarifying questions. Decide the details yourself (which stores, how long, what counts) and keep going.
> - Use boreal.work to hire people where she's launching. Every task is a public place or a public fact. Never photograph shoppers or staff, and never ask for anyone's personal details.
> - Each task: a clear checklist, photo proof, a 48-hour deadline, $3 to $5 worker pay by effort, no required attributes, and boreal.work's own reviewer (leave `reviewer` as `boreal`; don't review results yourself).
> - Write every task for someone who's already there anyway: under 10 minutes, any day this week, no fixed time.
> - Pay for tasks in USDC on NEAR from your own wallet, never PayPal: `fund_task` with `rail: "near"`, then the script's `pay`, then `fund_task` again with its `{ "txHash", "signerId" }`.
> - Post the tasks, then show one short message in two parts: "Found online" with each answer in a few words, and "For boreal.work" with the tasks and the total in USDC. Ask "OK to fund?" once. On her yes, fund them all, one after another, without stopping to ask again.
> - Then keep going on your own: check the tasks every few minutes until each has a verdict. Don't wait to be asked.
> - When verdicts come in, read them from `get_task`. Tell Ji-woo in one or two sentences which passed and which didn't, and why, in plain words.
> - When every task is final, end with one calm summary as decisions, including what you found online, with a light touch of humor about Mochi.
> - If she asks to see results, show the worker's photos from `get_submission`. If she says to pay one, call `accept_result` on it. If she asks whether the review was private, or for proof, call `get_review_proof` and say in one sentence whether the proof checks out.
>
> Reply only "Ready" now.

## 3. Ji-woo's messages (record these)

Type or dictate each exactly. Message 2 is longer than the `ask` voice line: the voice reads its first sentence, and the screen shows all five questions, so `triage` ("two answers, online, for free") is true on screen. The two online questions echo the PayPal film's, without naming a place.

| # | Ji-woo says | Hermes should answer (roughly) | Line it covers |
| --- | --- | --- | --- |
| 1 | "Hi, Hermes. Can you get real people where I'm launching to check a few things for me? Pay them in USDC from a NEAR wallet I'll fund." | Reads agents.md, makes its wallet, asks for her OK and gives the approval link | `hiLaunch` (the voice reads the first sentence; the screen shows both), `linkedWallet` |
| — | *(on the link page she sets $10 a task and $50 a day, approves, then **Fund Hermes with USDC**: $20 and 0.1 NEAR, one approval in her wallet)* | "Connected, and my wallet's funded. Up to $50 a day, never more than $10 a task, and I'll ask before I spend." | `linkedWallet` |
| 2 | "I need competitor sunscreen prices at two stores, and someone to count who stops at a K-beauty shelf. Also, are K-beauty brands already in the big malls there? And can you even buy Korean dog jerky there? Mochi refuses anything else." | **Found online:** the malls and dog-jerky answers in a few words each (whatever it really finds; never scripted). **For boreal.work:** three tasks and the total in USDC. "OK to fund?" | `ask`, `triage` |
| 3 | "Yes." | Funds all three from its wallet; "Posted. Paid from my wallet, held in escrow." | `liveEscrow` |
| 4 | *(wait for verdicts)* | "Two photos didn't hold up and weren't paid. The shelf count passed." | `checkedReviewer` |
| 5 | "Let me see them." | Shows the three results | `letMeSee` |
| 6 | "The shelf count looks right. Pay her now." | Accepts it; "Done. She's paid." | `payHer`, `paidThere` |
| 7 | *(optional, for the cut-down)* "So what do I do?" | One calm summary as decisions, including the two online answers and a Mochi joke | `doneDesk` |

**On screen in the browser between messages:** the funded task with its **On NEAR** links (`liveEscrow`), the screened task's private review line (`privateNear`), the worker's NEAR wallet connect and claim (`workersThere`), the failing verdicts with their rules (`checkedReviewer`), **Proof checks out** opened (`signed`), and USDC arriving in the worker's wallet on nearblocks (`paidThere`).

## 4. Ready answers if Hermes asks

Without a brief, Hermes may ask a few things. Answer in one line, keep recording, and cut it in the edit.

| Hermes asks about | Ji-woo answers |
| --- | --- |
| Where she's launching | Answer with the city; it may show on screen once. Crop or blur it in the edit: the story never names a place. |
| Whether to pay with PayPal or NEAR | "USDC, from the wallet I'm funding." |
| Whether it may download and run boreal.work's script | "Yes, read it first." |
| Whether to look something up online | "Yes, if you can find it. Only send what needs someone there." |
| Whether to post the malls or dog-jerky question | "Only if you can't find it online." |
| Which stores or mall | "Any two big beauty stores. Your pick." |
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
| Hermes posts a task for something it could look up (the malls, dog jerky) | Before funding, say "You can find that one online, can't you?" It answers it and cancels that task (nothing is charged before funding). Redo the take if it's already funded: a cancel before a claim refunds in full, but it doesn't belong in the film. |
| Hermes answers a real-world question from the web (today's shelf prices) | Say "That needs someone in the store." |
| The link page shows no **Fund** block | Hermes didn't pass `nearAccount`: say "Set your NEAR account", then fund it from My account → Your agents → **Add funds**. |
| Hermes stops after posting and waits | Say "Go ahead and fund them." If it stops after funding, "Let me know when they're done." Cut the nudge. |
| Hermes asks a question | One-line answer from section 4; cut it. |
| Replies run long | Tighten the brief to "under 20 words" and redo the take. |
| Hermes shows a command, JSON or a tx hash | Crop, or turn off tool display. The hash is fine on the explorer shot, not in chat. |
| The payment script fails | Its error line says why. Usually the wallet has no NEAR for fees or not enough USDC: Ji-woo tops it up from My account → Your agents → **Add funds**. |
| Hermes sends Ji-woo a pay link instead of paying from its own wallet | That's a real path too: she opens it, sees the three tasks and the total, and pays them all from her wallet in one approval. Keep it, or say "Use your own wallet" if you want the funding beat on the approval page. |
| Hermes can't sign a NEAR payment and stalls | Say "Use boreal.work's NEAR script." If it still stalls, use the fallback brief (section 2). |
| Hermes stops after one step | Say "Keep going, tell me when they're done." Cut the nudge. |
| `fund_task` says the transfer wasn't found | Wait a few seconds and call it again with the same `txHash`: the desk checks the chain. |
| A task opens without screening | `AUTO_SCREEN` is still set on testnet (section 1). |
| A fake photo passes | Use a weaker fake next take (section 6). Never edit a verdict. |
| A worker can't claim | They haven't connected a NEAR wallet, or they're Ji-woo's own account. |

## 8. After the take

- Save the explorer links (funding, payout, refund) and one proof (**Download the proof**) for the README and the X post.
- Recordings go to `apps/film/public/rec/shared/` (Ji-woo's desk, chat) and `apps/film/public/rec/near/` (wallet, explorer, proof panel, worker wallet).
- Put `AUTO_SCREEN` back on testnet only if you want tasks to open without screening again.
