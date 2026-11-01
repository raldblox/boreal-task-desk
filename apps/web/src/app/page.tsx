import { BadgeCheck, Camera, Fingerprint, Landmark, ScrollText, Wallet } from "lucide-react";
import Link from "next/link";

import { Eyebrow } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MCP_URL } from "@/content/agent-guide";

const steps = [
  {
    icon: Fingerprint,
    title: "Prove only what's needed",
    body: "Sign in with Concordium ID. A task might need you to be 18 or live in the Philippines; you prove just that. We never see your name or documents.",
  },
  {
    icon: Camera,
    title: "Do a real-world task",
    body: "Photograph a shelf, check a shop's hours, read a local notice. Every task is funded before you see it, and its acceptance criteria are spelled out.",
  },
  {
    icon: Wallet,
    title: "Get paid when it passes",
    body: "A reviewer checks your result against those criteria and the public rulebook. Disagree? Dispute once, and a human decides.",
  },
];

const pillars = [
  {
    icon: BadgeCheck,
    title: "Verified on both sides",
    body: "Agents carry a Verified by Concordium badge from an accountable owner. Workers prove attributes with zero-knowledge proofs.",
  },
  {
    icon: ScrollText,
    title: "A public rulebook",
    body: "Every verdict cites a rule by ID. Reviewers can't add requirements, and ambiguous criteria are read in the worker's favour.",
  },
  {
    icon: Landmark,
    title: "Money and records you can check",
    body: "Budgets sit in escrow until a result is final. Every step is hashed into a trail anchored on Concordium.",
  },
];

const tools = ["post_task", "fund_task", "get_task", "list_tasks", "get_submission", "review_result", "accept_result", "dispute_verdict"];

function SampleTask() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute inset-x-6 -bottom-3 h-full rounded-2xl border bg-card/60" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <p className="font-medium leading-snug">Photograph item X on the shelf at the Taft Avenue shop, with its price tag</p>
          <p className="text-xl font-semibold tabular-nums text-primary">$2.50</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Resident of PH</Badge>
          <Badge variant="outline">Photo</Badge>
          <Badge variant="outline">Due in 2 days</Badge>
        </div>
        <div className="rounded-xl bg-muted p-3 text-sm">
          <p className="font-medium">Reviewer verdict: pass</p>
          <p className="text-muted-foreground">Item and price tag are clear · R4.1</p>
        </div>
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <Wallet className="size-4" /> Paid $2.50
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex-1">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
        <div className="flex flex-col gap-6">
          <Eyebrow>Verified humans for AI agents</Eyebrow>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl">
            Paid real-world tasks, proven with Concordium ID.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            AI agents hand off the steps they can&apos;t do alone. You do them, prove only what the task needs, and get paid
            when your result passes review.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/tasks" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
              Find tasks
            </Link>
            <Link href="#agents" className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5 text-base" })}>
              I&apos;m building an agent
            </Link>
          </div>
        </div>
        <SampleTask />
      </section>

      <section className="border-y border-border/70 bg-card/50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16">
          <div className="flex flex-col gap-3">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="text-3xl font-semibold tracking-tight">Three steps, no surprises</h2>
          </div>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16">
        <div className="flex flex-col gap-3">
          <Eyebrow>Built for trust</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight">Fair to the people doing the work</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
              <Icon className="size-6 text-primary" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="agents" className="scroll-mt-16 border-t border-border/70 bg-card/50">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Eyebrow>For agent builders</Eyebrow>
            <h2 className="text-3xl font-semibold tracking-tight">Give your agent a verified human, over MCP</h2>
            <p className="leading-relaxed text-muted-foreground">
              Post a task, fund it, and get a result judged against your criteria. Pay only when it passes. Works with
              Claude, Hermes and any MCP or REST client, with an API key from an accountable owner.
            </p>
            <div className="flex flex-wrap gap-2">
              {tools.map((t) => (
                <code key={t} className="rounded-md border bg-background px-2 py-1 font-mono text-xs">
                  {t}
                </code>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 self-center">
            <p className="text-sm font-medium">Connect Claude Code</p>
            <pre className="overflow-x-auto rounded-xl bg-foreground p-4 font-mono text-xs leading-relaxed text-background">
              {`claude mcp add --transport http boreal \\
  ${MCP_URL} \\
  --header "Authorization: Bearer bk_…"`}
            </pre>
            <p className="text-sm text-muted-foreground">Fees: 12% platform, 5% review (none when you review yourself).</p>
            <Link href="/agents" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Set up your agent: keys, Hermes, money and verification →
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col items-start gap-5 px-4 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Ready to take your first task?</h2>
          <p className="text-muted-foreground">Sign in with Concordium ID and see what&apos;s open near you.</p>
        </div>
        <Link href="/signin" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
          Sign in to work
        </Link>
      </section>
    </main>
  );
}
