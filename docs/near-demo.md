# NEAR HACKATHON demo: plan

The film for the X post (the submission's `demoUrl`). It follows the PayPal film's method (story first, screen recordings, a narrator, Remotion overlays), but only the NEAR work is judged, so every beat has to show NEAR doing something.

How to record it, step by step (setup, Hermes's brief, Ji-woo's messages, ready answers, follow-ups): [near-demo-run.md](near-demo-run.md).

Deadline: **Nov 14, 23:59 UTC** (Nov 15, 07:59 Manila). Today is Nov 9.

## What the rules ask of the video

From [HACKATHON.md](https://nearhackathon.com/HACKATHON.md):

- Lead with the user's problem, in a first line a stranger understands.
- Show one complete moment, from a real user action to a visible result. Skip long intros, architecture slides and setup.
- Say what NEAR does in concrete terms, such as "private inference" or "agent-controlled spending". Never a vague "powered by NEAR".
- End with a next step: the demo link, the repo, and a real question.
- The post tags @NEARProtocol and #NEARHackathon, plus @NearBuilders and @NearLegion for reach.
- No length limit is set, but **X caps uploads at 2:20** for accounts without Premium. Aim for **2:00–2:15**, so it plays natively in the post.
- Judges are Illia Polosukhin, Mert Mumtaz, Haseeb Qureshi and others: crypto-native, so on-chain proof (explorer links, a checked TEE signature) counts for more than polish.

## What the PayPal film did, and what carries over

| PayPal film (2:59) | NEAR film |
| --- | --- |
| Ji-woo in Seoul; her agent Hermes; workers in Manila. Theme: reach | Same world and characters, so the two films read as one product. Theme: discretion |
| PayPal holds, PayPal Payouts | USDC on NEAR: an `ft_transfer` into escrow, and a payout to the worker's wallet, each shown on the explorer |
| Hermes reviews, and catches two fake photos | The **private reviewer on NEAR AI Cloud** reviews inside a TEE and catches the fake, and its signature checks out |
| 15 voice lines, 2:59 | 16 lines: 9 reused, 5 new shared, 2 NEAR-only; about 2:10 |
| Remotion `Final` over a Clipchamp cut | A new `NearFinal` composition with the same Glass, Pill and Camera parts, a NEAR tone, and the same music bed |

## The story: "Many hands, no extra eyes"

The PayPal film was about **reach**: Ji-woo is in Seoul, her answers are in Manila, and boreal.work gives her many hands there.

The NEAR film is the same story, told again for **discretion**. What Ji-woo asks is her strategy: competitor prices and who stops at a K-beauty shelf, before her own launch. In the PayPal film, an AI read all of it. Here:

- her tasks and the workers' photos are read by **private AI** on NEAR AI Cloud, where no AI company can see them;
- every verdict from that private AI comes back signed, so anyone can check it;
- the money moves in USDC on NEAR, from Hermes's own wallet to the worker's.

The callback at the end changes from "she had many hands" to "**she had many hands, and no extra eyes.**"

**Wording:** say "private AI", NEAR's own term (its docs say "private inference"). The TEE stays on screen, in the proof panel and its overlay, not in the voice.

Note what the film must not claim: boreal.work's own operators can still open a submission (privacy page). So the line is "no AI company can see them", never "not even boreal work".

### The voice-over: one spine for every film, one chain slot

The voice never names a chain except in one **chain slot**. Every other line is chain-neutral, so the same recordings serve the NEAR film now and the Concordium film in December. The chain shows on screen instead: Glass cards for the token, the explorer and the transaction hash, and the end card.

Neutral wording rules:

- "her own wallet", never "her NEAR wallet"
- "digital dollars", never "USDC" (NEAR pays in USDC, Concordium in USDR)
- "escrow" and "the reviewer", never where they run
- "no extra eyes" works for both: on NEAR it's private AI, on Concordium it's ID without showing a document

Same voices (James for the narrator, Rina for Ji-woo). `clarify` is cut to fit under X's 2:20.

| # | Line | Status | Text |
| --- | --- | --- | --- |
| 1 | `intro` | reuse | "Every question has a place where the answer lives. Ji-woo's answers are in Manila. She's in Seoul." |
| 2 | `hi` | reuse | "Hi, Hermes. Can you get real people in Manila to check a few things for me?" |
| 3 | `linkedWallet` | new, shared | "Her agent connects to boreal work through MCP, and pays from its own wallet, in digital dollars. [pause] Ji-woo sets the limits." |
| 4 | `ask` | reuse | "I need competitor sunscreen prices at two stores, and someone to count who stops at a K-beauty shelf." |
| 5 | `triage` | reuse | "What an agent can find, Hermes finds itself… What only a person can see goes to boreal work." |
| 6 | `liveEscrow` | new, shared | "Then three small jobs cross the sea, [pause] and every dollar waits in escrow until the work passes." |
| 7 | **chain slot** | new, per chain | See below. |
| 8 | `workers` | reuse | "In Manila, people are already out… a few minutes of paid work." |
| 9 | `checkedReviewer` | new, shared | "But not every answer is honest. [pause] The reviewer checks the proof, and two photos don't hold up." |
| 10 | `letMeSee` | reuse | "Let me see them." |
| 11 | `payHer` | new, shared (Rina) | "The shelf count looks right. Pay her now." |
| 12 | **chain slot, part 2** | new, per chain | See below. |
| 13 | `paid` | reuse | "One passes. And in Manila, a worker gets paid for being in the right place." (The overlay shows the token arriving in her wallet.) |
| 14 | `doneEyes` | new, shared | "Ji-woo never left Seoul. [pause] She had many hands, [pause] and no extra eyes." |
| 15 | `close` | reuse | "Agents are learning to buy, book and decide… the moment the work is done." |
| 16 | `tagline` | reuse | "boreal work. AI agents can think. We give them hands." |

**The chain slots** (the only lines that name a chain):

| Film | Line 7 | Line 12 |
| --- | --- | --- |
| **NEAR (now)** | `privateNear`: "But these questions are Ji-woo's plans for a launch. [pause] So they're read by private AI on NEAR AI Cloud, [pause] where no AI company can see them." | `signed`: "Every verdict from that private AI comes back signed, [pause] so anyone can check where it came from." |
| **Concordium (December, draft)** | `provenConcordium`: "And every worker has proven who they are, [pause] her age, her country, [pause] with Concordium ID, without showing anyone a document." | `trail`: "Every step is written to a trail anchored on Concordium, [pause] so anyone can check the money went where it should." (Or drop it and let line 13 follow line 11.) |

**What this costs in voice generations:**

- Now: 5 shared lines (`linkedWallet`, `liveEscrow`, `checkedReviewer`, `payHer`, `doneEyes`) plus 2 NEAR lines (`privateNear`, `signed`). That's 7 generations.
- December: only the 1–2 Concordium lines. The other 14 lines are already recorded.
- If `paid` sounds too thin next to the token on screen, the fallback is one more shared line: "And in Manila, a worker is paid in digital dollars, straight to her own wallet."

The NEAR film still says what NEAR does in plain words, which the rules ask for: line 7 names NEAR AI Cloud, and the overlays and the X post name USDC on NEAR.

Line 11 matches the product: the reviewer has already passed it, and Ji-woo accepts the pass early, which makes it final and pays the worker. She can't overrule a fail, so she doesn't try.

### Footage for later films

The same applies to the footage. Keep the neutral shots apart from the chain-specific ones, so the Concordium cut only re-records the chain shots: the wallet signing, the explorer, ID verification. Put recordings under `apps/film/public/rec/shared/` and `apps/film/public/rec/near/`.

### Footage

- **Reuse** from the PayPal cut: Ji-woo in Seoul, Hermes's chat and triage, the Manila street scenes and the workers.
- **New recordings** (NEAR only):
  - Hermes's wallet signing the `ft_transfer`, and the task turning **Funded** (line 3, line 6);
  - the transfer on the testnet explorer, with the task in the memo (line 6);
  - "Reviewed privately on NEAR AI Cloud" on the screened task (line 7);
  - a worker connecting her NEAR wallet and claiming (line 8);
  - the fake photo failed with a rule cited, and the honest one passed (line 9);
  - the **proof panel**: the signer recovered and the attestation matching, each ✓ (line 12);
  - USDC arriving in the worker's wallet, with the explorer (line 13).
- Drop every PayPal shot (PayPal Saved, PayPal holds, PayPal Payouts) so nothing on screen contradicts the voice.

If the Agent Market listing is live by Nov 11, add a 4-second cutaway after line 3: "Or any NEAR agent can hire us on Agent Market."

## Gaps to close before filming

The product has the pieces, but some aren't visible enough to film:

1. ~~**Explorer links in the UI.**~~ Done: the posted task's sidebar lists the funding, payout and refund on nearblocks (or CCDScan); the worker's task page links its payment; earnings list recent on-chain payouts. (Lines 6 and 13.)
2. ~~**A "check the proof" view.**~~ Done: under a private verdict, "Proof checks out" opens the three checks with ✓ (the signature covers this exact review, it was signed by the model's own key, that key lives inside a TEE), the model and completion, a download of the proof, and a link to NEAR's verifier. (Line 12.)
3. **A full testnet run with real transactions:** fund in USDC from a wallet, screen, claim with a NEAR-connected worker, one failing and one passing submission, payout, and a refund. Keep the explorer links for the README and the post.
4. **The fake-photo case** on the private reviewer: GLM-5.3-flash with the "copy the text exactly" rule. Re-run it on the demo photos so line 9 is real, not staged.

## Production, in the same way as the PayPal film

1. **Script**: add the 7 new lines to `apps/film/src/vo-script.ts` (or a `NEAR_VO_SCRIPT` beside it), the same voices through ElevenLabs on Runway. Every generation spends credits, so lock the text first; reused lines need nothing.
2. **Recordings**: desktop at 1920×1080, the pane at a fixed size, testnet.boreal.work, real wallets (Meteor on testnet). One take per beat into `apps/film/public/rec/near/`.
3. **Rough cut** in Clipchamp, against the VO.
4. **Final**: a `NearFinal` composition in Remotion: Glass cards for the on-chain facts (amount, memo, tx hash, signer), a NEAR-green Pill tone, the music bed, the payout chime on line 13. End card says what's illustrative, as the PayPal film's did.
5. **Export** at 1080p, under 2:20, and a 16:9 thumbnail.

## The X post (a draft; you post it)

HACKATHON.md's tips, applied: the first line is the problem in words a stranger gets; the video shows one complete moment (Ji-woo asks, a worker in Manila is paid); NEAR's role is said concretely (agent-controlled spending, USDC escrow and payouts, private inference); and it ends with the demo, the repo and a real question. It must say it was built at NEAR HACKATHON and tag @NEARProtocol and #NEARHackathon; @NearBuilders and @NearLegion are optional, for reach.

A thread of three, each under X's 280 characters as X counts them (a link counts as 23). Attach the film to the first post.

**1/3** (with the video)

> AI agents can pay anyone in seconds. They still can't stand in a store in Manila.
>
> Built at #NEARHackathon: agents hire verified people on boreal.work, pay in USDC from their own NEAR wallet, and private AI on NEAR AI Cloud checks the proof.
>
> @NEARProtocol

**2/3**

> What NEAR does here:
> - The agent pays from its own wallet. Its owner funds it once, and it can't spend more.
> - USDC escrow and payouts on NEAR, each on nearblocks.
> - Private inference: no AI company sees the task or the photos, and each AI verdict has a signed TEE proof.

**3/3**

> Try it on testnet: testnet.boreal.work
> Agent guide: testnet.boreal.work/agents.md
> Code: github.com/raldblox/boreal-task-desk
>
> What would you have an agent hire a person for?
>
> @NearBuilders @NearLegion

Before posting:
- The repo is public and its README has the "NEAR HACKATHON" section with "do X, see Y" steps.
- testnet.boreal.work stays up until at least Nov 18, ideally Nov 25.
- If the vault lands in time (`docs/briefs/near-vault.md`), change 2/3's first point to: "The agent pays through a vault with spending limits on chain, using a key that can do nothing else."
- The post's link is the submission's `demoUrl`. A wrong link is fixed at https://nearhackathon.com/request-changes, never by submitting again.

## Tracks

The submission takes several track ids. The private reviewer now fits a third:

- `agents` (Agent Economy): Hermes spends its own USDC to hire people; agents also earn as workers.
- `realworld` (Real-World Money): stablecoin payouts to workers, escrow reconciled against a ledger, refunds.
- **`privacy` (Privacy & Private AI)**: its hints are "PRIVATE AI, TEE, NEAR AI CLOUD". That is exactly the reviewer. Add it, and update `docs/near.md`, which currently says two tracks.

## Schedule

| Day (Manila) | Work |
| --- | --- |
| Nov 9–10 | Close gaps 1 and 2 (explorer links, proof view); lock the script |
| Nov 11 | Full testnet run (gap 3), fake-photo check (gap 4); generate the VO |
| Nov 12 | Record every beat; rough cut. (PayPal's deadline is also Nov 12, 12:00 PT, so finish anything left there first.) |
| Nov 13 | `NearFinal` overlays, music, export; README "do X, see Y" pass with the new explorer links |
| Nov 14 | Cut the `near-hackathon-submission` tag; the owner posts on X; submit (only after the owner confirms the JSON). Leave a day of slack before 23:59 UTC. |

## The owner's part (never done for them)

- The X post itself, published from their account.
- The mainnet NEAR account for the prize, the team details and the consent.
- The single submission, after reading the printed JSON.
- Rotating the NEAR Builders key that was exposed earlier.
