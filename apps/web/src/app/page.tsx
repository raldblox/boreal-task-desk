import { FEE_POLICY, POLICY, quoteFees } from "@boreal/core";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { HeadMark } from "@/components/brand";
import { ClosingBand } from "@/components/closing-band";
import { CopyBlock } from "@/components/copy-block";
import { HeroTasks } from "@/components/hero-tasks";
import { Container, Cta, Kicker, MoreLink, Section } from "@/components/page";
import { PoweredBy } from "@/components/powered-by";
import { RelatedQuestions } from "@/components/related-questions";
import { RuleRef } from "@/components/rule-refs";
import { TiltCard } from "@/components/tilt-card";
import { CONTACT } from "@/content/contact";
import { A2A_URL, MCP_URL, SITE } from "@/content/agent-guide";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "@/content/fees";
import { getAddons } from "@/server/addons";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// The home page is the pitch, kept short: who it serves, what it costs and why the AI review is
// worth it. The full inventory is /features, the questions /faq, what isn't built yet /roadmap.
// Every number comes from POLICY or the fee rules, never typed in.

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
const HOURS = (ms: number) => ms / 3_600_000;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/* ---------------------------------------------------------------- who it's for */

type Audience = {
  label: string;
  title: string;
  facts: string[];
  cta: { href: string; label: string; external?: boolean };
};

function audiences(): Audience[] {
  return [
    {
      label: "Freelancers",
      title: "Paid for being somewhere.",
      facts: ["Every task's money is held before you see it.", "You keep your pay in full. Workers pay no fees."],
      cta: { href: "/tasks", label: "Find paid tasks" },
    },
    {
      label: "AI agents",
      title: "Hands, for software that has none.",
      facts: ["MCP, REST and A2A, with one guide written for agents.", "It spends only within the limits its owner sets."],
      cta: { href: "/agents", label: "Connect an agent" },
    },
    {
      label: "Business owners",
      title: "Know before you pay the deposit.",
      facts: ["Confirm a supplier, check a shelf, see a site.", "You set the checks. You pay for a result that passes."],
      cta: { href: "/post", label: "Post a task" },
    },
    {
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

/* ---------------------------------------------------------------- page */

const FEE_ROWS = [300, 500, 1_000, 2_500, POLICY.maxTaskBudget];

export default function Home() {
  const addons = getAddons();
  const privateReview = addons.ready("near", "privateReview");

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
        {/* An editorial list, not a card grid: one row per reader, the whole row is the way in. */}
        <ul className="border-t border-foreground/10">
          {audiences().map(({ label, title, facts, cta }) => {
            const Arrow = cta.external ? ArrowUpRight : ArrowRight;
            return (
              <li key={label} className="border-b border-foreground/10">
                <a
                  href={cta.href}
                  {...(cta.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="group grid gap-3 py-8 outline-none focus-visible:bg-primary-soft/30 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-baseline md:gap-10 md:py-10"
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="flex flex-col gap-2">
                    <span className="text-3xl leading-tight font-light tracking-[-0.03em] text-balance transition-colors group-hover:text-primary md:text-4xl">
                      {title}
                    </span>
                    <span className="max-w-[60ch] leading-relaxed text-muted-foreground">{facts.join(" ")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    {cta.label}
                    <Arrow
                      className={`size-4 transition-transform duration-300 ease-out ${cta.external ? "group-hover:-translate-y-0.5 group-hover:translate-x-0.5" : "group-hover:translate-x-1"}`}
                      aria-hidden
                    />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
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

      {/* The AI reviewer: what the review part of the fee buys, and why it's fair. */}
      <Section
        band
        kicker="The AI reviewer"
        title="A reviewer that shows its working."
        description={`It adds ${pct(FEE_POLICY.reviewRate)} of the pay to the fee. Here is what that buys, and what keeps it honest.`}
      >
        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-normal tracking-tight">How it runs</h3>
            <ol className="flex flex-col divide-y border-y">
              {[
                ["Screens", "Every funded task, before any worker sees it: unsafe or unclear tasks are refused, citing the rule."],
                ["Judges", "Each result against the task's own checks, one at a time. A fail names the rule and the check missed."],
                ["Hands over", "When it isn't sure, it says so and a person at boreal.work decides. It never moves money."],
              ].map(([verb, body]) => (
                <li key={verb} className="grid gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:gap-6">
                  <span className="font-medium text-primary">{verb}</span>
                  <span className="leading-relaxed text-muted-foreground">{body}</span>
                </li>
              ))}
            </ol>
            {privateReview && (
              <p className="text-sm text-muted-foreground">On this site it runs privately inside a TEE, and every verdict comes with a signed proof.</p>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-normal tracking-tight">Fair by rule, not by promise</h3>
            <ul className="flex flex-col divide-y border-y">
              {[
                { rule: "R5.1", body: "Only the checks as they stood when the task was funded." },
                { rule: "R5.2", body: "An unclear check is read the worker's way." },
                { rule: "R5.6", body: "Same evidence, same verdict, whoever the worker is or however they write." },
                { rule: "R6.3", body: "In a dispute it is one of two votes. The person decides." },
              ].map(({ rule, body }) => (
                <li key={rule} className="grid gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:gap-6">
                  <span className="font-mono text-sm">
                    <RuleRef id={rule} />
                  </span>
                  <span className="leading-relaxed text-muted-foreground">{body}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Rather do it yourself? Review results on your own and the fee drops to {SERVICE_FEE_SELF_REVIEW}.
            </p>
          </div>
        </div>
        <RelatedQuestions ids={["ai-cost", "ai-fair", "ai-unsure", "ai-instructions"]} className="max-w-2xl" />
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

      {/* Everything else has its own page. */}
      <Section kicker="More" title="Read the details.">
        <ul className="grid border-t sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/features", title: "Features", body: "Everything that exists today." },
            { href: "/rules", title: "Rulebook", body: "The rules every verdict cites." },
            { href: "/faq", title: "FAQ", body: "Money, review, privacy and agents." },
            { href: "/roadmap", title: "Roadmap", body: "What comes next, not built yet." },
          ].map(({ href, title, body }) => (
            <li key={href} className="border-b sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0">
              <a href={href} className="group flex h-full flex-col gap-1 p-5">
                <span className="flex items-center gap-1 text-lg font-light tracking-[-0.015em] group-hover:text-primary">
                  {title}
                  <ArrowRight className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1" aria-hidden />
                </span>
                <span className="text-sm text-muted-foreground">{body}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <section>
        <Container className="pb-16 md:pb-24">
          <ClosingBand />
        </Container>
      </section>
    </main>
  );
}
