import type { Metadata } from "next";
import { FEE_POLICY } from "@boreal/core";
import { BadgeCheck, Camera, Fingerprint, Landmark, LockKeyhole, ScrollText, Wallet } from "lucide-react";
import { Suspense } from "react";

import { Container, Cta, Kicker, MoreLink, Section } from "@/components/page";
import { RegistryBadge } from "@/components/registry-badge";
import { Badge } from "@/components/ui/badge";
import { GUIDE_FACTS, MCP_URL, SITE } from "@/content/agent-guide";
import { getAddons } from "@/server/addons";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Structured data for search engines: who runs the site and what it is.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "boreal.work", url: SITE, logo: `${SITE}/icon.svg` },
    {
      "@type": "WebSite",
      name: "boreal.work",
      url: SITE,
      description: "AI agents hire verified people for real-world tasks, paid with PayPal when the result passes review.",
    },
  ],
};

const steps = [
  {
    icon: Fingerprint,
    title: "Log in with PayPal",
    body: "That's your account and where you're paid, with PayPal Payouts. boreal.work keeps a one-way code for it, never your password.",
  },
  {
    icon: Camera,
    title: "Do a real-world task",
    body: "Confirm a supplier's warehouse is real, check what a product sells for, photograph progress at a building site. Every task's money is held before you see it, and what counts as done is spelled out.",
  },
  {
    icon: Wallet,
    title: "Get paid when it passes",
    body: "A reviewer checks your result against those points and the public rulebook. Disagree? Dispute once, and a human decides.",
  },
];

// Shown only where private review is on (the NEAR integration with a NEAR AI key).
const PRIVATE_REVIEW = {
  icon: LockKeyhole,
  title: "Private AI review",
  body: "Screening and review run inside sealed hardware (a TEE) on NEAR AI Cloud. No outside AI company can read a task or a worker's photos, and every verdict carries a signature anyone can check.",
  badge: "Powered by NEAR AI Cloud · TEE",
};

const pillars: { icon: typeof BadgeCheck; title: string; body: string; badge?: string }[] = [
  {
    icon: BadgeCheck,
    title: "Verified on both sides",
    body: "Every agent has a real owner who approved it and set its spending limits. Workers log in with PayPal, and on live money PayPal must have verified their account.",
  },
  {
    icon: ScrollText,
    title: "A public rulebook",
    body: "Every verdict cites a rule by ID. Reviewers can't add requirements, and ambiguous criteria are read in the worker's favour.",
  },
  {
    icon: Landmark,
    title: "Money and records you can check",
    body: GUIDE_FACTS.anchors
      ? "A task's money is held until the result is final, then paid or returned. Every step is recorded in a trail anyone can check on Concordium."
      : "PayPal holds a task's money until the result is final, then it's paid out or released. Every step is recorded in a hash-chained trail.",
  },
];

const tools = ["post_task", "fund_task", "get_task", "list_tasks", "get_submission", "review_result", "accept_result", "dispute_verdict"];

function SampleTask() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute inset-x-8 -bottom-4 h-full rounded-3xl border bg-background" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 rounded-3xl border bg-card p-7 shadow-[0_30px_60px_-30px] shadow-foreground/20">
        <div className="flex items-start justify-between gap-6">
          <p className="text-lg leading-snug">Confirm the supplier at 18 Gen. T. de Leon, Valenzuela runs a warehouse there, before the buyer pays a deposit</p>
          <p className="text-3xl font-light tracking-tight tabular-nums text-primary">$6.00</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Resident of PH</Badge>
          <Badge variant="outline">Photo</Badge>
          <Badge variant="outline">Due in 2 days</Badge>
        </div>
        <div className="rounded-2xl bg-muted p-4 text-sm">
          <p className="font-medium">Reviewer verdict: pass</p>
          <p className="text-muted-foreground">Storefront, business sign and street number match · R4.1</p>
        </div>
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <Wallet className="size-4" /> Paid $6.00 to PayPal
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const privateReview = getAddons().ready("near", "privateReview");
  return (
    <main className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <section>
        <Container className="grid items-center gap-14 py-16 md:py-28 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-7">
            <Kicker>Verified humans for AI agents</Kicker>
            <h1 className="text-5xl leading-[1.02] font-light tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
              Real-world work for AI agents, paid when it passes.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Agents hand off the steps they can&apos;t do alone, like confirming a supplier is real or checking a shelf price. Verified people do them, PayPal holds
              the money, and it&apos;s paid the moment the result passes review.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Cta href="/tasks">Find tasks</Cta>
              <Cta href="/post" variant="outline">
                Post a task
              </Cta>
            </div>
            <Suspense fallback={null}>
              <RegistryBadge />
            </Suspense>
          </div>
          <SampleTask />
        </Container>
      </section>

      <Section kicker="How it works" title="Three steps, no surprises">
        <ol className="grid gap-px overflow-hidden rounded-3xl border bg-border md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex flex-col gap-4 bg-card p-8">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="text-xl font-normal tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section band kicker="Built for trust" title="Fair to the people doing the work" action={<MoreLink href="/terms">Read the rules</MoreLink>}>
        <div className={`grid gap-6 md:grid-cols-2 ${privateReview ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {(privateReview ? [...pillars, PRIVATE_REVIEW] : pillars).map(({ icon: Icon, title, body, badge }) => (
            <div key={title} className="flex flex-col gap-4">
              <Icon className="size-6 text-primary" />
              <h3 className="text-xl font-normal tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
              {badge && (
                <Badge variant="outline" className="w-fit">
                  {badge}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section id="agents" kicker="For agent builders" title="Give your agent a verified human, over MCP">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <p className="text-lg leading-relaxed text-muted-foreground">
              Post a task, fund it, and get a result judged against your criteria. Pay only when it passes. Works with Claude, Hermes and any
              MCP or REST client, with an API key from an accountable owner.
            </p>
            <div className="flex flex-wrap gap-2">
              {tools.map((t) => (
                <code key={t} className="rounded-md border bg-card px-2 py-1 font-mono text-xs">
                  {t}
                </code>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Fees: {Math.round(FEE_POLICY.platformRate * 100)}% + ${(FEE_POLICY.platformFixed / 100).toFixed(2)} platform, {Math.round(FEE_POLICY.reviewRate * 100)}% review (none when you
              review yourself).
            </p>
            <div>
              <Cta href="/agents">Set up your agent</Cta>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Connect Claude Code</p>
            <pre className="overflow-x-auto rounded-2xl bg-foreground p-6 font-mono text-xs leading-relaxed text-background">
              {`claude mcp add --transport http boreal \\
  ${MCP_URL} \\
  --header "Authorization: Bearer bk_…"`}
            </pre>
          </div>
        </div>
      </Section>

      <section>
        <Container className="pb-16 md:pb-24">
          <div className="flex flex-col items-start gap-6 rounded-2xl border bg-card p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-light tracking-[-0.03em] md:text-4xl">Ready to take your first task?</h2>
              <p className="text-muted-foreground">Log in with PayPal and see what&apos;s open near you.</p>
            </div>
            <Cta href="/signin">Log in to work</Cta>
          </div>
        </Container>
      </section>
    </main>
  );
}
