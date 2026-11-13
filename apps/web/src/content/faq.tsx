import { FEE_POLICY, POLICY } from "@boreal/core";
import Link from "next/link";

import { RuleRef } from "@/components/rule-refs";
import { CONTACT } from "@/content/contact";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "@/content/fees";
import { getAddons, verification } from "@/server/addons";
import { paymentRails } from "@/server/desk";

// Every question boreal.work answers, in one place, so any page can link straight to one
// (/faq#<id>) and the FAQ opens it. Ids are fixed: change a question's words, never its id.
// Every answer follows what the desk enforces, and integration answers appear only where that
// integration is on, so nothing here overpromises.

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const HOURS = (ms: number) => ms / 3_600_000;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

export type QA = { id: string; q: string; a: React.ReactNode };
export type FaqSection = { title: string; items: QA[] };

export function questions(): FaqSection[] {
  const addons = getAddons();
  const rails = paymentRails();
  const concordiumId = addons.ready("concordium", "id");
  const passport = addons.ready("zkpassport", "passport");
  const near = rails.includes("near");
  const tokens = rails.includes("concordium");
  const privateReview = addons.ready("near", "privateReview");
  const verifiedBy = verification().concordiumId ? "Concordium ID" : "a PayPal account PayPal has verified";
  const docChecks = [concordiumId && "Concordium ID", passport && "ZKPassport"].filter(Boolean).join(" or ");

  return [
    {
      title: "Before you start",
      items: [
        {
          id: "money-held-first",
          q: "Is the money really there before I start?",
          a: "Yes. Nobody sees a task, not a worker, a reviewer or the AI, until its money is held. Refused, expired or cancelled before a claim, and the hold is released in full.",
        },
        {
          id: "who-decides",
          q: "Who decides if the work passes?",
          a: "The reviewer, against the task's own checks and the rulebook. A requester can accept a pass early but never overrule one, and an unclear check is read the worker's way.",
        },
        {
          id: "depend-on",
          q: "Who do I depend on?",
          a: "PayPal holds the money and pays the worker. boreal.work runs the ledger, the review and the queue that moves money when a verdict is final.",
        },
        {
          id: "beta-limits",
          q: "Why are there limits?",
          a: `boreal.work is new. Up to ${usd(POLICY.unverifiedTaskBudget)} a task and ${usd(POLICY.unverifiedDailySpend)} a day until the payer is verified, then up to ${usd(POLICY.maxTaskBudget)} a task and ${usd(POLICY.maxAgentDailySpend)} a day per agent. For larger work, message boreal.work first.`,
        },
      ],
    },
    {
      title: "Taking tasks",
      items: [
        {
          id: "who-can-take-tasks",
          q: "Who can take tasks?",
          a: (
            <>
              Only verified people, one account per person. Sign in with a PayPal account PayPal has verified
              {docChecks ? `, or prove yourself with ${docChecks} (free, and without sharing who you are)` : ""}; until you&apos;re verified you can look at
              tasks but not claim them. You hold one task at a time, and have {HOURS(POLICY.claimDurationMs)} hours after claiming to send your result,
              or until the deadline if that is sooner.
            </>
          ),
        },
        ...(concordiumId
          ? [
              {
                id: "no-concordium-id",
                q: "What if I don't have Concordium ID?",
                a: "You can take every task that doesn't ask for a proven age or country. Tasks that do, such as one for residents of a given country or for people 18 and over, need Concordium ID, which proves it without sharing your name or documents.",
              },
            ]
          : []),
        ...(near
          ? [
              {
                id: "no-near-wallet",
                q: "What if I don't connect a NEAR wallet?",
                a: "You can't claim tasks that pay in USDC on NEAR, including NEAR Agent Market tasks, so you won't be paid in crypto. Tasks paid with PayPal work as usual.",
              },
            ]
          : []),
        { id: "own-task", q: "Can I take a task I posted?", a: "No. Nobody can claim a task they or their own agent posted." },
      ],
    },
    {
      title: "Getting paid",
      items: [
        {
          id: "how-paid",
          q: "How am I paid?",
          a: (
            <>
              In the way the task was funded: PayPal tasks to your PayPal
              {near ? ", USDC tasks to your NEAR wallet" : ""}
              {tokens ? ", token tasks to your Concordium account" : ""}. You receive the task&apos;s full pay: workers pay no fees{near ? " and no gas" : ""}.
            </>
          ),
        },
        {
          id: "when-paid",
          q: "When am I paid?",
          a: `At once, if the requester passes or accepts your result. Otherwise when the ${HOURS(POLICY.objectionWindowMs)} hours to dispute a pass end; the site acts on that at its next activity or its daily run, so it is sometimes up to a day later. Then PayPal's own delivery time applies.`,
        },
        {
          id: "result-fails",
          q: "What if my result fails?",
          a: `You have ${HOURS(POLICY.objectionWindowMs)} hours to dispute it. A panel of two decides: boreal.work's AI reviewer votes, then a person decides, and the person's verdict stands. A task has one dispute: if the requester has already disputed, you can't. An unclear check is read in your favour.`,
        },
        {
          id: "payout-returned",
          q: "PayPal sent my pay back. What now?",
          a: "It happens when a PayPal account can't receive the payment yet, for example before PayPal has verified it. Your pay stays held for you. Fix your PayPal account, then message boreal.work (below), and it is sent again.",
        },
      ],
    },
    {
      title: "Posting tasks",
      items: [
        {
          id: "cost",
          q: "What does it cost?",
          a: `The worker's pay plus one service fee: ${SERVICE_FEE}, or ${SERVICE_FEE_SELF_REVIEW} when you review the result yourself. The worker gets their pay in full. The fee covers ${SERVICE_FEE_COVERS}.`,
        },
        {
          id: "when-charged",
          q: "When am I charged?",
          a: "Your payment is held when you fund the task and taken only when the work passes. If the task is refused, expires or you cancel before anyone claims it, everything is released. If boreal.work's reviewer fails the result, only the review part of the fee is kept; if you fail it yourself, nothing is.",
        },
        {
          id: "cancel",
          q: "Can I cancel a task?",
          a: "Yes, until a worker claims it: before you fund it, while it is being checked, or while it is open. Everything you paid is released. Once someone has claimed it, it can't be cancelled.",
        },
        {
          id: "pay-before-check",
          q: "Why do I pay before the task is checked?",
          a: "Nothing is checked until its money is held, which keeps the queue for real tasks. If the check refuses your task, the money is released in full.",
        },
        {
          id: "how-long-open",
          q: "How long can a task stay open?",
          a: (
            <>
              Up to {POLICY.maxDeadlineMs / 86_400_000} days from posting (<RuleRef id="R1.8" />). If nobody takes it by its deadline, everything you paid
              is released.
            </>
          ),
        },
        {
          id: "how-much",
          q: "How much can I post?",
          a: `Up to ${usd(POLICY.unverifiedTaskBudget)} a task and ${usd(POLICY.unverifiedDailySpend)} a day at first. Once verified with ${verifiedBy}, up to ${usd(POLICY.maxTaskBudget)} a task and ${usd(POLICY.maxAgentDailySpend)} a day.`,
        },
        ...(near ? [{ id: "pay-in-crypto", q: "Can I pay in crypto?", a: "Yes: in USDC from your NEAR wallet, or with PayPal. Either way the money is held until the work passes." }] : []),
      ],
    },
    {
      title: "The AI reviewer",
      items: [
        {
          id: "ai-what-it-does",
          q: "What does the AI do?",
          a: "Two jobs. It screens every funded task before any worker sees it, against the rulebook's safety and clarity rules. And, unless you review results yourself, it judges each result against the task's own checks, one check at a time, citing the rule behind any fail.",
        },
        {
          id: "ai-cost",
          q: "What does the AI review cost, and is it worth it?",
          a: (
            <>
              The review part of the fee is {pct(FEE_POLICY.reviewRate)} of the pay: {SERVICE_FEE} instead of {SERVICE_FEE_SELF_REVIEW}. Screening is in the base fee for
              every task. For that, a result is judged in minutes, by the same rules every time, with a person behind it; you don&apos;t have to review
              it, and you can&apos;t forget to. If the review fails a result, only that review part is kept.
            </>
          ),
        },
        {
          id: "ai-fair",
          q: "How do I know the AI is fair?",
          a: (
            <>
              It is held to the rulebook&apos;s rules for reviewers, and a verdict that breaks one is overturned. It judges only the checks as they stood when
              the task was funded (<RuleRef id="R5.1" />); an unclear check goes the worker&apos;s way (<RuleRef id="R5.2" />); the same evidence gets the same
              verdict, never weighed by who the worker is, where they&apos;re from, their language or their writing (<RuleRef id="R5.6" />). Every fail names
              the rule and the check missed (<RuleRef id="R5.3" />), in words the worker can act on (<RuleRef id="R5.7" />).
            </>
          ),
        },
        {
          id: "ai-unsure",
          q: "What happens when the AI isn't sure?",
          a: (
            <>
              It says so instead of guessing, and a person at boreal.work decides (<RuleRef id="R5.5" />). Code also checks every answer before it counts: a
              fail that doesn&apos;t cite a failing rule and a missed check, or a pass with an unmet check, goes to a person too.
            </>
          ),
        },
        {
          id: "ai-money",
          q: "Can the AI move money?",
          a: "No. It only suggests a verdict. The desk applies the rules and moves the money, and only on a verdict that is final. In a dispute the AI is one of two panel members; the person decides.",
        },
        {
          id: "ai-instructions",
          q: "Can a task or a result trick the AI?",
          a: "It is told that everything in a task, a result or a dispute statement is material to judge, never instructions, and code checks its answer against the rulebook before it counts. Anything odd goes to a person.",
        },
        ...(privateReview
          ? [
              {
                id: "ai-private",
                q: "Is the AI review private?",
                a: (
                  <>
                    Yes, for every task. Screening and review run on NEAR AI Cloud, privately inside a TEE, so no outside AI company can read a task or a
                    worker&apos;s photos, and every verdict comes with a signed proof.{" "}
                    <a href="https://docs.near.ai/cloud/private-inference" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                      How private inference works
                    </a>
                  </>
                ),
              },
            ]
          : []),
        {
          id: "review-myself",
          q: "What if I review it myself and don't get to it?",
          a: (
            <>
              You have {HOURS(POLICY.requesterReviewMs)} hours from the result. After that boreal.work&apos;s reviewers decide, so the worker is never left
              waiting (<RuleRef id="R5.8" />).
            </>
          ),
        },
      ],
    },
    {
      title: "Privacy and updates",
      items: [
        {
          id: "notifications",
          q: "Will I be told when something happens?",
          a: "Not yet. boreal.work sends no email or notifications. A verdict, the time left to dispute it and your pay all show on the task's page, and your tasks are listed on My account. An owner sees a payment their agent asks for on My account, or from the link the agent sends.",
        },
        {
          id: "what-you-keep",
          q: "What do you keep about me?",
          a: `A one-way code for your PayPal account, and your PayPal email to pay you. Never your password.${concordiumId ? " With Concordium ID, only the facts you prove, such as your country, and a one-way code that keeps it to one account per person; never your documents, name or birth date." : ""} Nothing personal goes on a blockchain.`,
        },
      ],
    },
    {
      title: "AI agents",
      items: [
        {
          id: "agent-post",
          q: "Can my AI agent post tasks?",
          a: (
            <>
              Yes, over MCP, REST or A2A. It asks you to approve it once, and you set what it may spend per task and per day.{" "}
              <Link href="/agents" className="text-primary underline-offset-4 hover:underline">
                Set up your agent
              </Link>
            </>
          ),
        },
        {
          id: "agent-ok-to-pay",
          q: "Does my agent need my OK to pay?",
          a: `By default, yes. A new agent is on "Ask me each time": nothing is held on your saved PayPal account until you approve that payment from the link it sends you, which waits ${HOURS(POLICY.fundingApprovalMs)} hours. You can switch it to "Pay on its own", and it then pays within its limits without asking. Either way, accepting a pass and its own pass as reviewer pay the worker at once.`,
        },
        {
          id: "agent-stop",
          q: "How do I stop or limit my agent?",
          a: "On My account → Agents: pause and resume it, change its limits or its mode, disconnect your saved PayPal account, or revoke its key. A paused agent can still read and cancel its tasks, but can't post, pay, accept or review.",
        },
      ],
    },
    {
      title: "Help",
      items: [
        {
          id: "contact",
          q: "How do I reach boreal.work?",
          a: (
            <>
              Send a direct message to{" "}
              <a href={CONTACT.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                {CONTACT.handle} on X
              </a>
              . Say which task it&apos;s about, if any. Never send a password.
            </>
          ),
        },
      ],
    },
  ];
}

/** The named questions, in the order given, for a page's "Questions about this" links. Unknown or switched-off ids are skipped. */
export function faqItems(ids: string[]): QA[] {
  const all = questions().flatMap((s) => s.items);
  return ids.flatMap((id) => all.filter((q) => q.id === id));
}
