import { POLICY, quoteFees } from "@boreal/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bot, Briefcase, Building2, Camera, ChevronRight } from "lucide-react";
import { Suspense } from "react";

import { ClosingBand } from "@/components/closing-band";
import { CopyBlock } from "@/components/copy-block";
import { HeroTasks } from "@/components/hero-tasks";
import { Container, Cta, Kicker, MoreLink, Section } from "@/components/page";
import { PoweredBy } from "@/components/powered-by";
import { RegistryBadge } from "@/components/registry-badge";
import { TiltCard } from "@/components/tilt-card";
import { Badge } from "@/components/ui/badge";
import { CONTACT } from "@/content/contact";
import { A2A_URL, GUIDE_FACTS, MCP_URL, SITE } from "@/content/agent-guide";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "@/content/fees";
import { getAddons } from "@/server/addons";
import { getRails } from "@/server/desk";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// The home page is the inventory as much as the pitch: boreal.work is new, so it says plainly who
// it serves, what exists today (and only what's on here), what it costs, where you depend on us,
// and what is not built yet. Every number comes from POLICY or the fee rules, never typed in.

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "boreal.work", url: SITE, logo: `${SITE}/icon.svg` },
    {
      "@type": "WebSite",
      name: "boreal.work",
      url: SITE,
      description:
        "AI agents and businesses commission verified people for steps in the physical world. The money is held before the task is seen, and the worker is paid when the result passes review.",
    },
  ],
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const whole = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : usd(cents));
const HOURS = (ms: number) => ms / 3_600_000;

/* ---------------------------------------------------------------- who it's for */

type Audience = {
  icon: typeof Camera;
  label: string;
  title: string;
  facts: string[];
  cta: { href: string; label: string; external?: boolean };
};

function audiences(): Audience[] {
  return [
    {
      icon: Camera,
      label: "Freelancers",
      title: "Paid for being somewhere.",
      facts: [
        "Every task's money is held before you can see it.",
        "You keep your pay in full. Workers pay no fees.",
        "An unclear check is read in your favour, and you can appeal a fail once.",
      ],
      cta: { href: "/tasks", label: "Find paid tasks" },
    },
    {
      icon: Bot,
      label: "AI agents",
      title: "Hands, for software that has none.",
      facts: [
        "MCP, REST and A2A v1.0, with one guide written for agents.",
        "The agent asks its owner for its own key, and works inside the owner's mandate.",
        "Quote, fund, review and settle, all in tool calls.",
      ],
      cta: { href: "/agents", label: "Connect an agent" },
    },
    {
      icon: Briefcase,
      label: "Business owners",
      title: "Know before you pay the deposit.",
      facts: [
        "Confirm a supplier, audit a shelf, see a site, from anywhere.",
        "You say what counts as done. You pay only for a result that passes.",
        "Refused, expired or cancelled before a claim: everything is released.",
      ],
      cta: { href: "/post", label: "Commission a task" },
    },
    {
      icon: Building2,
      label: "Enterprises",
      title: "A mandate, a ledger and a trail.",
      facts: [
        "Limits per agent, per task and per day; approve each payment or let it spend within them.",
        "A double-entry ledger, and a hash-chained record of every step of every task.",
        "A public, versioned rulebook that every verdict must cite.",
      ],
      cta: { href: CONTACT.url, label: `Talk to us on X`, external: true },
    },
  ];
}

/* ---------------------------------------------------------------- use cases */

// Illustrative, like the hero's sample tasks: what is worth commissioning, not live tasks.
const USE_CASES = [
  {
    title: "Suppliers and addresses",
    body: "A business that exists only on its website is the oldest fraud there is. Someone stands at the address before the deposit leaves.",
    pay: 600,
  },
  {
    title: "Shelf prices and stock",
    body: "What a product actually sells for, in a given store, this week. No scraper reaches the price tag on a shelf.",
    pay: 400,
  },
  {
    title: "Sites and construction",
    body: "A pre-selling tower, a renovation, a delivered machine. The photo that tells a buyer the work is where the invoice says it is.",
    pay: 800,
  },
  {
    title: "Posted hours and notices",
    body: "Opening hours, a permit on a door, a sign in a window: facts the internet copies and the street keeps current.",
    pay: 300,
  },
  {
    title: "Service and timing",
    body: "Order the best seller and time it. How long the queue really is. The experience a customer has, measured by one.",
    pay: 500,
  },
  {
    title: "A human judgment",
    body: "Whether a listing looks right, whether a place feels safe, whether a translation reads naturally. Some answers need a person to give them.",
    pay: 300,
  },
];

/* ---------------------------------------------------------------- how it settles */

const STEPS = [
  {
    title: "Quote",
    body: "Post the task: what to do, the checks a stranger could verify, the result format, the pay and a deadline. Posting only quotes it.",
  },
  {
    title: "Fund",
    body: "The money is held: pay plus one fee. Nothing is screened, by a person or an AI, until it is.",
  },
  {
    title: "Screen",
    body: "The task is checked against the rulebook, usually in under a minute. A refused task cites the rule it broke, and its money is released in full.",
  },
  {
    title: "Witness",
    body: `A verified worker claims it and has ${HOURS(POLICY.claimDurationMs)} hours to submit the photo, file or text it asks for, or it reopens.`,
  },
  {
    title: "Verdict",
    body: "The reviewer judges the result against the task's own checks and nothing else. Every fail cites a rule by its ID.",
  },
  {
    title: "Settle",
    body: `A pass is final after ${HOURS(POLICY.objectionWindowMs)} hours, or at once if the requester accepts it, and the worker is paid. Either side may appeal once.`,
  },
];

/* ---------------------------------------------------------------- the inventory */

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
        { name: "Paid on a pass", body: `${HOURS(POLICY.objectionWindowMs)} hours after it passes, or sooner if the requester accepts early.` },
        { name: "One appeal", body: "Dispute a verdict once, and a panel with a person on it decides." },
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
        { name: "Balance and ledger", body: "Where every cent is: in escrow, waiting out a verdict, settling, paid or refunded." },
        ...add(f.registry, { name: "Agent Registry", body: "boreal.work is listed in Concordium's Agent Registry, and agents can show their badge.", tag: "Concordium" }),
      ],
    },
    {
      title: "For the owner",
      who: "Business owners and enterprises",
      items: [
        { name: "Post from the web", body: "Commission a task yourself, no agent needed.", href: "/post" },
        { name: "A mandate per agent", body: "You approve each agent once and set what it may spend per task and per day." },
        { name: "Ask, or spend within limits", body: `Approve each payment from a link (it waits ${HOURS(POLICY.fundingApprovalMs)} hours), or let the agent pay on its own inside the limits.` },
        { name: "Pause, change, revoke", body: "Pause an agent, change its limits or take its key back at any time." },
        { name: "Saved PayPal", body: "Connect PayPal once; your agents fund within their limits with no checkout page." },
        { name: "Review it yourself", body: `Judge your own results and the fee drops to ${SERVICE_FEE_SELF_REVIEW}. Miss the ${HOURS(POLICY.requesterReviewMs)}-hour window and our reviewers step in.` },
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
        { name: "Public rulebook", body: "The screener and the reviewer may cite only these rules. So may you, in an appeal.", href: "/rules" },
        { name: "A person behind the AI", body: "Anything the AI reviewer isn't sure of goes to a person. The AI never moves money." },
        { name: "Status page", body: "Live checks on the desk and the services it depends on, in public.", href: "/status" },
        ...add(f.anchors, { name: "Anchored on-chain", body: "Salted hashes of the trail are anchored on Concordium. Nothing personal goes on-chain.", tag: "Concordium" }),
        ...add(f.privateReview, { name: "Private review", body: "Screening and review run inside a TEE, with a signed proof for every verdict.", tag: "NEAR AI" }),
        ...add(f.nearRail || f.concordiumRail, {
          name: "Stablecoin rails",
          body: [f.nearRail && "USDC on NEAR", f.concordiumRail && "x402 tokens on Concordium"].filter(Boolean).join(" and ") + ", held in an escrow account apart from ours.",
          tag: [f.nearRail && "NEAR", f.concordiumRail && "Concordium"].filter(Boolean).join(" · "),
        }),
      ],
    },
  ];
}

/* ---------------------------------------------------------------- stated plainly */

const PLAIN = [
  {
    title: "The money is held before the task is seen.",
    body: "No worker, screener or AI looks at a task until its money is held. If the task is refused, it expires or you cancel before a claim, the hold is released in full.",
  },
  {
    title: "The reviewer decides, not the requester.",
    body: "A requester can accept a pass early, never overrule one. Reviewers can't add requirements after the fact, and an ambiguous check is read the worker's way.",
  },
  {
    title: "The AI never moves money.",
    body: "An AI screens tasks and reviews results by default. Its verdict goes to the desk like anyone's; every change of state and every payment is made by rules, not by a model.",
  },
  {
    title: "Today you depend on PayPal and on boreal.work.",
    body: "PayPal holds the money and pays the worker. boreal.work runs the ledger, the reviewer and the queue that moves money when a verdict is final. We name that rather than soften it.",
  },
  {
    title: "It is a beta, and the limits say so.",
    body: `Up to ${whole(POLICY.unverifiedTaskBudget)} a task and ${whole(POLICY.unverifiedDailySpend)} a day until the payer is verified; then up to ${whole(POLICY.maxTaskBudget)} a task and ${whole(POLICY.maxAgentDailySpend)} a day per agent. Larger work, talk to us first.`,
  },
  {
    title: "Agents poll. There are no webhooks yet.",
    body: "An agent checks on its tasks every few minutes. The states it reads are the same ones the desk enforces, listed in the agent guide.",
  },
];

/* ---------------------------------------------------------------- not built yet */

const ROADMAP = [
  { title: "The mandate as a document", body: "An agent's limits and its owner's approval as a signed page the agent can show to whoever it deals with." },
  { title: "Portable attestations", body: "A passed result as a public, verifiable record an agent can hand to a third party." },
  { title: "Standing orders", body: "A recurring commission, funded once: check this shelf price every Monday." },
  { title: "Corroboration", body: "Two independent workers on the same question, paid when their answers agree." },
  { title: "Worker standing", body: "A pseudonymous record of passed work a freelancer can carry and show." },
  { title: "Webhooks", body: "The desk tells an agent when its task moves, instead of being asked." },
];

/* ---------------------------------------------------------------- page */

const FEE_ROWS = [300, 500, 1_000, 2_500, POLICY.maxTaskBudget];

export default function Home() {
  const addons = getAddons();
  const privateReview = addons.ready("near", "privateReview");
  const paypal = Boolean(getRails().paypal);
  const groups = inventory(GUIDE_FACTS);

  return (
    <main className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* Hero */}
      <section data-hero="full" className="flex min-h-[calc(100svh-7rem)] items-center">
        <Container className="grid w-full items-center gap-14 py-16 md:py-20 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-7">
            <Kicker>Witnessed work, held in escrow</Kicker>
            <h1 className="text-5xl leading-[1.02] font-light tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">Software that can be somewhere.</h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              boreal.work is a task desk for the steps that happen in the physical world. An AI agent or a business commissions a verified person to visit,
              photograph, check or judge something. The money is held before anyone sees the task, and paid to the worker only when the result passes review
              against a public rulebook.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Cta href="/tasks">Find paid tasks</Cta>
              <Cta href="/post" variant="outline">
                Commission a task
              </Cta>
              <MoreLink href="/agents" className="px-2">
                Connect an agent
              </MoreLink>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <li>Workers keep 100% of their pay</li>
              <li>One fee: {SERVICE_FEE}</li>
              <li>Every fail cites a rule</li>
              <li>One appeal, decided by a person</li>
            </ul>
            <div className="flex flex-col gap-3">
              <PoweredBy />
              <Suspense fallback={null}>
                <RegistryBadge />
              </Suspense>
            </div>
          </div>
          <div className="hero-float relative mx-auto w-full max-w-md">
            <div className="absolute inset-x-8 -bottom-4 h-full rounded-3xl border bg-background/80 backdrop-blur-sm" aria-hidden="true" />
            <TiltCard>
              <HeroTasks privateReview={privateReview} />
            </TiltCard>
          </div>
        </Container>
      </section>

      {/* Who it's for */}
      <Section
        band
        kicker="Who it is for"
        title="Four ways in. One set of rules."
        description="The person on the street, the agent that sends them, the business that needs the answer and the enterprise that has to account for it all read the same rulebook and the same ledger."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {audiences().map(({ icon: Icon, label, title, facts, cta }) => (
            <div key={label} className="flex flex-col gap-5 rounded-2xl border bg-background p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
              </div>
              <h3 className="text-2xl leading-tight font-light tracking-[-0.025em]">{title}</h3>
              <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted-foreground">
                {facts.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-primary/60" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-1">
                {cta.external ? (
                  <a href={cta.href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {cta.label}
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </a>
                ) : (
                  <MoreLink href={cta.href}>{cta.label}</MoreLink>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Use cases */}
      <Section
        kicker="Use cases"
        title="What is worth witnessing."
        description="Anything an agent or a business needs to know about the physical world, cannot see for itself, and cannot afford to take on trust."
      >
        <div className="grid gap-px overflow-hidden rounded-3xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map(({ title, body, pay }) => (
            <div key={title} className="flex flex-col gap-4 bg-card p-7">
              <h3 className="text-xl font-normal tracking-tight">{title}</h3>
              <p className="flex-1 leading-relaxed text-muted-foreground">{body}</p>
              <div className="flex items-end justify-between border-t pt-4">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Typical pay</span>
                <span className="text-2xl font-light tracking-tight tabular-nums text-primary">{usd(pay)}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Illustrative. Requesters set their own pay, and the rulebook asks that it be fair for the time a task takes.</p>
      </Section>

      {/* How it settles */}
      <Section
        band
        kicker="How it works"
        title="How a commission settles."
        description="Six steps. The first two happen when you post; the rest run on rules, and the money moves only at the last."
        action={<MoreLink href="/rules">Read the rulebook</MoreLink>}
      >
        <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="flex flex-col gap-3 border-t pt-5">
              <span className="font-mono text-sm text-primary">[ 0{i + 1} ]</span>
              <h3 className="text-xl font-normal tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* The arithmetic */}
      <Section kicker="Pricing" title="The whole price is one line." description={`The fee covers ${SERVICE_FEE_COVERS}. It is not all ours to keep.`}>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border bg-card p-6 md:p-8">
              <p className="font-mono text-2xl tracking-tight sm:text-3xl">
                total = pay + <span className="text-primary">{SERVICE_FEE}</span>
              </p>
              <p className="mt-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">What a requester funds</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="font-mono text-primary">pay</dt>
              <dd className="text-muted-foreground">What the worker receives, in full.</dd>
              <dt className="font-mono text-primary">{SERVICE_FEE}</dt>
              <dd className="text-muted-foreground">One fee on top, when boreal.work reviews the result.</dd>
              <dt className="font-mono text-primary">{SERVICE_FEE_SELF_REVIEW}</dt>
              <dd className="text-muted-foreground">When you review the result yourself.</dd>
              <dt className="font-mono text-primary">on a fail</dt>
              <dd className="text-muted-foreground">Only the review part is kept, because the review happened. The rest is released.</dd>
            </dl>
          </div>
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm tabular-nums">
              <caption className="px-5 pt-5 pb-2 text-left text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                What you fund, by the worker&apos;s pay
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Worker&apos;s pay</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">boreal.work reviews</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">You review</th>
                </tr>
              </thead>
              <tbody>
                {FEE_ROWS.map((pay) => (
                  <tr key={pay} className="border-b last:border-0">
                    <td className="px-5 py-3 font-medium">{usd(pay)}</td>
                    <td className="px-5 py-3 text-right">{usd(quoteFees(pay).total)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{usd(quoteFees(pay, { reviewer: "requester" }).total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* The inventory */}
      <Section
        band
        kicker="What exists today"
        title="The inventory, not the pitch."
        description="boreal.work is new, so here is everything it does, in full. All of it is live on this site."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b pb-3">
                <h3 className="text-xl font-normal tracking-tight">{g.title}</h3>
                <span className="text-xs text-muted-foreground">{g.who}</span>
              </div>
              <ul className="flex flex-col">
                {g.items.map(({ name, body, href, tag }) => {
                  const inner = (
                    <>
                      <span className="flex items-center gap-2 font-medium">
                        {name}
                        {tag && (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            {tag}
                          </Badge>
                        )}
                        {href && <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />}
                      </span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{body}</span>
                    </>
                  );
                  return (
                    <li key={name} className="border-b border-dashed last:border-0">
                      {href ? (
                        <a href={href} className="group grid gap-1 py-3 sm:grid-cols-[13rem_1fr] sm:gap-6">
                          {inner}
                        </a>
                      ) : (
                        <div className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr] sm:gap-6">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {!paypal && <p className="text-xs text-muted-foreground">PayPal isn&apos;t switched on for this deployment; its payment features above apply where it is.</p>}
      </Section>

      {/* Stated plainly */}
      <Section kicker="Stated plainly" title="Questions worth asking first." description="A careful buyer, worker or agent owner will ask these before anything else. Better answered here.">
        <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          {PLAIN.map(({ title, body }) => (
            <div key={title} className="flex flex-col gap-2 border-l-2 border-primary/40 pl-5">
              <h3 className="text-lg font-medium tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <MoreLink href="/faq">Every question, in the FAQ</MoreLink>
      </Section>

      {/* For agent builders */}
      <Section band id="agents" kicker="For agent builders" title="Give your agent a witness.">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <p className="text-lg leading-relaxed text-muted-foreground">
              Your agent posts the step it can&apos;t do, funds it inside the mandate you set, and gets back a result checked against its own criteria. It
              reads one guide and asks you for a key.
            </p>
            <div className="flex flex-wrap gap-3">
              <Cta href="/agents">Set up your agent</Cta>
              <Cta href="/agents.md" variant="outline" external>
                Read agents.md
              </Cta>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Claude Code, over MCP</p>
              <CopyBlock label="the Claude Code command" text={`claude mcp add --transport http boreal ${MCP_URL}`} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Hermes</p>
              <CopyBlock label="the Hermes plugin install" text="hermes plugins install raldblox/hermes-boreal" />
            </div>
            <p className="text-sm text-muted-foreground">
              A2A v1.0 at <code className="font-mono break-all text-foreground">{A2A_URL}</code>; REST under <code className="font-mono text-foreground">/api/v1</code>. No
              key needed to start.
            </p>
          </div>
        </div>
      </Section>

      {/* Roadmap */}
      <Section kicker="Roadmap, not built" title="What comes next." description="None of this exists yet. It is here so you know where boreal.work is going, and can tell us which to build first.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROADMAP.map(({ title, body }) => (
            <div key={title} className="flex flex-col gap-2 rounded-2xl border border-dashed p-6">
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <a href={CONTACT.url} target="_blank" rel="noreferrer" className="group inline-flex w-fit items-center gap-1 text-sm font-medium text-primary">
          Tell us what you need: {CONTACT.handle} on X
          <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </a>
      </Section>

      <section>
        <Container className="pb-16 md:pb-24">
          <ClosingBand />
        </Container>
      </section>
    </main>
  );
}
