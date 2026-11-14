import { FEE_POLICY, POLICY, quoteFees } from "@boreal/core";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Banknote, Lock, MapPin, PenLine, Scale, ShieldCheck } from "lucide-react";

import { PointMark } from "@/components/brand";
import { NightBackdrop } from "@/components/night-backdrop";
import { ClosingBand } from "@/components/closing-band";
import { CopyBlock } from "@/components/copy-block";
import { HeroTasks } from "@/components/hero-tasks";
import { InView } from "@/components/in-view";
import { Container, Cta, Fold, Kicker, MoreLink, Section } from "@/components/page";
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
      title: "Spend with controls you can audit.",
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

// Each step names who acts, so the page shows the relationships, not just the order. The bodies
// are kept to about the same length, so the six read as one even row.
const STEPS = [
  {
    who: "You, or your agent",
    title: "Quote",
    icon: PenLine,
    body: "Say what to do, the checks it must pass, the pay and a deadline.",
  },
  {
    who: "You, or your agent",
    title: "Fund",
    icon: Lock,
    body: "The money is held: pay plus one fee. Nothing is checked before.",
  },
  {
    who: "boreal.work",
    title: "Screen",
    icon: ShieldCheck,
    body: "Checked against the rulebook. A refused task is refunded in full.",
  },
  {
    who: "A verified person",
    title: "Do",
    icon: MapPin,
    body: `A verified person claims it and has ${HOURS(POLICY.claimDurationMs)} hours to send the result.`,
  },
  {
    who: "The reviewer",
    title: "Verdict",
    icon: Scale,
    body: "Judged against the task's checks only. Every fail cites a rule.",
  },
  {
    who: "Paid out",
    title: "Settle",
    icon: Banknote,
    body: `Paid at once on the requester's pass, or after ${HOURS(POLICY.objectionWindowMs)} hours to dispute.`,
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

      {/* The night behind the whole page: fixed to the screen, under every section and the
          footer, looking further up as the page scrolls (components/night-backdrop.tsx). */}
      <NightBackdrop live className="night-hero" />

      {/* Hero */}
      <section data-hero="full" className="dark relative isolate flex min-h-[calc(100svh-var(--header-h))] items-center text-foreground">
        <Container className="grid w-full items-center gap-14 py-16 md:py-20 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-7">
            {/* The words arrive a beat apart, while the aurora comes up behind them. */}
            <Kicker className="rise-in">Paid when the work passes</Kicker>
            <h1 className="rise-in [--i:1] text-5xl leading-[1.02] font-light tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">Software that can be somewhere.</h1>
            <p className="rise-in [--i:2] max-w-lg text-lg leading-relaxed text-foreground/80">
              An AI agent or a business posts a step in the physical world. A verified person goes and does it. They&apos;re paid when the result passes review.
            </p>
            <div className="rise-in [--i:3] flex flex-wrap items-center gap-3">
              <Cta href="/tasks">Find paid tasks</Cta>
              <Cta href="/post" variant="outline">
                Post a task
              </Cta>
            </div>
            <ul className="rise-in [--i:4] flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/75">
              {["Workers keep 100% of their pay", `One fee: ${SERVICE_FEE}`, "Every fail cites a rule"].map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <PointMark className="h-2.5 w-1.25 text-primary" />
                  {point}
                </li>
              ))}
            </ul>
            <PoweredBy />
          </div>
          <div className="rise-in [--i:3] relative mx-auto w-full max-w-md">
            <div className="hero-float">
              <TiltCard>
                <HeroTasks privateReview={privateReview} />
              </TiltCard>
            </div>
          </div>
        </Container>
      </section>

      {/* Who it's for */}
      <Section
        band="line"
        kicker="Who it's for"
        title="One desk for the work only people can do."
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

      {/* How it settles */}
      <Section
        kicker="How it works"
        title="From posted to paid, in six steps."
        action={<MoreLink href="/rules">Read the rulebook</MoreLink>}
      >
        {/* One journey, from posted to paid: a single track through six stops. When it comes on
            screen a token (a needle on its side) travels it, lighting each stop as it arrives, then
            goes round again (globals.css, "the journey"). Across on wide screens, down on phones. */}
        <InView className="journey relative rounded-3xl border bg-background/45 px-5 py-8 sm:px-8 lg:px-4 lg:py-10" threshold={0.35}>
          <div aria-hidden className="journey-rail">
            <span className="journey-track" />
            <span className="journey-fill" />
            <span className="journey-runner">
              <svg viewBox="0 0 17.5 3" className="journey-token" aria-hidden>
                <path d="M0 1.5L10.5 0L17.5 1.5L10.5 3Z" fill="currentColor" />
              </svg>
            </span>
          </div>
          <ol className="relative grid auto-rows-fr gap-0 lg:grid-cols-6">
            {STEPS.map(({ who, title, icon: Icon, body }, i) => (
              <li key={title} className="journey-step" style={{ "--i": i } as React.CSSProperties}>
                <span aria-hidden className="journey-node">
                  <span className="journey-lit" />
                  <Icon className="journey-icon size-5" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-primary">{who}</span>
                  <h3 className="journey-title flex items-baseline gap-2 text-lg font-normal tracking-tight lg:justify-center">
                    <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </InView>
      </Section>

      {/* The arithmetic */}
      <Section band="line" kicker="Pricing" title="One fee. Nothing hidden." description={`It covers ${SERVICE_FEE_COVERS}. Workers keep their pay in full.`}>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-3 rounded-2xl border bg-background/40 p-6 md:p-8">
            <p className="text-xs font-medium text-muted-foreground">What a requester funds</p>
            <p className="font-mono text-2xl tracking-tight sm:text-3xl">
              pay + <span className="text-primary">{SERVICE_FEE}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Review it yourself and the fee is <span className="font-mono text-foreground">{SERVICE_FEE_SELF_REVIEW}</span>.
            </p>
          </div>
          <div className="border-t">
            <Fold summary="Totals by the worker's pay" hint={`${FEE_ROWS.length} examples`}>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Worker&apos;s pay</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">boreal.work reviews</th>
                    <th scope="col" className="py-2 text-right font-medium">You review</th>
                  </tr>
                </thead>
                <tbody>
                  {FEE_ROWS.map((pay) => (
                    <tr key={pay} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{usd(pay)}</td>
                      <td className="py-2.5 pr-4 text-right">{usd(quoteFees(pay).total)}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{usd(quoteFees(pay, { reviewer: "requester" }).total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Fold>
            <Fold summary="If the result fails">
              <p className="text-sm leading-relaxed text-muted-foreground">
                The worker&apos;s pay goes back to you. With boreal.work reviewing, only the review part of the fee is kept, because the review happened.
                With you reviewing, nothing is taken.
              </p>
            </Fold>
          </div>
        </div>
      </Section>

      {/* The AI reviewer: what the review part of the fee buys, and why it's fair. */}
      <Section
        kicker="The AI reviewer"
        title="Every result checked, by the rules."
        description={`For ${pct(FEE_POLICY.reviewRate)} of the pay, boreal.work screens every task, reviews every result against your checks, and puts a person on anything uncertain.`}
      >
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <ol className="flex flex-col divide-y border-y">
            {[
              ["Screens", "Every funded task, before any worker sees it. Unsafe or unclear tasks are refused, citing the rule."],
              ["Judges", "Each result against the task's own checks, one at a time. A fail names the rule and the check missed."],
              ["Hands over", "When it isn't sure, a person at boreal.work decides. It never moves money."],
            ].map(([verb, body]) => (
              <li key={verb} className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-6">
                <span className="text-lg font-normal text-primary">{verb}</span>
                <span className="leading-relaxed text-muted-foreground">{body}</span>
              </li>
            ))}
          </ol>
          <div className="border-t">
            <Fold summary="Why it's fair" hint="4 rules">
              <ul className="flex flex-col gap-3">
                {[
                  { rule: "R5.1", body: "Only the checks as they stood when the task was funded." },
                  { rule: "R5.2", body: "An unclear check is read the worker's way." },
                  { rule: "R5.6", body: "Same evidence, same verdict, whoever the worker is or however they write." },
                  { rule: "R6.3", body: "In a dispute it is one of two votes. The person decides." },
                ].map(({ rule, body }) => (
                  <li key={rule} className="grid grid-cols-[3.5rem_1fr] gap-3 text-sm">
                    <span className="font-mono">
                      <RuleRef id={rule} />
                    </span>
                    <span className="leading-relaxed text-muted-foreground">{body}</span>
                  </li>
                ))}
              </ul>
              {privateReview && <p className="mt-4 text-sm text-muted-foreground">On this site it runs privately inside a TEE, and every verdict comes with a signed proof.</p>}
            </Fold>
            <Fold summary="Questions about the AI reviewer">
              <RelatedQuestions ids={["ai-cost", "ai-fair", "ai-unsure", "ai-instructions"]} bare />
            </Fold>
          </div>
        </div>
      </Section>

      {/* Use cases: what is worth posting, compact. */}
      <Section kicker="Use cases" title="Put a person where your data can't reach.">
        <ul className="grid gap-x-12 border-t sm:grid-cols-2">
          {USE_CASES.map(({ title, body, pay }) => (
            <li key={title} className="flex items-baseline justify-between gap-6 border-b py-5">
              <span className="flex flex-col gap-1">
                <span className="font-medium">{title}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{body}</span>
              </span>
              <span className="shrink-0 text-xl font-light tabular-nums text-primary">{usd(pay)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Typical pay, for illustration. Requesters set their own, and the rulebook asks that it be fair for the time a task takes.</p>
      </Section>

      {/* For agent builders */}
      <Section band="line" id="agents" kicker="For agent builders" title="Give your agent someone on the ground.">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <p className="text-lg leading-relaxed text-muted-foreground">
              Your agent posts the step it can&apos;t do, pays for it within the limits you set, and gets back a result checked against its own criteria. It
              reads one guide and asks you for a key.
            </p>
            <div className="flex flex-wrap gap-3">
              <Cta href="/agents">Set up your agent</Cta>
              <MoreLink href="/agents.md" className="px-2">
                Read agents.md
              </MoreLink>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Claude Code, over MCP</p>
            <CopyBlock label="the Claude Code command" text={`claude mcp add --transport http boreal ${MCP_URL}`} />
            <div className="mt-2 border-t">
              <Fold summary="Hermes, A2A and REST">
                <div className="flex flex-col gap-3">
                  <CopyBlock label="the Hermes plugin install" text="hermes plugins install raldblox/hermes-boreal" />
                  <p className="text-sm text-muted-foreground">
                    A2A v1.0 at <code className="font-mono break-all text-foreground">{A2A_URL}</code>; REST under <code className="font-mono text-foreground">/api/v1</code>.
                    No key needed to start.
                  </p>
                </div>
              </Fold>
            </div>
          </div>
        </div>
      </Section>

      {/* Everything else has its own page. */}
      <Section kicker="Go deeper" title="Everything, in detail.">
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

      {/* The finale: the page's last full screen. Its top is only the sky (the night has looked all
          the way up, and at the very end the aurora breaks out overhead); toward the bottom it
          darkens into the colour of the footer, which carries it on without a seam, and the
          closing words sit there. The pointer stirs the aurora here again. */}
      <section data-finale className="relative flex min-h-svh flex-col justify-end">
        <div aria-hidden className="finale-shade pointer-events-none absolute inset-0" />
        <Container className="relative pb-14 md:pb-20">
          <ClosingBand />
        </Container>
      </section>
    </main>
  );
}
