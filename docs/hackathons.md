# Hackathons and programs for boreal.work

Researched 2026-10-31. Started from [Shelley's list of 18 hackathons](https://x.com/shelleymaeph/status/2115343542298317231) (Oct 28, 2026), followed each link, then searched Devpost, DoraHacks, ETHGlobal, Colosseum, lablab, Concordium/Encode, Anthropic/Cerebral Valley, World, Coinbase and Philippine/SEA listings.

boreal is already entered in the **Concordium Trusted Agents Hackathon** (final submission Dec 10, 2026 per our notes; one listing says Dec 9, so check the Encode page). Everything below is judged against that commitment.

Rules that decide fit for us:

- **Prior work.** boreal already exists, so "new projects only" rules rule an event out. Most of the good ones allow an existing product if the new work is separated and disclosed.
- **Public repo.** PayPal and NEAR both need a public repository (PayPal also needs an open-source licence). Before going public, check the git history for secrets: `.env.local` points at production.
- **Location.** We're in the Philippines, so in-person events abroad (SF, Mumbai, Salt Lake City) cost travel and are scored lower.

## Ranked shortlist

| # | Event | Deadline | Prize pool | Fit |
|---|-------|----------|-----------|-----|
| 0 | Concordium Trusted Agents (already entered) | Dec 9/10 | not published | 5 |
| 1 | PayPal AI Hackathon | **Nov 12** | $67.5k | 5 |
| 2 | NEAR HACKATHON | **Nov 14** | $250k | 4 |
| 3 | Concordium Grant Program | rolling | not published | 4 |
| 4 | Google Cloud "Agents for Impact": Digital Hackathon | Jan–Mar 2027 | cash, not yet published | 3 |
| 5 | Colosseum (Solana), next online hackathon | likely early 2027 | usually $250k+ | 3 |
| 6 | ETHGlobal Mumbai: Continuity Track + World bounty | Nov 5–7 (in person) | $175k+ | 2 |
| 7 | Flip the Switch (WeMakeDevs × Switch) | Nov 4–7 | $10k | 2 |
| 8 | Vultr Agent Rush (lablab.ai) | Nov 3–8 | $9k + $5k credits | 2 |
| 9 | Autonomous Company Hackathon (Naïve @ YC) | Nov 7–8 (SF) | $100k+ | 1 |

### 0. Concordium Trusted Agents Hackathon (baseline: already entered)

- **Organiser:** Concordium with Encode Club. Online.
- **Dates:** Nov 2 – Dec 9/10, 2026. Weeks 1–3 (Nov 2–18) are workshops on Concordium ID, ZK proofs, the Agent Registry and agent payments. The build period opens Nov 19, the first checkpoint is Nov 22, and the final submission is due Dec 9 or 10.
- **Eligibility:** No Concordium experience needed. Existing agents on other chains may be extended with Concordium identity, so existing products are welcome.
- **Fit 5:** this is boreal's thesis (a verified human behind the work, verified agent behind the money).
- **Takeaway for the others:** the workshop weeks (Nov 2–18) are the window to do PayPal and NEAR without hurting the Concordium build.
- Source: [web3voyager November list](https://web3voyager.com/blog/web3-hackathons-november-2026). I found no official Encode page, so confirm prizes and the exact deadline there.

### 1. PayPal AI Hackathon: "Build what's next with PayPal and AI"

- **Link:** https://paypalaihackathon.devpost.com ([rules](https://paypalaihackathon.devpost.com/rules))
- **Organiser:** PayPal, run by Devpost. Online.
- **Dates:** submissions Oct 1 – **Nov 12, 2026, 12:00 PT** (Nov 13, 03:00 Manila). Judging Dec 1–15, winners around Dec 21.
- **Prizes ($67.5k):** 1st $12k, 2nd $8k, 3rd $5k. Five $5k honourable mentions, including **Best Use of Agentic Commerce**, Best Use of PayPal + AI, Most Impactful and Best Demo Delivery. Sponsor prizes (AG Grid, APIMatic, Bryntum, Channel3, Render) on top. Max one grand or honourable prize plus one sponsor prize per project.
- **Eligibility:** Age of majority. Individuals, teams or organisations. Worldwide except sanctioned countries, Brazil and Quebec; **the Philippines is eligible**. **Existing projects are allowed if "significantly updated" during the submission period** and the update is explained.
- **Required tech:** The PayPal developer platform in sandbox (PayPal, Venmo, Braintree, Hyperwallet, Xoom…) must be *central*, plus any AI tool.
- **Submission:** Working demo (hosted URL or runnable repo), a **public open-source repo with a licence file**, a YouTube video under 3 minutes, and an English description.
- **Judging:** Equal weight on technological implementation, design, potential impact, innovation and presentation, after a pass/fail check on theme and API use.
- **Fit 5:** boreal is agentic commerce with a real payout problem. Workers in the Philippines are paid out, and PayPal and Hyperwallet are real payout rails there. A PayPal integration is also useful to the business beyond the prize.
- **Conflict:** none on dates (it closes before Concordium's build period starts), but it uses the workshop weeks.

### 2. NEAR HACKATHON: "Build Beyond Boundaries"

- **Link:** https://nearhackathon.com ([HACKATHON.md rules](https://nearhackathon.com/HACKATHON.md), [announcement](https://x.com/NEARProtocol/status/2112257967818997891))
- **Organiser:** NEAR Protocol. Online, with no sign-up before submission.
- **Dates:** Nov 1 – **Nov 14, 2026, 23:59 UTC** (Nov 15, 07:59 Manila). Judging Nov 16–18. Results by Nov 18.
- **Prizes ($250k, paid in NEAR, no vesting):** grand prize $55k. Each of 13 tracks pays $10k / $3k / $2k.
- **Eligibility:** Solo or team. **An existing product on another chain is allowed; only the NEAR integration built in the window is judged** (Q-002/Q-004). Code from Oct 19 onward counts. Separate the new work with a branch or `pre-hackathon` / `hackathon-submission` tags and a README section linking the diff (Q-003). Testnet-only is fine (Q-010).
- **Required tech:** Something real on NEAR. No specific integration is mandatory. Hints: NEAR Intents, Chain Signatures, NEAR AI Cloud, function-call keys, [Agent Market](https://market.near.ai/).
- **Submission:** Public repo, a public demo post on X (tagging @NEARProtocol and #NEARHackathon) with video, and one submission that can't be edited.
- **Judging:** Illia Polosukhin, Mert Mumtaz, Eddy Lazzarin, Avichal Garg, Kain Warwick, Haseeb Qureshi and Stepan Gershuni. Claude Code and Codex screen for reproducibility, so the README needs "do X, see Y" steps.
- **Relevant tracks:** Agent Economy (`agents`), Real-World Money (`realworld`), AI Security & Defense (`security`), Autonomous Business (`business`).
- **Fit 4:** very large pool, generous prior-work rule, and the tracks match ("agents that pay for services", "payroll and remittances"). It loses a point because NEAR is a second chain alongside Concordium and the prize is paid in NEAR.
- **Conflict:** none on dates (it ends Nov 14, before Concordium's build period). Read Q-015 if one person also submits another project.

### 3. Concordium Grant Program

- **Link:** https://concordium.com/grant-program
- **Organiser:** Concordium Foundation. Rolling. Focused on financial services and payments, but open to anything that benefits the ecosystem. No amounts or deadlines published.
- **Fit 4:** the natural follow-on to the hackathon, and no conflict. Apply after Dec 10 with the hackathon result, using the official form linked from that page. I found a Google Form via search but couldn't confirm it's official.

### 4. Google Cloud "Agents for Impact": Phase III Digital Hackathon

- **Link:** https://cloud.google.com/resources/agents-for-impact-2026
- **Organiser:** Google Cloud. Phase I is one-day in-person sprints in North America (Oct–Dec). Phase III is an online hackathon, **Jan–Mar 2027**, with rolling submissions, cash prizes and a stage slot at Google Cloud Next '27.
- **Eligibility and rules:** not published yet. Expect Google's agent stack (ADK, Gemini) to be expected or required.
- **Fit 3:** "agents for social impact" fits paid, verified work for Filipino workers, and the timing is after Concordium. It may mean adding a Gemini/ADK agent next to Claude.

### 5. Colosseum, next online hackathon (watch)

- **Link:** https://www.colosseum.com. The Fall 2026 edition ran Sep 28 – **Nov 2**, too late to start now. The cadence is 2–3 five-week online hackathons a year, so the next is likely early 2027 (my inference, not announced).
- **Fit 3:** startup-oriented with accelerator follow-on. Solana only, and its prior-work rules need checking when it is announced.

### 6. ETHGlobal Mumbai (Devcon 8)

- **Link:** https://ethglobal.com/events/mumbai. Nov 5–7, in person, application-based. $175k+ from 12 partners, including a **World** (proof-of-human / AgentKit) bounty. A **Continuity Track** lets an existing project compete if the new work is documented.
- **Fit 2:** World's AgentKit prize ("human-backed agents") is close to boreal, but the event is 5 days away, needs travel to Mumbai, and puts us in a competitor's identity stack during the Concordium event.

### 7. Flip the Switch Hackathon

- **Link:** https://wemakedevs.org/hackathons/switch. WeMakeDevs × DevTools Academy, powered by Switch. Nov 4–7, online, worldwide, teams up to 4. $10k ($2k best business workflow, $2k personal workflow, $100 × 20 OSS contributions, $500 Wispr Flow).
- **Fit 2:** a "post a boreal task from team chat" workflow is a small, legitimate demo, but the prizes are small and the theme is chat workflows, not trust or payments.

### 8. Vultr Agent Rush (lablab.ai)

- **Link:** https://lablab.ai/ai-hackathons/vultr-hackathon. Nov 3–8 online, with an on-site finale in Salt Lake City on Nov 8. $9k cash + $5k credits, and $200 Vultr credits per participant. Agents must run code or drive a browser, sandboxed, and "try to break something" on camera.
- **Fit 2:** wrong shape. It is a red-team/sandbox theme, not a marketplace.

### 9. Autonomous Company Hackathon

- **Link:** [announcement](https://x.com/usenaive/status/2114715211244376391). Naïve at the YC office in San Francisco, Nov 7–8. $100k+ and a guaranteed YC interview for the winners. Requires the Naïve SDK and an agent team running a business.
- **Fit 1:** in person in SF, one week's notice, and a required SDK. The YC interview is the only real draw.

## Ruled out

| Event | Why |
|-------|-----|
| Kiroween 2026 (Devpost, $100k) | **New projects only**, must use Kiro |
| Qloo Agentic Hackathon ($25k) | Closed Oct 30 |
| Nebius × NVIDIA Global AI Hackathon ($50k) | Closed Oct 30 |
| Built with Claude: Japan 2026 | Japan residents only; applications closed Oct 26. Watch for the next global "Built with Claude" round |
| Lexsi AI Safety & Alignment ($30k) | Post-training Aya models, unrelated |
| Walrus × Tatum, World Is Flat (Robinhood Chain), Strike, HSK Chain India, BCH BLAZE, Portaldot, Cortensor #5, Solana University / Dev3pack, Monad Blitz | Chain-specific, unrelated to our stack, small or regional |
| Codegeist 2026 ($120k, Atlassian) | Atlassian apps only |
| UBC 2026 (UT Austin) | A listing mentions an Agentic Payments track; I couldn't confirm it, and it is student-focused |
| CDP Builder Grants, World AgentKit grants | No open 2026 round found; recheck in Q1 2027 |
| Philippines/SEA | No open PH hackathon in Nov–Dec 2026 found (Philippine Blockchain Week and AI Fest PH were mid-2026). AI Engineering Summit Manila (Nov 19) is a conference, useful for networking only |

## Recommendations

1. **Enter PayPal AI (due Nov 12): "pay verified workers through PayPal".**
   - Build a PayPal sandbox payout adapter: escrow funding by PayPal Orders, worker payout by PayPal Payouts.
   - Put it behind the existing ledger and outbox: one ledger entry with an idempotency key (it maps to the Payouts `sender_batch_id`), written before the transfer, exactly like the on-chain path.
   - Keep the payout funding confirmation inside `fundTask`'s checks.
   - Make the demo one loop in under 3 minutes: an agent posts and funds a task, a Filipino worker completes it, Claude reviews it, PayPal pays out.
   - Aim for **Best Use of Agentic Commerce** and **Most Impactful**.
   - State clearly what was added during Oct 1 – Nov 12.
   - Before submitting: make the repo public with a licence (scan history for secrets first) and record the YouTube video.
2. **Enter NEAR (Nov 1–14): Agent Economy + Real-World Money tracks.**
   - Add a NEAR settlement adapter beside `packages/concordium`: an agent funds escrow, and workers get stablecoin payouts via NEAR Intents (testnet is allowed; Intents is mainnet-only, so use tiny amounts or `dry: true` quotes).
   - Optionally list boreal on NEAR's Agent Market so NEAR agents can hire humans.
   - Use a `near-hackathon` branch with `pre-hackathon` / `hackathon-submission` tags and a README section linking the diff, since only the NEAR work is judged.
   - Write the README as "do X, see Y" for the Claude Code and Codex screeners.
   - If time only allows one of the two, choose PayPal. It is the rail Filipino workers already use, and the business keeps it after the prize.
3. **Protect Concordium, then line up 2027.**
   - Freeze side-hackathon work by Nov 18 so the Nov 19 – Dec 10 build period goes fully to Concordium (Agent Registry badge, ID proofs for 18+ and residency, payments).
   - Be open in every submission that boreal is also in the other events (NEAR Q-015 asks for it, and it avoids any "same project" question).
   - After Dec 10: apply to the Concordium Grant Program with the hackathon result, and put Google's Agents for Impact digital hackathon (Jan–Mar 2027) and the next Colosseum round on the calendar.

## Calendar

| Date (2026) | What |
|-------------|------|
| Nov 1 | NEAR opens |
| Nov 2–18 | Concordium workshops (side-hackathon window) |
| Nov 12, 12:00 PT | **PayPal AI deadline** |
| Nov 14, 23:59 UTC | **NEAR deadline** |
| Nov 19 | Concordium build period opens |
| Nov 22 | Concordium first checkpoint |
| Dec 9/10 | **Concordium final submission** |
| Dec 1–21 | PayPal judging and winners |
| Jan–Mar 2027 | Google Agents for Impact digital hackathon; Concordium grant application |
