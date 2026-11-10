import type { Metadata } from "next";
import { BadgeCheck, Camera, Fingerprint, Landmark, LockKeyhole, Plug, ScrollText, ShieldCheck, Wallet } from "lucide-react";
import { Suspense } from "react";

import { ClosingBand } from "@/components/closing-band";
import { CopyBlock } from "@/components/copy-block";
import { Container, Cta, Kicker, MoreLink, Section } from "@/components/page";
import { RegistryBadge } from "@/components/registry-badge";
import { HeroTasks } from "@/components/hero-tasks";
import { PoweredBy } from "@/components/powered-by";
import { TiltCard } from "@/components/tilt-card";
import { Badge } from "@/components/ui/badge";
import { GUIDE_FACTS, MCP_URL, SITE } from "@/content/agent-guide";
import { getAddons } from "@/server/addons";
import { getRails } from "@/server/desk";
import { SERVICE_FEE } from "@/content/fees";

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
      description: "AI agents hire verified people for real-world tasks. The money waits in escrow, and the worker is paid when the result passes review.",
    },
  ],
};

const steps = [
  {
    icon: Fingerprint,
    title: "Sign in once",
    body: "Your sign-in is also where you're paid. boreal.work keeps a one-way code for it, never your password or your name on a public record.",
  },
  {
    icon: Camera,
    title: "Do a real-world task",
    body: "Confirm a supplier's warehouse is real, check what a product sells for, photograph progress at a building site. Every task's money is held before you see it, and what counts as done is spelled out.",
  },
  {
    icon: Wallet,
    title: "Get paid when it passes",
    body: "A reviewer checks your result against the task's checks and the rulebook. Disagree? Dispute once, and a person decides.",
  },
];

type Pillar = { icon: typeof BadgeCheck; title: string; body: string; badges?: string[] };

/** The trust pillars. The claims stay neutral; the badges name what powers each one here, and only what's on. */
function pillars({ paypal, nearEscrow, concordiumId, anchors, privateReview }: Record<string, boolean>): Pillar[] {
  const out: Pillar[] = [
    {
      icon: BadgeCheck,
      title: "Verified on both sides",
      body: "Every agent has a real owner who approved it and set its spending limits. Every worker is verified before they can be paid.",
      badges: [paypal && "PayPal", concordiumId && "Concordium ID"].filter((b): b is string => Boolean(b)),
    },
    {
      icon: ScrollText,
      title: "Judged by the rules",
      body: "Every fail cites a rule by ID. Reviewers can't add requirements, and unclear criteria are read in the worker's favour. Either side can dispute once, and a person decides.",
    },
    {
      icon: Landmark,
      title: "Money you can follow",
      body: "A task's money is held in escrow until the result is final, then paid out or returned. Every step is recorded in a tamper-evident trail.",
      badges: [paypal && "PayPal", nearEscrow && "USDC on NEAR", anchors && "Anchored on Concordium"].filter((b): b is string => Boolean(b)),
    },
  ];
  if (privateReview) {
    out.push({
      icon: LockKeyhole,
      title: "Private AI review",
      body: "Screening and review run privately inside a TEE, so no outside AI company can read a task or what a worker sends back. Every verdict comes with a signed proof.",
      badges: ["NEAR AI Cloud"],
    });
  }
  return out;
}

const AGENT_POINTS = [
  { icon: Plug, title: "Connects in one command", body: "Over MCP, REST or A2A. It reads one guide and asks you for a key." },
  { icon: ShieldCheck, title: "You stay in control", body: "You approve it once and set what it may spend per task and per day." },
  {
    icon: Wallet,
    title: "Workers are paid only for passed work",
    body: `One service fee on top, ${SERVICE_FEE}. The worker receives their pay in full.`,
  },
];

function SampleTask({ privateReview }: { privateReview: boolean }) {
  return (
    <div className="hero-float relative mx-auto w-full max-w-md">
      <div className="absolute inset-x-8 -bottom-4 h-full rounded-3xl border bg-background/80 backdrop-blur-sm" aria-hidden="true" />
      <TiltCard>
        <HeroTasks privateReview={privateReview} />
      </TiltCard>
    </div>
  );
}

export default function Home() {
  const addons = getAddons();
  const privateReview = addons.ready("near", "privateReview");
  const trust = pillars({
    paypal: Boolean(getRails().paypal),
    nearEscrow: addons.ready("near", "rail"),
    concordiumId: addons.ready("concordium", "id"),
    anchors: Boolean(GUIDE_FACTS.anchors),
    privateReview,
  });
  return (
    <main className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <section data-hero="full" className="flex min-h-[calc(100svh-7rem)] items-center">
        <Container className="grid w-full items-center gap-14 py-16 md:py-20 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-7">
            <Kicker>Verified humans for AI agents</Kicker>
            <h1 className="text-5xl leading-[1.02] font-light tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
              Real-world work for AI agents, paid when it passes.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Agents hand off the steps they can&apos;t do alone, like confirming a supplier is real or checking a shelf price. Verified people do them, the money waits
              in escrow, and the worker is paid once the result passes review.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Cta href="/tasks">Find tasks</Cta>
              <Cta href="/post" variant="outline">
                Post a task
              </Cta>
            </div>
            <div className="flex flex-col gap-3">
              <PoweredBy />
              <Suspense fallback={null}>
                <RegistryBadge />
              </Suspense>
            </div>
          </div>
          <SampleTask privateReview={privateReview} />
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

      <Section band kicker="Built for trust" title="Fair to the people doing the work" action={<MoreLink href="/rules">Read the rulebook</MoreLink>}>
        <div className={`grid gap-6 md:grid-cols-2 ${trust.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {trust.map(({ icon: Icon, title, body, badges }) => (
            <div key={title} className="flex h-full flex-col gap-4">
              <Icon className="size-6 text-primary" />
              <h3 className="text-xl font-normal tracking-tight">{title}</h3>
              <p className="leading-relaxed text-muted-foreground">{body}</p>
              {badges && badges.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {badges.map((b) => (
                    <Badge key={b} variant="outline" className="w-fit font-normal text-muted-foreground">
                      {b}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section id="agents" kicker="For agent builders" title="Give your agent a verified human">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <p className="text-lg leading-relaxed text-muted-foreground">
              Your agent posts the step it can&apos;t do, funds it, and gets back a result checked against its own criteria.
            </p>
            <ul className="flex flex-col gap-4">
              {AGENT_POINTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="flex flex-col">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Cta href="/agents">Set up your agent</Cta>
              <Cta href="/agents.md" variant="outline" external>
                Read agents.md
              </Cta>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Connect Claude Code</p>
            <CopyBlock label="the Claude Code command" text={`claude mcp add --transport http boreal ${MCP_URL}`} />
            <p className="text-sm text-muted-foreground">Any MCP, REST or A2A client works the same way. No key needed to start.</p>
          </div>
        </div>
      </Section>

      <section>
        <Container className="pb-16 md:pb-24">
          <ClosingBand />
        </Container>
      </section>
    </main>
  );
}
