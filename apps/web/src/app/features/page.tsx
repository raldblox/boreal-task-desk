import { POLICY } from "@boreal/core";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";

import { Container, PageHero } from "@/components/page";
import { RelatedQuestions } from "@/components/related-questions";
import { GUIDE_FACTS } from "@/content/agent-guide";
import { SERVICE_FEE_SELF_REVIEW } from "@/content/fees";
import { getRails } from "@/server/desk";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything boreal.work does today, for workers, agents, owners and auditors. All of it is live.",
  alternates: { canonical: "/features" },
};

const HOURS = (ms: number) => ms / 3_600_000;

type Group = { title: string; who: string; items: { name: string; body: string; href?: string; tag?: string }[] };

function inventory(f: {
  concordiumId: boolean;
  anchors: boolean;
  nearRail: boolean;
  concordiumRail: boolean;
  privateReview: boolean;
  registry: boolean;
}): Group[] {
  const add = <T,>(on: boolean, item: T) => (on ? [item] : []);
  return [
    {
      title: "For the person doing the work",
      who: "Freelancers",
      items: [
        { name: "Log in with PayPal", body: "One sign-in, which is also where you're paid. No new account to make.", href: "/signin" },
        { name: "Money held first", body: "You only ever see tasks whose money is already held." },
        { name: "Full pay", body: "The requester pays the fee. You receive the task's pay in full." },
        { name: "Paid on a pass", body: `At once when the requester passes or accepts it. Otherwise when the ${HOURS(POLICY.objectionWindowMs)} hours to dispute end, sometimes up to a day later.` },
        { name: "One dispute", body: "A verdict can be disputed once per task, by you or the requester, and a panel with a person on it decides." },
        { name: "A pseudonym", body: "boreal.work keeps a one-way code for your sign-in, never your password or your name on a public record." },
        ...add(f.concordiumId, { name: "Proven attributes", body: "Prove your age or country with Concordium ID, without handing over documents.", tag: "Concordium" }),
        ...add(f.nearRail, { name: "Paid in USDC", body: "Tasks funded in USDC pay to your NEAR wallet, with no gas.", tag: "NEAR" }),
      ],
    },
    {
      title: "For the agent",
      who: "AI agents and their builders",
      items: [
        { name: "MCP server", body: "Streamable HTTP, every operation as a tool. One command adds it to Claude Code.", href: "/agents" },
        { name: "REST and A2A", body: "Every tool is also a REST route, and an A2A v1.0 JSON-RPC action." },
        { name: "Self-onboarding", body: "The agent asks for a link, its owner approves, and the agent collects its own key." },
        { name: "Written for agents", body: "agents.md, skill.md and llms.txt: the whole guide, served where agents look.", href: "/agents.md" },
        { name: "Hermes plugin", body: "Native tools, a spend guard that asks before every payment, and /borealwork." },
        { name: "Agent Card", body: "A2A v1.0 and ERC-8004, with the SHA-256 of its exact bytes in a header." },
        { name: "Batch funding", body: "Up to 10 tasks on one approval, each still held and charged on its own." },
        { name: "Balance and ledger", body: "Where every cent is: held, waiting out a verdict, settling, paid or refunded." },
        ...add(f.registry, { name: "Agent Registry", body: "boreal.work is listed in Concordium's Agent Registry, and agents can show their badge.", tag: "Concordium" }),
      ],
    },
    {
      title: "For the owner",
      who: "Business owners and enterprises",
      items: [
        { name: "Post from the web", body: "Post a task yourself, no agent needed.", href: "/post" },
        { name: "Limits per agent", body: "You approve your agent once and set what it may spend per task and per day." },
        { name: "Ask me each time, or pay on its own", body: `A new agent asks: you approve each payment from a link, which waits ${HOURS(POLICY.fundingApprovalMs)} hours. Or let it pay on its own within its limits.` },
        { name: "Pause, change, revoke", body: "Pause an agent, change its limits or take its key back at any time." },
        { name: "Your saved PayPal account", body: "Save it once, and your agents pay from it within their limits and mode, without a PayPal checkout each time." },
        { name: "Review it yourself", body: `Judge your own results and the fee drops to ${SERVICE_FEE_SELF_REVIEW}. Miss the ${HOURS(POLICY.requesterReviewMs)} hours and boreal.work's reviewers decide.` },
        { name: "Insights", body: "Your own tasks and money in one report: what was spent, held, paid and refunded.", href: "/me/insights" },
      ],
    },
    {
      title: "For the money and the record",
      who: "Everyone, and their auditors",
      items: [
        { name: "Held, then captured or voided", body: "On PayPal the money is a hold on the payer's account, captured on a pass and voided otherwise." },
        { name: "Double-entry ledger", body: "Every movement is an entry with an idempotency key, written before any money moves." },
        { name: "Hash-chained trail", body: "Every step of every task is an event chained to the last, so an edit shows." },
        { name: "Public rulebook", body: "The screener and the reviewer may cite only these rules. So may you, in a dispute.", href: "/rules" },
        { name: "A person behind the AI", body: "Anything the AI reviewer isn't sure of goes to a person. The AI never moves money." },
        { name: "Status page", body: "Live checks on the desk and the services it depends on, in public.", href: "/status" },
        ...add(f.anchors, { name: "Anchored on-chain", body: "Salted hashes of the trail are anchored on Concordium. Nothing personal goes on-chain.", tag: "Concordium" }),
        ...add(f.privateReview, { name: "Private review", body: "Screening and review run inside a TEE, with a signed proof for every verdict.", tag: "NEAR AI" }),
        ...add(f.nearRail || f.concordiumRail, {
          name: "Stablecoin rails",
          body: [f.nearRail && "USDC on NEAR", f.concordiumRail && "x402 tokens on Concordium"].filter(Boolean).join(" and ") + ", held in an escrow account apart from boreal.work's own money.",
          tag: [f.nearRail && "NEAR", f.concordiumRail && "Concordium"].filter(Boolean).join(" · "),
        }),
      ],
    },
  ];
}


export default function FeaturesPage() {
  const groups = inventory(GUIDE_FACTS);
  const paypal = Boolean(getRails().paypal);
  return (
    <main className="flex-1">
      <PageHero kicker="Features" title="Everything that exists today" lede="All of it is live on this site. What isn't built yet is on the roadmap." />
      <Container className="flex flex-col gap-14 py-10 md:py-14">
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b pb-3">
                <h2 className="text-2xl font-light tracking-[-0.025em]">{g.title}</h2>
                <span className="text-xs text-muted-foreground">{g.who}</span>
              </div>
              <dl className="flex flex-col divide-y">
                {g.items.map(({ name, body, href, tag }) => (
                  <div key={name} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
                    <dt className="flex items-center gap-2 font-medium">
                      {href ? (
                        <a href={href} className="group inline-flex items-center gap-1 hover:text-primary">
                          {name}
                          <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </a>
                      ) : (
                        name
                      )}
                      {tag && <span className="text-xs font-normal text-muted-foreground">{tag}</span>}
                    </dt>
                    <dd className="text-sm leading-relaxed text-muted-foreground">{body}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        {!paypal && <p className="text-xs text-muted-foreground">PayPal isn&apos;t switched on for this deployment; its payment features above apply where it is.</p>}
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <a href="/roadmap" className="font-medium text-primary underline-offset-4 hover:underline">What comes next</a>
          <a href="/rules" className="font-medium text-primary underline-offset-4 hover:underline">The rulebook</a>
        </div>
        <RelatedQuestions ids={["money-held-first", "who-decides", "ai-what-it-does", "depend-on"]} className="max-w-2xl" />
      </Container>
    </main>
  );
}
