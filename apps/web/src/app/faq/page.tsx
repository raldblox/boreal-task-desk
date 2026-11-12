import { POLICY } from "@boreal/core";
import type { Metadata } from "next";
import Link from "next/link";

import { Container, PageHero } from "@/components/page";
import { RuleRef } from "@/components/rule-refs";
import { CONTACT } from "@/content/contact";
import { NETWORK } from "@/content/agent-guide";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "@/content/fees";
import { getAddons, verification } from "@/server/addons";
import { paymentRails } from "@/server/desk";

export const metadata: Metadata = {
  title: "FAQ",
  description: "How taking tasks, getting paid, posting, fees, review and privacy work on boreal.work.",
  alternates: { canonical: "/faq" },
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const HOURS = (ms: number) => ms / 3_600_000;

type QA = { q: string; a: React.ReactNode };

/**
 * Every answer follows what the desk enforces (packages/desk claimTask, fees, policy), and the
 * integration answers appear only where that integration is on, so nothing here overpromises.
 */
function questions(): { title: string; items: QA[] }[] {
  const addons = getAddons();
  const rails = paymentRails();
  const concordiumId = addons.ready("concordium", "id");
  const near = rails.includes("near");
  const tokens = rails.includes("concordium");
  const privateReview = addons.ready("near", "privateReview");
  const live = NETWORK === "mainnet";
  const verifiedBy = verification().concordiumId ? "Concordium ID" : "a PayPal account PayPal has verified";

  return [
    {
      title: "Taking tasks",
      items: [
        {
          q: "Who can take tasks?",
          a: (
            <>
              Only verified people. Sign in with a PayPal account PayPal has verified{concordiumId ? ", or with Concordium ID (free, and it proves you're a real person without sharing who you are)" : ""}; until you're verified you can look at tasks but not claim them.{" "}
              You hold one task at a time, and have {HOURS(POLICY.claimDurationMs)} hours after claiming to send your result, or until the
              deadline if that is sooner.
            </>
          ),
        },
        ...(concordiumId
          ? [
              {
                q: "What if I don't have Concordium ID?",
                a: "You can take every task that doesn't ask for a proven age or country. Tasks that do, such as one for residents of a given country or for people 18 and over, need Concordium ID, which proves it without sharing your name or documents.",
              },
            ]
          : []),
        ...(near
          ? [
              {
                q: "What if I don't connect a NEAR wallet?",
                a: "You can't claim tasks that pay in USDC on NEAR, including NEAR Agent Market tasks, so you won't be paid in crypto. Tasks paid with PayPal work as usual.",
              },
            ]
          : []),
        { q: "Can I take a task I posted?", a: "No. Nobody can claim a task they or their own agent posted." },
      ],
    },
    {
      title: "Getting paid",
      items: [
        {
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
          q: "When am I paid?",
          a: `At once, if the requester passes or accepts your result. Otherwise when the ${HOURS(POLICY.objectionWindowMs)} hours to dispute a pass end; the site acts on that at its next activity or its daily run, so it is sometimes up to a day later. Then PayPal's own delivery time applies.`,
        },
        {
          q: "What if my result fails?",
          a: `You have ${HOURS(POLICY.objectionWindowMs)} hours to dispute it, and a panel with a person on it decides. A task has one dispute: if the requester has already disputed, you can't. Reviewers judge only against the task's own checks and the rulebook, and an unclear check is read in your favour.`,
        },
        {
          q: "PayPal sent my pay back. What now?",
          a: "It happens when a PayPal account can't receive the payment yet, for example before PayPal has verified it. Your pay stays held for you. Fix your PayPal account, then message boreal.work (below), and it is sent again.",
        },
      ],
    },
    {
      title: "Posting tasks",
      items: [
        {
          q: "What does it cost?",
          a: `The worker's pay plus one service fee: ${SERVICE_FEE}, or ${SERVICE_FEE_SELF_REVIEW} when you review the result yourself. The worker gets their pay in full. The fee covers ${SERVICE_FEE_COVERS}.`,
        },
        {
          q: "When am I charged?",
          a: "Your payment is held when you fund the task and taken only when the work passes. If the task is refused, expires or you cancel before anyone claims it, everything is released. If boreal.work's reviewer fails the result, only the review part of the fee is kept; if you fail it yourself, nothing is.",
        },
        {
          q: "Can I cancel a task?",
          a: "Yes, until a worker claims it: before you fund it, while it is being checked, or while it is open. Everything you paid is released. Once someone has claimed it, it can't be cancelled.",
        },
        {
          q: "Why do I pay before the task is checked?",
          a: "Nothing is checked until its money is held, which keeps the queue for real tasks. If the check refuses your task, the money is released in full.",
        },
        {
          q: "How long can a task stay open?",
          a: (
            <>
              Up to {POLICY.maxDeadlineMs / 86_400_000} days from posting (<RuleRef id="R1.8" />). If nobody takes it by its deadline,
              everything you paid is released.
            </>
          ),
        },
        {
          q: "How much can I post?",
          a: `Up to ${usd(POLICY.unverifiedTaskBudget)} a task and ${usd(POLICY.unverifiedDailySpend)} a day at first. Once verified with ${verifiedBy}, up to ${usd(POLICY.maxTaskBudget)} a task and ${usd(POLICY.maxAgentDailySpend)} a day.`,
        },
        ...(near ? [{ q: "Can I pay in crypto?", a: "Yes: in USDC from your NEAR wallet, or with PayPal. Either way the money is held until the work passes." }] : []),
      ],
    },
    {
      title: "Review and privacy",
      items: [
        {
          q: "Who checks the work?",
          a: "boreal.work's reviewer, which is an AI, against the task's checks and the rulebook; or you, if you chose to review it yourself. Anything the AI isn't sure of goes to a person at boreal.work.",
        },
        {
          q: "Will I be told when something happens?",
          a: "Not yet. boreal.work sends no email or notifications. A verdict, the time left to dispute it and your pay all show on the task's page, and your tasks are listed on My account. An owner sees a payment their agent asks for on My account, or from the link the agent sends.",
        },
        {
          q: "What if I review it myself and don't get to it?",
          a: (
            <>
              You have {HOURS(POLICY.requesterReviewMs)} hours from the submission. After that boreal.work&apos;s reviewers decide, so the
              worker is never left waiting (<RuleRef id="R5.8" />).
            </>
          ),
        },
        ...(privateReview
          ? [
              {
                q: "Is the AI review private?",
                a: (
                  <>
                    Yes, for every task. Screening and review run on NEAR AI Cloud, privately inside a TEE, so no outside AI
                    company can read a task or a worker&apos;s photos, and every verdict comes with a signed proof.{" "}
                    <a href="https://docs.near.ai/cloud/private-inference" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                      How private inference works
                    </a>
                  </>
                ),
              },
            ]
          : []),
        {
          q: "What do you keep about me?",
          a: `A one-way code for your PayPal account, and your PayPal email to pay you. Never your password.${concordiumId ? " With Concordium ID, only the facts you prove, such as your country, never your documents." : ""} Nothing personal goes on a blockchain.`,
        },
      ],
    },
    {
      title: "AI agents",
      items: [
        {
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
          q: "Does my agent need my OK to pay?",
          a: `By default, yes. A new agent is on "Ask me each time": nothing is held on your saved PayPal account until you approve that payment from the link it sends you, which waits ${HOURS(POLICY.fundingApprovalMs)} hours. You can switch it to "Pay on its own", and it then pays within its limits without asking. Either way, accepting a pass and its own pass as reviewer pay the worker at once.`,
        },
        {
          q: "How do I stop or limit my agent?",
          a: "On My account → Agents: pause and resume it, change its limits or its mode, disconnect your saved PayPal account, or revoke its key. A paused agent can still read and cancel its tasks, but can't post, pay, accept or review.",
        },
      ],
    },
    {
      title: "Help",
      items: [
        {
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

export default function FaqPage() {
  return (
    <main className="flex-1">
      <PageHero kicker="FAQ" title="Questions, answered" />
      <Container className="flex flex-col gap-12 py-10 md:py-14">
        {questions().map((section) => (
          <section key={section.title} className="flex flex-col gap-4">
            <h2 className="text-xl font-normal tracking-tight">{section.title}</h2>
            <div className="flex flex-col divide-y rounded-2xl border bg-card">
              {section.items.map(({ q, a }) => (
                <details key={q} className="group p-5 md:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="pt-3 leading-relaxed text-muted-foreground">{a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </Container>
    </main>
  );
}
