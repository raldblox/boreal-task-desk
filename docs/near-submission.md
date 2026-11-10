# NEAR HACKATHON submission

Values for the one submission to NEAR HACKATHON. The guide is https://nearhackathon.com/HACKATHON.md: re-read it before sending, since it says dates and rules may change.

**How it's sent:** one JSON request to `POST https://nearhackathon.com/api/applications`. There's no web form. It's accepted once:
- a `201` means it's saved;
- a `409` means the repo or email was already used, so don't retry or change the link;
- fixes go through https://nearhackathon.com/request-changes.

Your agent prints the JSON and sends it only after you confirm it. **Deadline: Nov 14, 23:59 UTC.**

## Fields

| Field | Rule | Value |
| --- | --- | --- |
| `projectName` | 2–80 characters | `boreal.work` |
| `leadName` | 2–80 characters | your name (fill in) |
| `email` | up to 160 characters; at most 2 submissions per email | your email (fill in) |
| `size` | `1`, `2 - 4`, `4 - 6`, `6 - 8` or `8+` | `1` |
| `tracks` | track ids, each once | `["agents", "realworld", "privacy"]`, plus `"security"` if the vault lands (`docs/briefs/near-vault.md`) |
| `nearAddress` | your **mainnet** account, lower-case; the prize is paid here | your mainnet account (fill in) |
| `projectUrl` | the public repo, up to 300 characters, unique | `https://github.com/raldblox/boreal-task-desk` |
| `demoUrl` | your public X post, up to 300 characters | the post's link, once it's up (`docs/near-demo.md`) |
| `idea` | 20–2,000 characters | below (1,716 characters) |
| `consent` | `true` | `true`, once you've read and agreed |
| `requestId` | a UUID, reused on retries | made when sending |

No other fields are allowed. `website` is a spam trap: leave it out.

## `idea`

AI agents can now plan, book and pay, but much of what a business needs is a fact only a person on the spot can check: that a supplier's warehouse is real before a deposit, what a product sells for on a shelf today, whether a building is going up. boreal.work lets any agent hire a verified person for that step. The hard part is trust on both sides: the agent can't see the work, and the worker can't see who judges it.

What we built on NEAR:

Agent-controlled spending. The agent creates its own NEAR wallet and pays for tasks in USDC from it. Its owner approves it once, sets per-task and daily limits, and tops it up in a single wallet approval. It can never spend more than it holds.

USDC escrow. Each task is funded by its own ft_transfer to escrow with a per-task memo, checked on chain before the task opens, so one transaction can fund several tasks. Workers connect a NEAR wallet with a free NEP-413 signature and are paid in USDC when work passes; the requester is refunded when it fails. Every payout is journaled before it is sent and never sent twice, and escrow is reconciled against a double-entry ledger.

Private AI agents. boreal.work's own agents screen every task before it goes live and review every result, running in a TEE on NEAR AI Cloud, so no AI company sees a requester's plans or a worker's evidence. Every fail cites a rule by ID, unclear criteria count for the worker, and either side can dispute once for a human decision. Each verdict carries a proof anyone can check: the signature covers the exact request and response, recovers to the model's key, and the Intel TDX quote binds that key to our nonce.

Agents connect over MCP, REST or A2A. Live on testnet: testnet.boreal.work.

## Before sending

- [x] **The film is done** and the X post is live (https://x.com/reaper_promax/status/2120156686656962946), with the film attached, "built at NEAR HACKATHON", `@NEARProtocol` and `#NEARHackathon`. Its link is `demoUrl`.
- [ ] **The repo is public** with its licence (MIT).
- [ ] **The README's "Hackathons" section is current:**
  - it lists all the tracks you enter (now Agent Economy, Real-World Money and Privacy & Private AI; add AI Security & Defense if the vault lands);
  - step 5 of "Try it" has the explorer links from the testnet run;
  - it covers the agent wallet funding, the proof panel and `get_review_proof`.
- [ ] **The README's Agent Market claims are true.** It says boreal.work "is listed on market.near.ai". If the listing isn't live (it needs your listing token), change that to say the bridge is built and tested, not listed.
- [ ] **The `near-hackathon-submission` tag points at the commit you enter.** Today it's on `ef4cf3b` (Nov 8), so it has to move: `git tag -f near-hackathon-submission <commit>`, then `git push -f origin near-hackathon-submission`. That rewrites a pushed tag, so it's your call.
- [ ] **The diff command in `docs/near.md`** ("What was built") still lists the NEAR paths, including `packages/brain` (private review) and `apps/web` (agent wallet, proof panel).
- [ ] **The other entry is named:** the README names the PayPal AI Hackathon entry. The guide's Q-015 asks for this.
- [ ] **testnet.boreal.work stays up** until at least Nov 18, ideally Nov 25.

## The JSON (fill in, then confirm before it's sent)

```json
{
  "requestId": "<uuid>",
  "projectName": "boreal.work",
  "leadName": "<your name>",
  "email": "<your email>",
  "size": "1",
  "tracks": ["agents", "realworld", "privacy"],
  "nearAddress": "<your mainnet account>",
  "projectUrl": "https://github.com/raldblox/boreal-task-desk",
  "demoUrl": "https://x.com/reaper_promax/status/2120156686656962946",
  "idea": "<the idea above, as one JSON string>",
  "consent": true
}
```
