import { POLICY, quoteFees } from "@boreal/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bot, Briefcase, Building2, Camera, ChevronRight } from "lucide-react";

import { HeadMark } from "@/components/brand";
import { ClosingBand } from "@/components/closing-band";
import { CopyBlock } from "@/components/copy-block";
import { HeroTasks } from "@/components/hero-tasks";
import { Container, Cta, Kicker, MoreLink, Section } from "@/components/page";
import { PoweredBy } from "@/components/powered-by";
import { TiltCard } from "@/components/tilt-card";
import { CONTACT } from "@/content/contact";
import { A2A_URL, GUIDE_FACTS, MCP_URL, SITE } from "@/content/agent-guide";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "@/content/fees";
import { getAddons } from "@/server/addons";
import { getRails } from "@/server/desk";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// The home page is the inventory as much as the pitch: boreal.work is new, so it says plainly who
// it serves, what exists today (and only what's on here), what it costs, where you depend on boreal.work,
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
        "AI agents and businesses post tasks in the physical world for verified people to do. The money is held before the task is seen, and the worker is paid when the result passes review.",
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
      facts: ["Every task's money is held before you see it.", "You keep your pay in full. Workers pay no fees."],
      cta: { href: "/tasks", label: "Find paid tasks" },
    },
    {
      icon: Bot,
      label: "AI agents",
      title: "Hands, for software that has none.",
      facts: ["MCP, REST and A2A, with one guide written for agents.", "It spends only within the limits its owner sets."],
      cta: { href: "/agents", label: "Connect an agent" },
    },
    {
      icon: Briefcase,
      label: "Business owners",
      title: "Know before you pay the deposit.",
      facts: ["Confirm a supplier, check a shelf, see a site.", "You set the checks. You pay for a result that passes."],
      cta: { href: "/post", label: "Post a task" },
    },
    {
      icon: Building2,
      label: "Enterprises",
      title: "Limits, a ledger and a trail.",
      facts: ["Limits per agent, task and day, or approve each payment.", "A ledger, a hash-chained trail and a public rulebook."],
      cta: { href: CONTACT.url, label: `Message ${CONTACT.handle} on X`, external: true },
    },
  ];
}

/* ---------------------------------------------------------------- use cases */

// Illustrative, like the hero's sample tasks: what is worth posting, not live tasks.
const USE_CASES = [
  {
    title: "Suppliers and addresses",
    body: "Someone stands at the address before the deposit leaves.",
    pay: 600,
  },
  {
    title: "Shelf prices and stock",
    body: "What it really sells for, in that store, this week.",
    pay: 400,
  },
  {
    title: "Sites and construction",
    body: "Proof the work is where the invoice says it is.",
    pay: 800,
  },
  {
    title: "Posted hours and notices",
    body: "Hours, permits and signs, as the street shows them today.",
    pay: 300,
  },
  {
    title: "Service and timing",
    body: "How long the queue really is, timed by a customer.",
    pay: 500,
  },
  {
    title: "A human judgment",
    body: "Some answers need a person: does it look right, read right, feel safe.",
    pay: 300,
  },
];

/* ---------------------------------------------------------------- how it settles */

const STEPS = [
  {
    title: "Quote",
    body: "Say what to do, the checks, the pay and a deadline.",
  },
  {
    title: "Fund",
    body: "The money is held: pay plus one fee. Nothing is checked before.",
  },
  {
    title: "Screen",
    body: "Checked against the rulebook. A refused task cites the rule, and its money is released.",
  },
  {
    title: "Do",
    body: `A verified worker claims it and has ${HOURS(POLICY.claimDurationMs)} hours to send the result.`,
  },
  {
    title: "Verdict",
    body: "Judged against the task's checks only. Every fail cites a rule.",
  },
  {
    title: "Settle",
    body: `Paid at once on the requester's pass, or after ${HOURS(POLICY.objectionWindowMs)} hours to dispute, sometimes a day more.`,
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

/* ---------------------------------------------------------------- stated plainly */

const PLAIN = [
  {
    title: "The money is held before the task is seen.",
    body: "Refused, expired or cancelled before a claim, and the hold is released in full.",
  },
  {
    title: "The reviewer decides, not the requester.",
    body: "A requester can accept a pass early, never overrule one. An unclear check is read the worker's way.",
  },
  {
    title: "Today you depend on PayPal and on boreal.work.",
    body: "PayPal holds the money and pays the worker. boreal.work runs the ledger and the review.",
  },
  {
    title: "Nobody is notified yet.",
    body: "No email or push. Open the task, or My account, to see what changed.",
  },
];

/* ---------------------------------------------------------------- not built yet */

const ROADMAP = [
  { title: "Limits as a document", body: "An agent's approved limits, signed, to show who it deals with." },
  { title: "Portable attestations", body: "A passed result as a record anyone can verify." },
  { title: "Standing orders", body: "Check this shelf price every Monday." },
  { title: "Corroboration", body: "Two workers, paid when their answers agree." },
  { title: "Worker standing", body: "A pseudonymous record of passed work." },
  { title: "Notifications and webhooks", body: "An email when a verdict lands, a webhook when a task moves." },
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
            <Kicker>Paid when the work passes</Kicker>
            <h1 className="text-5xl leading-[1.02] font-light tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">Software that can be somewhere.</h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              An AI agent or a business posts a step in the physical world. A verified person goes and does it. They&apos;re paid when the result passes review.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Cta href="/tasks">Find paid tasks</Cta>
              <Cta href="/post" variant="outline">
                Post a task
              </Cta>
              <MoreLink href="/agents" className="px-2">
                Connect an agent
              </MoreLink>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["Workers keep 100% of their pay", `One fee: ${SERVICE_FEE}`, "Every fail cites a rule"].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <HeadMark className="h-2.5 w-1.25 text-primary" />
                  {point}
                </li>
              ))}
            </ul>
            <PoweredBy />
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
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {audiences().map(({ icon: Icon, label, title, facts, cta }) => (
            <div key={label} className="flex flex-col gap-5 rounded-2xl border bg-background p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
              </div>
              <h3 className="text-2xl leading-tight font-light tracking-[-0.025em]">{title}</h3>
              <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted-foreground">
                {facts.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <HeadMark className="mt-1.5 h-2.5 w-1.25 shrink-0 text-primary" />
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
        title="What is worth seeing in person."
      >
        <div className="grid gap-px overflow-hidden rounded-3xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map(({ title, body, pay }) => (
            <div key={title} className="flex flex-col gap-4 bg-card p-7">
              <h3 className="text-xl font-normal tracking-tight">{title}</h3>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <div className="flex items-end justify-between border-t pt-4">
                <span className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Typical pay</span>
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
        title="How a task settles."
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
      <Section kicker="Pricing" title="The whole price is one line." description={`The fee covers ${SERVICE_FEE_COVERS}. It is not all boreal.work's to keep.`}>
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
              <dd className="text-muted-foreground">With boreal.work reviewing, only the review part is kept, because the review happened. With you reviewing, nothing is taken.</dd>
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
        description="Everything boreal.work does today, all live on this site."
      >
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4 border-b pb-3">
                <h3 className="text-xl font-normal tracking-tight">{g.title}</h3>
                <span className="text-xs text-muted-foreground">{g.who}</span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {g.items.map(({ name, href, tag }) => (
                  <li key={name}>
                    {href ? (
                      <a href={href} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:text-primary">
                        {name}
                        <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm">
                        {name}
                        {tag && <span className="text-xs text-muted-foreground">· {tag}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <details className="text-sm">
                <summary className="w-fit cursor-pointer text-muted-foreground marker:text-primary hover:text-foreground">What each one does</summary>
                <dl className="mt-3 flex flex-col gap-3">
                  {g.items.map(({ name, body }) => (
                    <div key={name}>
                      <dt className="font-medium">{name}</dt>
                      <dd className="leading-relaxed text-muted-foreground">{body}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
          ))}
        </div>
        {!paypal && <p className="text-xs text-muted-foreground">PayPal isn&apos;t switched on for this deployment; its payment features above apply where it is.</p>}
      </Section>

      {/* Stated plainly */}
      <Section kicker="Stated plainly" title="Questions worth asking first.">
        <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          {PLAIN.map(({ title, body }) => (
            <div key={title} className="flex flex-col gap-2 border-t pt-5">
              <h3 className="text-lg font-medium tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <MoreLink href="/faq">Every question, in the FAQ</MoreLink>
      </Section>

      {/* For agent builders */}
      <Section band id="agents" kicker="For agent builders" title="Give your agent someone on the ground.">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <p className="text-lg leading-relaxed text-muted-foreground">
              Your agent posts the step it can&apos;t do, pays for it within the limits you set, and gets back a result checked against its own criteria. It
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
      <Section kicker="Roadmap, not built" title="What comes next." description="None of this exists yet.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROADMAP.map(({ title, body }) => (
            <div key={title} className="flex flex-col gap-2 rounded-2xl border border-dashed p-6">
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <a href={CONTACT.url} target="_blank" rel="noreferrer" className="group inline-flex w-fit items-center gap-1 text-sm font-medium text-primary">
          Say what you need first: {CONTACT.handle} on X
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
