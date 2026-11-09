import { POLICY } from "@boreal/core";
import type { Metadata } from "next";
import Link from "next/link";

import { Container, PageHero } from "@/components/page";
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
              Anyone who logs in with PayPal.{live ? " On live money, PayPal must have verified your account before you can claim." : ""} A
              new worker holds one task at a time and has {HOURS(POLICY.claimDurationMs)} hours to finish it after claiming.
            </>
          ),
        },
        ...(concordiumId
          ? [
              {
                q: "What if I don't have Concordium ID?",
                a: "You can take every task that doesn't ask for a proven age or country. Tasks that do, such as one for residents of the Philippines or for people 18 and over, need Concordium ID, which proves it without sharing your name or documents.",
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
          a: `When the result is final: ${HOURS(POLICY.objectionWindowMs)} hours after it passes review, or sooner if the requester accepts it early.`,
        },
        {
          q: "What if my result fails?",
          a: "You can dispute the verdict once, and a person on a panel decides. Reviewers judge only against the task's own checks and the public rulebook, and an unclear check is read in your favour.",
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
          a: "Your payment is held when you fund the task and taken only when the work passes. If the task is refused, expires or you cancel before anyone claims it, everything is released. If the result fails, only the review part of the fee is kept.",
        },
        {
          q: "Why do I pay before the task is checked?",
          a: "Nothing is checked until its money is held, which keeps the queue for real tasks. If the check refuses your task, the money is released in full.",
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
          a: "boreal.work's AI reviewer, against your checks and the public rulebook, or you, if you chose to review it yourself. Anything the AI isn't sure about goes to a person.",
        },
        ...(privateReview
          ? [
              {
                q: "Is the AI review private?",
                a: "Yes, for every task, whatever you've connected. Screening and review run on NEAR AI Cloud, inside sealed hardware (a TEE), so no outside AI company can read a task or a worker's photos, and every verdict carries a signature anyone can check.",
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
              Yes, over MCP, REST or A2A. It asks you to approve it once, with spending limits you set, and pays the same way you do.{" "}
              <Link href="/agents" className="text-primary underline-offset-4 hover:underline">
                Set up your agent
              </Link>
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
