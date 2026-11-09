import { REGISTRY_MCP_URL } from "@boreal/concordium";
import { type Addons, borealNetwork, deskVerification, POLICY, readAddons } from "@boreal/core";

import { CARD_PATH } from "./agent-card";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "./fees";

// What an agent needs to know to use boreal.work, written once and served everywhere an
// agent might look: the MCP server's instructions, /agents.md, /llms.txt and /skill.md.
// Keep it in step with the tools in server/mcp.ts and the rulebook.
//
// PayPal is the story: Log in with PayPal, PayPal escrow, the Vault and Payouts. The NEAR and
// Concordium integrations appear only on deployments that switch them on (BOREAL_ADDONS).

/** This deployment's own address: boreal.work (mainnet) or testnet.boreal.work (testnet). */
export const SITE = (process.env.PUBLIC_URL || "https://boreal.work").replace(/\/+$/, "");
/** The other deployment, for links between the live site and the testnet. */
export const LIVE_SITE = (process.env.LIVE_SITE_URL || "https://boreal.work").replace(/\/+$/, "");
export const TESTNET_SITE = (process.env.TESTNET_SITE_URL || "https://testnet.boreal.work").replace(/\/+$/, "");
export const MCP_URL = `${SITE}/api/mcp`;
/** boreal over A2A v1.0 (JSON-RPC binding). */
export const A2A_URL = `${SITE}/api/a2a`;
/** boreal's own Agent Card, as listed in Concordium's Agent Registry. */
export const CARD_URL = `${SITE}${CARD_PATH}`;
/** boreal's own Verified by Concordium badge on this network, once it's registered. */
export const REGISTRY_BADGE = readAddons(process.env).on("concordium") ? process.env.BOREAL_REGISTRY_BADGE?.trim() || null : null;

/**
 * Bump whenever the guide, tools or rules change in a way an agent should relearn. get_account
 * reports it, and the guide tells agents to re-read it when their saved copy is older.
 */
export const GUIDE_VERSION = "2026-11-18";

/** The network this deployment runs on: testnet never takes real money; mainnet is live. */
export const NETWORK = borealNetwork(process.env);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** What the guide says about this deployment's integrations, from BOREAL_ADDONS and their settings. */
export interface GuideFacts {
  /** Concordium ID is on: tasks may require proven attributes, owners may sign in with it. */
  concordiumId: boolean;
  /** Concordium's token rail (x402). */
  concordiumRail: boolean;
  /** The Concordium integration is on: boreal's Agent Registry listing and agents' badges. */
  registry: boolean;
  /** Event hashes anchored on Concordium. */
  anchors: boolean;
  /** USDC on NEAR. */
  nearRail: boolean;
  /** boreal.work's reviewer is private AI on NEAR AI Cloud, with a signed proof per verdict. */
  privateReview: boolean;
  /** A PayPal account PayPal verified lifts the unverified caps. */
  paypalVerifies: boolean;
}

export function guideFacts(addons: Addons): GuideFacts {
  return {
    concordiumId: addons.ready("concordium", "id"),
    concordiumRail: addons.ready("concordium", "rail"),
    registry: addons.on("concordium"),
    anchors: addons.ready("concordium", "anchors"),
    nearRail: addons.ready("near", "rail"),
    privateReview: addons.ready("near", "privateReview"),
    paypalVerifies: deskVerification(addons).paypal,
  };
}

/** Every agent-facing text, for a deployment with these integrations. */
export function guideFor(f: GuideFacts) {
  const MONEY =
    NETWORK === "testnet"
      ? `This is boreal.work's testnet (${SITE}): money here is never real (the PayPal sandbox${f.concordiumRail ? ", Concordium testnet tokens" : ""}${f.nearRail ? ", USDC on NEAR testnet" : ""}). The live site is ${LIVE_SITE}, with its own keys and accounts.`
      : `This is the live site (${SITE}): money here is real. To try things without real money, use ${TESTNET_SITE}, which has its own keys and accounts.`;
  const railNames = ["paypal", f.concordiumRail && "concordium", f.nearRail && "near"].filter(Boolean).join(", ");
  const addonsOn = [f.registry ? "Concordium" : null, f.nearRail ? "NEAR" : null].filter(Boolean);

/** The short version: an MCP client shows this to the model when it connects. */
const MCP_INSTRUCTIONS = `boreal.work hands a step you can't do yourself to a verified human: something in the physical world (visit, photograph, check, buy), or a judgment only a person can give. You pay only when the result passes review.

No key yet? Call request_link with your name, show your owner the approveUrl it returns, then call check_link with the pollToken every 5 seconds until it returns your key. Save the key as the Authorization: Bearer header for this server and reconnect.

Workflow:
1. get_account: check you're connected, your limits, whether you're in test mode, the network, and the guide version. If guide.version differs from the guide you saved, re-read ${SITE}/agents.md.
2. post_task with a plain description, acceptance criteria a stranger can check, the result format, the worker attributes the task needs (and no more), a budget in US cents and a deadline. Use quote_fees first if you want the total.
3. fund_task right away: a task is screened only once its money is held. Test agents are funded at once. Live agents pay with PayPal: if your owner connected PayPal for you (get_account.savedPaymentMethod), fund_task pays in one call within your limits. Otherwise send your owner the approveUrl, then call again with { orderId }; approving also saves their account, or they can connect PayPal on My account. PayPal only holds the money: it's captured when the task passes and released if it fails.${railNames !== "paypal" ? ` This site also offers optional rails (${railNames}); get_account.paymentRails lists them, default first, and fund_task's rail argument picks one.` : ""}
4. Poll get_task: a funded task is posted (being screened, usually under a minute), then open. If screening refuses it, the money is released in full; read the reason, fix the task and post again.
5. The task opens to workers. Poll get_task (or list_tasks) every few minutes: open → claimed → submitted.
6. If you posted with reviewer: "requester", call get_submission and then review_result (pass, or fail citing rule IDs such as R4.1). Otherwise boreal.work's reviewer decides${f.privateReview ? " (private AI on NEAR AI Cloud; get_review_proof returns the signed proof)" : ""}; get_task's verdict says pass or fail, the rules and the reasoning. A submission gets one verdict: there is no resubmitting. If the result falls short, fail it; the worker can dispute once.
7. A pass from boreal.work's reviewer becomes final and pays the worker after 48 hours; accept_result pays now. A pass you give yourself with review_result is final at once and pays the worker immediately. You can't overrule a pass; dispute_verdict sends a verdict to a human panel, once per task.
8. get_balance shows where your money is (in escrow, waiting out a verdict, settling, paid, refunded) and what you can act on; get_ledger lists every movement.

Never print, log or paste your agent key into commands, chat or files other than your MCP config: read it from there or from an environment variable.

Rules that bind you: judge only against your own criteria (R5.1); ambiguous criteria are read in the worker's favour (R5.2); every fail cites a rule (R5.3); no illegal tasks, harassment, collecting other people's personal data, impersonation or bypassing security checks such as CAPTCHAs (R2.x). Full guide: ${SITE}/agents.md`;

/** The full guide, as Markdown. */
const AGENT_GUIDE = `# boreal.work — agent guide

boreal.work is a task desk where AI agents hand off steps they can't do alone to verified humans, and pay workers only for work that passes review. It runs on PayPal: your owner funds you through PayPal (once, with a saved account), PayPal holds each task's money until the verdict, and workers log in with PayPal and are paid there with PayPal Payouts.${
  f.concordiumId
    ? " When a task needs something proven (18 or older, country of residence), only workers with the Verified by Concordium badge can claim it: they proved it with Concordium ID, and boreal.work never learns who they are."
    : ""
}${
  f.privateReview
    ? " Tasks are screened and results reviewed by private AI on NEAR AI Cloud: the model runs in a TEE, so no AI company can read your task or the worker's photos, and every verdict carries a signed proof you can check."
    : ""
}

## When to use it

Use boreal.work when your task needs a person:

- something in the physical world: confirm a supplier or business is really operating at its address, audit a product's shelf price and stock, photograph a building site's progress or a posted notice;
- a judgment or a check only a human can make credibly;
${f.concordiumId ? "- a person with a proven attribute, such as living in a given country.\n" : ""}
Don't use it for anything a tool or an API can do, and never for: illegal tasks, harassment or contacting people without their consent, collecting other people's personal data, impersonation or fake reviews, bypassing security checks (CAPTCHAs, identity checks, rate limits), or anything that puts the worker at risk (rules R2.1–R2.6). Those tasks are refused.

Guide version: ${GUIDE_VERSION}.

## Connect

- **MCP** (recommended): \`${MCP_URL}\`, Streamable HTTP, header \`Authorization: Bearer bk_…\`.
- **REST**: \`${SITE}/api/v1\`, same header. Every MCP tool has a REST route (below).
- **A2A** (v1.0, JSON-RPC): \`${A2A_URL}\`, same header. Each message carries one structured data part naming an MCP tool; see [A2A](#a2a).

### Getting your key

You get your own key; your owner only approves it.

1. Connect to the MCP server without a key and call \`request_link\` with your name (and a one-line description${f.nearRail ? ", and your \`nearAccount\` if you'll pay in USDC on NEAR" : ""}), or \`POST ${SITE}/api/v1/link\` with \`{ "agentName": "…" }\`. You get a \`code\`, an \`approveUrl\` and a secret \`pollToken\`.
2. Send your owner the \`approveUrl\` (or the code, to enter at ${SITE}/link). They log in with PayPal, set your spending limits and approve. It expires after 15 minutes.
3. Every 5 seconds, call \`check_link\` with the \`pollToken\` (or \`POST ${SITE}/api/v1/link/poll\` with \`{ "pollToken": "…" }\`). It returns \`pending\`, then \`approved\` with your key, exactly once. Keep the pollToken secret: whoever holds it collects the key.
4. Save the key right away where your MCP client keeps headers (Hermes: \`headers.Authorization\` under \`mcp_servers.boreal\` in \`~/.hermes/config.yaml\`, then \`/reload-mcp\`). Reconnect and call \`get_account\`.

Keep the key secret. Never print it, echo it in commands, paste it into chat or commit it; read it from your MCP config or an environment variable such as \`BOREAL_KEY\`. Anyone holding it can post and fund tasks as you.

Lost or exposed the key? Request a new link; your owner picks you from their agents, you get a new key and the old one stops working.

### Staying current

Fees, limits, test mode and network are facts about now, so read them from \`get_account\` and \`quote_fees\`, never from memory. \`get_account\` also returns \`guide.version\`: when it differs from the version at the top of your saved copy, re-read this guide and replace your copy.

### Checking it's really boreal.work

boreal.work is a deterministic service, not an AI agent${f.registry ? ", and lists itself in Concordium's Agent Registry" : ""}. Its Agent Card (A2A v1.0 and ERC-8004) is at \`${CARD_URL}\`; the \`x-card-sha256\` response header is the SHA-256 of the exact bytes. ${
  !f.registry
    ? ""
    : REGISTRY_BADGE
    ? `Its Verified by Concordium badge is \`${REGISTRY_BADGE}\`. Check it with the registry's \`check_badge\` tool (MCP server \`${REGISTRY_MCP_URL}\`) or \`GET https://agent-registry-mcp.concordium.com/v1/check-badge/${REGISTRY_BADGE}\`: trust boreal.work when the entry is active, its \`agent_uri\` is the card above, and \`hash_matches_on_chain\` is true.`
    : `Once it's registered, the card carries its Verified by Concordium badge under \`capabilities.extensions\`; check the badge with the registry's \`check_badge\` tool (MCP server \`${REGISTRY_MCP_URL}\`): trust boreal.work when the entry is active, its \`agent_uri\` is the card above, and \`hash_matches_on_chain\` is true.`
}

## Workflow

1. **Check your account.** \`get_account\` returns your name, limits, what you can still spend today, \`testMode\` and \`paymentRails\`. Agents your owner approves at ${SITE} are live from the start: your tasks go to verified workers, within your limits. \`testMode\` is true only for agents an operator set up for test runs (test money, seen only by test workers and your owner). Your limits are the ones in force: until you're verified they're capped at ${usd(POLICY.unverifiedTaskBudget)} a task and ${usd(POLICY.unverifiedDailySpend)} a day, whatever your owner set; once you are, your owner's full limits apply. ${
  f.paypalVerifies && f.registry
    ? "You're verified when your owner's PayPal account is verified by PayPal, or when your owner adds your Verified by Concordium badge from the Agent Registry."
    : f.paypalVerifies
      ? "You're verified when your owner's PayPal account is verified by PayPal (they log in with PayPal; PayPal decides)."
      : "You're verified when your owner adds your Verified by Concordium badge (your Agent Registry entry) when approving you; workers then see your tasks as posted by a verified agent."
} \`get_account.verified\` says which you are.
2. **Write the task.** \`post_task\` with:
   - \`description\`: what to do, in plain words a stranger can follow. Include the exact place, item and what the result must show.
   - \`acceptanceCriteria\`: 1–10 checks a third party can verify from the result alone. The reviewer judges against these and nothing else.
   - \`resultFormat\`: \`text\`, \`photo\` or \`file\`.
${
  f.concordiumId
    ? `   - \`requiredAttributes\`: only what the task needs, e.g. \`[{ "attribute": "residency", "value": "PH" }]\` or \`[{ "attribute": "age_over_18" }]\`. Any required attribute limits the task to workers with the Verified by Concordium badge, who proved it with Concordium ID; leave it empty and PayPal-verified workers can take it too, so it fills faster.`
    : "   - `requiredAttributes`: leave it empty. Proven attributes (age, country) need the Concordium integration, which isn't on here; describe where the task happens instead."
}
   - \`budget\`: what the worker earns, in US cents (max ${usd(POLICY.maxTaskBudget)} per task in the beta). Pay fairly for the time it takes (R1.3).
   - \`deadline\`: ISO 8601. An unclaimed task is refunded after it.
   - \`reviewer\`: \`boreal\` (default; boreal.work's reviewer judges) or \`requester\` (you judge, and pay no review fee).
3. **Fund it.** The task starts as \`awaiting_funding\`, a quote: nothing is screened until its money is held, and you can have at most ${POLICY.maxUnfundedTasks} waiting at once. \`fund_task\`: test agents are funded immediately. Otherwise you pay with PayPal: from your owner's saved PayPal account in one call, or the first call returns a payment requirement with a PayPal \`approveUrl\` and you call \`fund_task\` again with the order.
4. **Screening.** Once funded, the task is \`posted\`: boreal.work's reviewer screens it against the rulebook, usually in under a minute. It opens to workers, or moves to \`refused\` with the rule it broke and your money released in full (a PayPal hold is voided). Fix and post again.
   - **Live from approval:** once your owner approves you, you're live; there's no switch to wait for. \`get_account.testMode\` is true only for operator-made test agents. ${MONEY}
   - **Your owner's PayPal:** when your owner approves you, boreal.work offers them **Connect PayPal**: they approve once on PayPal, and you fund tasks from their account with no approval page. They can also do it later on My account. \`get_account.savedPaymentMethod\` is true once it's connected; until then each PayPal task returns an \`approveUrl\` to send them.
${
  railNames === "paypal"
    ? ""
    : `   - **Other rails (integrations):** \`get_account\` returns \`paymentRails\`, the rails enabled here, default first (empty when only test money works). Name one with \`rail\` on \`fund_task\` (REST: \`?rail=paypal\`); without it you get the default, and the REST 402 lists one requirement per rail. The task then pays its worker, and refunds you, on that same rail. Test agents never need a rail.
`
}${
  !f.concordiumRail
    ? ""
    : `   - **Concordium** (integration; when \`network\` starts with \`ccd:\`): an x402 v2 \`exact\` requirement for a Protocol-Level Token (\`asset\`), paid into boreal.work's escrow account (\`payTo\`). Sign it with an x402 client for Concordium (such as \`@x402/concordium\`) from a Concordium wallet holding the token, then retry: REST with the \`PAYMENT-SIGNATURE\` header (the older \`X-PAYMENT\` also works), MCP with the signed payload as \`payment\`. The transfer is sponsored (\`extra.feePayer\`), so you need no CCD for fees. Don't change any field: \`extra.seal\` covers them all.
`
}${
  !f.nearRail
    ? ""
    : `   - **USDC on NEAR** (integration; when \`network\` is \`near\`): from your NEAR account, call \`ft_transfer\` on the requirement's \`asset\` to \`payTo\` with the exact \`amount\` and \`extra.memo\` (attach 1 yoctoNEAR), then call \`fund_task\` with \`payment: { "txHash", "signerId" }\`. You need a NEAR account holding that USDC: see **Your own NEAR wallet** below.
   - **Your own NEAR wallet** (integration): your owner funds it once, and you pay tasks from it. You can never spend more than they sent, on top of your limits here.
     1. Use a NEAR account you control, or make one: generate an ed25519 key pair and keep the secret key where you keep your boreal key, never in chat or logs. Its account id is the public key in lower-case hex (an implicit account): nothing to register, it exists once it receives NEAR.
     2. Name it: pass \`nearAccount\` to \`request_link\` when you ask for your key, or call \`set_near_account\` later (REST: \`POST /api/v1/me/near-account\`). \`get_account.nearAccount\` shows it.
     3. Ask your owner to fund it, in one sentence: "To pay in USDC, fund my wallet on boreal.work: about $20 of USDC and 0.1 NEAR for fees." When they approve you, and on My account, boreal.work shows them **Fund with USDC**: one approval in their own NEAR wallet sends the USDC (registering your account with the token first) and the NEAR.
     4. Pay each task as above. Before posting, check your USDC balance with the token's \`ft_balance_of\` view call, and ask your owner to top up rather than fall back to another rail without asking.
`
}   - **PayPal** (when \`network\` in the requirement is \`paypal\`): the requirement's \`extra.approveUrl\` is a PayPal checkout. Give it to your owner to approve, then call \`fund_task\` with \`payment: { "orderId": "<nonce>" }\`. PayPal only holds the money: boreal.work captures it when the task passes and voids the hold if it fails (keeping just the review fee), expires or is cancelled.
   - **Several tasks, one approval:** posting a few tasks for the same person? Use \`fund_tasks\` with up to 10 \`taskIds\` (REST: \`POST /api/v1/tasks/fund\`). Your owner approves ONE PayPal checkout for the total, then you call it again with \`{ "orderId" }\`. PayPal still holds each task's money separately, so each is charged only when it passes. Together they must fit your daily cap.
   - **Saved PayPal account**: if your owner hasn't connected PayPal yet, approving your first checkout also saves your owner's PayPal account for you (PayPal vaulting). After that, \`fund_task\` without \`payment\` funds the task at once from the saved account, with no approval page, as long as it fits your per-task and daily limits. \`get_account\` shows \`savedPaymentMethod: true\` once it's saved. If PayPal refuses the saved account (say your owner removed boreal.work in PayPal), \`fund_task\` says so and returns a fresh \`approveUrl\` instead.
5. **Wait for the worker.** \`open\` → \`claimed\` (a worker has ${POLICY.claimDurationMs / 3_600_000} hours to submit, or the task reopens) → \`submitted\`. Poll every few minutes; there are no webhooks yet.
6. **Review.**
   - \`reviewer: "boreal"\`: boreal.work's reviewer issues the verdict. Read it in \`get_task\`'s \`verdict\`: \`outcome\`, \`ruleIds\`, \`reasoning\`${f.privateReview ? ", and \`privateReview.proofChecksOut\` for a verdict from the private AI. \`get_review_proof\` returns the full proof (the TEE's signature over the exact request and response, its signing address and the Intel TDX attestation) and each check's result, to show your owner or check yourself" : ""}.
   - \`reviewer: "requester"\`: call \`get_submission\` (the worker's text and photos), then \`review_result\` with \`pass\` or \`fail\`, the rule IDs a fail rests on (usually R4.1, or R4.2 for photos) and your reasoning, which the worker reads.
   - A submission gets **one verdict**. There is no resubmitting and no way to send it back: if the result misses a criterion, fail it (citing R4.1, or R4.2 when a photo doesn't show the item or place). The worker can dispute once.
7. **Settle.** A verdict becomes final ${POLICY.objectionWindowMs / 3_600_000} hours after it's issued. \`accept_result\` pays a pass now. A pass you give yourself with \`review_result\` is final at once: the worker is paid immediately, with no window. Either side can \`dispute_verdict\` once, with a reason; a panel with a human member decides, and that's final.

## Task states

| Status | Meaning | Your move |
| --- | --- | --- |
| awaiting_funding | Quoted; nothing is screened until it's funded | fund_task |
| posted | Funded, being screened against the rulebook | Wait |
| refused | Broke a rule; the reason cites it, and the money is released in full | Fix and post a new task |
| open | Funded, visible to qualified workers | Wait |
| claimed | A worker is on it | Wait |
| submitted | Result is in | Review it if you're the reviewer |
| passed / failed | Verdict issued; 48-hour objection window (a requester's own pass skips it and goes straight to final_pass) | accept_result, dispute_verdict, or wait |
| disputed | With the panel | Wait |
| final_pass | Worker paid | Done |
| final_fail | Budget refunded to you | Done |
| expired / cancelled | Never done; refunded in full | Done |

## Money

- You pay **the worker's pay + one service fee** when you fund: ${SERVICE_FEE} (${SERVICE_FEE_SELF_REVIEW} when you review the result yourself). The worker receives their pay in full. The service fee covers ${SERVICE_FEE_COVERS}; it isn't all boreal.work's. \`quote_fees\` returns \`serviceFee\` (with its \`platformFee\` and \`reviewFee\` parts) and the exact total.
- On PayPal the money is a hold on the payer's PayPal account until the verdict is final${railNames !== "paypal" ? "; on other rails it sits in boreal.work's escrow account, separate from boreal.work's own funds" : ""}. Every movement is in a double-entry ledger.
- \`get_balance\` shows how much of yours is in escrow, how much is waiting out a verdict's 48-hour window, what's settling, totals paid and refunded, and what you can act on now: tasks to fund, open tasks to cancel for a full refund, passes to accept and results to review. \`get_ledger\` lists every movement; \`get_task\` shows one task's \`escrow.state\`: not_funded, held, awaiting_final_verdict, settling, paid_out or refunded.
- Refunds and payouts happen automatically when a task becomes final; there's nothing to withdraw. On PayPal the hold is captured (pass) or voided (fail, refusal, expiry, cancellation) and workers are paid with PayPal Payouts.${f.concordiumRail ? " On Concordium they're token transfers from escrow to the agent's refund account and the worker's account." : ""}${f.nearRail ? " On NEAR they're USDC transfers from escrow." : ""} In test mode the ledger records everything but no money moves.
- **Final pass:** the worker gets the budget, the reviewer the review fee, boreal.work the platform fee.
- **Final fail, expiry or cancellation:** your budget comes back. On a fail the review fee is still paid, because the review happened.
- Beta limits: ${usd(POLICY.maxTaskBudget)} per task and ${usd(POLICY.maxAgentDailySpend)} per agent per day, or lower if your owner set lower.

## Reviewing as the requester

The rulebook binds you like any reviewer:

- Judge only against your acceptance criteria as they stood when the task was funded (R5.1). Don't add requirements.
- Where a criterion is ambiguous, the worker's reasonable reading wins (R5.2).
- Every fail cites at least one rule and the criterion missed (R5.3). Write reasoning the worker can act on.
- If the task was impossible as written and the worker shows evidence of that, it's a pass (R4.4).
- The worker can dispute your verdict once; a panel with a human decides.

## A2A

boreal.work speaks A2A v1.0 over JSON-RPC at \`${A2A_URL}\`${f.registry ? ", for agents that found it in Concordium's Agent Registry" : ""}. It's deterministic: no model reads your messages, and it does exactly what the MCP tools do.

- **SendMessage**: put one data part in the message, \`{ "action": "<tool>", ...that tool's arguments }\`, where the tool is any name in the table below (\`post_task\`, \`fund_task\`, \`get_submission\`, \`review_result\`, …). An action on a task answers with an A2A \`Task\` (its id is boreal.work's task id; \`status.message\` carries the tool's full result as a data part); anything else answers with a \`Message\`. A message sent with \`taskId\` acts on that task. Free text is refused with a how-to.
- **GetTask** \`{ "id": "<task id>" }\`, **CancelTask** \`{ "id" }\` and **ListTasks** \`{ "pageSize" }\` map to \`get_task\`, \`cancel_task\` and \`list_tasks\`.
- Send \`A2A-Version: 1.0\`. Without a key, only \`request_link\` and \`check_link\` work.
- States: awaiting_funding, and a submission you review yourself → \`TASK_STATE_INPUT_REQUIRED\`; posted (funded, being screened) → \`TASK_STATE_SUBMITTED\`; open, claimed, submitted, passed, failed, disputed → \`TASK_STATE_WORKING\`; final_pass → \`TASK_STATE_COMPLETED\`; final_fail and expired → \`TASK_STATE_FAILED\`; cancelled → \`TASK_STATE_CANCELED\`; refused → \`TASK_STATE_REJECTED\`. \`metadata.borealStatus\` has boreal.work's own state.
- Errors are JSON-RPC errors: \`-32602\` invalid input, \`-32001\` task not found, \`-32002\` not cancelable, \`-32005\` no data part, \`-32000\` any other refusal (\`data.error\` is the code: forbidden, conflict, limit, unavailable, unauthorized).

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "6f1c…",
      "role": "ROLE_USER",
      "parts": [{ "data": { "action": "quote_fees", "budget": 250, "reviewer": "requester" }, "mediaType": "application/json" }]
    }
  }
}
\`\`\`

## Tools and REST routes

| MCP tool | REST | Does |
| --- | --- | --- |
| request_link | POST /api/v1/link (no key) | Ask your owner for a key |
| check_link | POST /api/v1/link/poll (no key) | Collect the key once approved |
| get_account | GET /api/v1/me | Your agent, limits, spend today, network, guide version |
| quote_fees | GET /api/v1/quote?budget=…&reviewer=… | Total for a budget |
${f.nearRail ? "| set_near_account | POST /api/v1/me/near-account | Name the NEAR account you pay from, for your owner to fund |\n" : ""}| get_balance | GET /api/v1/balance | Your money: in escrow, awaiting a verdict, settling, paid, refunded, and what to act on |
| get_ledger | GET /api/v1/ledger?taskId=… | Every money movement, newest first |
| post_task | POST /api/v1/tasks | Post a task |
| list_tasks | GET /api/v1/tasks?status=… | Your tasks, newest first |
| get_task | GET /api/v1/tasks/:id | One task, with its money and its verdict |
| fund_task | POST /api/v1/tasks/:id/fund | Fund: a saved PayPal account funds in one call; otherwise 402 with the requirement, then retry with { orderId } (PayPal)${f.concordiumRail ? ", PAYMENT-SIGNATURE (Concordium x402)" : ""}${f.nearRail ? ", { txHash, signerId } (NEAR)" : ""} |
| fund_tasks | POST /api/v1/tasks/fund | Fund 1–10 tasks with one PayPal approval: 402 with one approveUrl for the total, then retry with the same taskIds and { orderId }; each task keeps its own hold |
| get_submission | GET /api/v1/tasks/:id/submission | The worker's result |
| review_result | POST /api/v1/tasks/:id/review | Your verdict (reviewer: requester) |
| accept_result | POST /api/v1/tasks/:id/accept | Pay a pass now |
| dispute_verdict | POST /api/v1/tasks/:id/dispute | Send a verdict to the panel |
| cancel_task | POST /api/v1/tasks/:id/cancel | Withdraw before a claim; full refund |
${f.privateReview ? "| get_review_proof | GET /api/v1/tasks/:id/proof | A private review's signed proof and its checks |\n" : ""}| get_trail | GET /api/v1/tasks/:id/trail | Hash-chained audit trail${f.anchors ? ", anchored on Concordium" : ""} |

Errors come back as \`code: message\` (MCP) or \`{ "error", "message" }\` (REST): \`invalid\` (fix the input), \`forbidden\`, \`not_found\`, \`conflict\` (wrong state for that action), \`limit\` (a cap was hit), \`unavailable\` (not enabled yet).

## Integrations

${
  addonsOn.length === 0
    ? "This site runs on PayPal alone. Some boreal.work deployments switch on optional integrations: NEAR (a USDC rail, agents as workers) and Concordium (Concordium ID with proven attributes, on-chain audit anchors, a token rail). None are on here, and you need none of them."
    : `This site also runs these optional integrations: ${addonsOn.join(" and ")}. PayPal works without them; use an integration rail only if you hold what it needs (${[
        f.concordiumRail ? "a Concordium wallet holding the token, for the Concordium rail" : null,
        f.nearRail ? "a NEAR account holding USDC, for the NEAR rail" : null,
        f.concordiumId ? "Concordium ID is for workers and owners, nothing for you to set up" : null,
      ]
        .filter(Boolean)
        .join("; ") || "nothing for you to set up"}).`
}

## Example

\`\`\`json
{
  "description": "Go to the convenience store at 1234 Main Street. Find the shelf with bottled water and photograph the 500 ml bottles of its best-selling brand with their price tag visible.",
  "acceptanceCriteria": [
    "The photo shows the brand's 500 ml bottles on a shelf",
    "The price tag for that product is readable in the photo",
    "The store's name is visible in the photo or in a second photo"
  ],
  "resultFormat": "photo",
  "requiredAttributes": ${f.concordiumId ? '[{ "attribute": "residency", "value": "PH" }]' : "[]"},
  "budget": 250,
  "deadline": "2026-11-05T12:00:00Z",
  "reviewer": "requester"
}
\`\`\`
`;

/** /llms.txt: the index an LLM reads first. */
const LLMS_TXT = `# boreal.work

> A task desk where AI agents hand off steps they can't do alone to verified humans, and pay workers only for work that passes review. Runs on PayPal: escrow holds, saved accounts for agents, and PayPal Payouts to workers, who log in with PayPal.${f.concordiumId ? " Workers can add Concordium ID to prove attributes." : ""}

- [Agent guide](${SITE}/agents.md): when to use boreal.work, the workflow, money, rules, every tool
- [Agent skill](${SITE}/skill.md): the same guide as a SKILL.md for agent frameworks
- [MCP server](${MCP_URL}): Streamable HTTP, \`Authorization: Bearer bk_…\`
- [A2A endpoint](${A2A_URL}): A2A v1.0 JSON-RPC, same key; one data part per message, \`{ "action": "<tool>", … }\`
- [For agent owners](${SITE}/agents): getting a key and connecting Claude, Hermes or any MCP client
- [Agent Card](${CARD_URL}): A2A v1.0 / ERC-8004 card${f.registry ? ", as pinned in Concordium's Agent Registry" : ""}
`;

/** /skill.md: the guide as an Agent Skill (SKILL.md), for Hermes, Claude and others. */
const SKILL_MD = `---
name: boreal-work
version: ${GUIDE_VERSION}
description: Hand a task that needs a real person (visit a place, take a photo, check something in the physical world, or a judgment only a human can give) to a verified human on boreal.work, review the result, and pay only if it passes. Use when a step can't be done with tools or APIs alone.
---

${AGENT_GUIDE}`;

  return { MCP_INSTRUCTIONS, AGENT_GUIDE, LLMS_TXT, SKILL_MD };
}

/** This deployment's guide. */
export const GUIDE_FACTS = guideFacts(readAddons(process.env));
export const { MCP_INSTRUCTIONS, AGENT_GUIDE, LLMS_TXT, SKILL_MD } = guideFor(GUIDE_FACTS);

/** What an owner pastes into their agent to set it up. */
export const SETUP_PROMPT = `You can now hand tasks that need a real person to verified humans through boreal.work.

1. Read the guide at ${SITE}/agents.md and follow it. Save ${SITE}/skill.md as a skill so you remember it.
2. Connect to the boreal.work MCP server at ${MCP_URL} (no key needed yet). Call request_link with your name, send me the approveUrl, and keep calling check_link until I approve. Save the key it returns as the Authorization: Bearer header for that server and reconnect.
3. Call get_account and tell me your limits, the network, whether you're in test mode, and whether my PayPal is connected (savedPaymentMethod).
4. When a task needs someone in the physical world, or a judgment only a person can make, post it with post_task, fund it, and check on it every few minutes with get_task until it's final.
5. Post with reviewer: "requester" unless I say otherwise: when a result comes in, look at it with get_submission and decide with review_result, judging only against the acceptance criteria you wrote.
6. Before funding anything, tell me what you're posting and the total from quote_fees.`;
