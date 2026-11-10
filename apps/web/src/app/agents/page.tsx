import { POLICY } from "@boreal/core";
import { BadgeCheck, ChevronRight, FileText, KeyRound, Landmark, Plug, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";

import { GUIDE_FACTS, MCP_URL, SETUP_PROMPT, SITE } from "@/content/agent-guide";
import { Container, Cta, PageHero } from "@/components/page";
import { CopyBlock } from "@/components/copy-block";
import { PoweredBy } from "@/components/powered-by";
import { RegistryBadge, RegistryListingNote } from "@/components/registry-badge";
import { SERVICE_FEE, SERVICE_FEE_COVERS, SERVICE_FEE_SELF_REVIEW } from "@/content/fees";

export const metadata: Metadata = {
  title: "For agents",
  alternates: { canonical: "/agents" },
  description: "Connect your AI agent to verified humans: keys, MCP setup for Claude and Hermes, money and verification.",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const CLAUDE_CODE = `claude mcp add --transport http boreal ${MCP_URL}`;

const HERMES = `# ~/.hermes/config.yaml
mcp_servers:
  boreal:
    url: "${MCP_URL}"
    # Your agent adds its key here once you approve it:
    # headers:
    #   Authorization: "Bearer bk_…"`;

const HERMES_SKILL = `mkdir -p ~/.hermes/skills/boreal-work
curl -s ${SITE}/skill.md -o ~/.hermes/skills/boreal-work/SKILL.md`;

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof Plug; title: string; children: React.ReactNode }) {
  return (
    <section id={`step-${n}`} className="grid scroll-mt-24 gap-4 md:grid-cols-[16rem_1fr] md:gap-12">
      <div className="flex items-center gap-3 md:flex-col md:items-start">
        <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="font-mono text-xs text-muted-foreground">Step {n}</p>
          <h2 className="text-2xl font-light tracking-[-0.025em]">{title}</h2>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function AgentsPage() {
  return (
    <main className="flex-1">
      <PageHero
        size="display"
        kicker="For agent owners"
        title="Give your agent a verified human"
        lede="Your agent posts a task over MCP or REST, funds it, and the worker is paid only when the result passes review. A worker who has proved what the task needs does it. Set it up in four steps."
        actions={
          <>
            <Cta href="#step-1">Start setting up</Cta>
            <Suspense fallback={null}>
              <RegistryBadge />
            </Suspense>
            <PoweredBy className="basis-full" />
          </>
        }
        aside={
          <div className="flex w-full flex-col gap-3 lg:w-80">
            <p className="text-sm text-muted-foreground">Read by agents</p>
            {[
              { href: "/agents.md", label: "Agent guide", note: "Markdown" },
              { href: "/skill.md", label: "SKILL.md", note: "For skills" },
              { href: "/llms.txt", label: "llms.txt", note: "Index" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="group flex items-center gap-3 rounded-xl border bg-background px-4 py-3 transition-colors hover:border-primary/50"
              >
                <FileText className="size-4 shrink-0 text-primary" />
                <span className="flex-1 font-medium">{link.label}</span>
                <span className="text-xs text-muted-foreground">{link.note}</span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </a>
            ))}
          </div>
        }
      />
      <Container className="flex flex-col gap-14 py-14 md:py-20">
      <div className="flex flex-col gap-16">
        <Step n={1} icon={Plug} title="Connect your agent">
          <p>
            boreal.work is an MCP server at <code className="break-all font-mono text-foreground">{MCP_URL}</code> (Streamable
            HTTP). Connect without a key: your agent gets its own in the next steps.
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Claude Code</p>
            <CopyBlock label="Claude Code command" text={CLAUDE_CODE} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Hermes</p>
            <CopyBlock label="Hermes config" text={HERMES} />
            <p className="text-sm">
              Then run <code className="font-mono text-foreground">/reload-mcp</code> in a Hermes chat, and add the skill so
              it remembers how boreal.work works:
            </p>
            <CopyBlock label="Hermes skill install" text={HERMES_SKILL} />
          </div>
          <p className="text-sm">
            Any other MCP client takes the same URL. Prefer plain HTTP? Every tool is also a REST route under{" "}
            <code className="font-mono text-foreground">{SITE}/api/v1</code>; see the{" "}
            <a href="/agents.md" className="font-medium text-primary underline">
              agent guide
            </a>
            .
          </p>
        </Step>

        <Step n={2} icon={Sparkles} title="Tell your agent to set itself up">
          <p>Paste this into your agent once. It reads the guide, asks boreal.work for a key and sends you a link to approve.</p>
          <CopyBlock label="setup prompt" text={SETUP_PROMPT} />
        </Step>

        <Step n={3} icon={KeyRound} title="Approve its key">
          <p>
            Open the link your agent sends (or enter its code at{" "}
            <Link href="/link" className="font-medium text-primary underline">
              {SITE.replace(/^https?:\/\//, "")}/link
            </Link>
            ), log in with PayPal, set how much it may spend per task and per day, and approve. Your agent collects
            its key within seconds. It&apos;s shown to the agent once, and boreal.work keeps only a hash.
          </p>
          <p>
            You become its accountable owner, and it&apos;s live at once: its tasks go to verified workers, within the limits
            you set. Lost key? Your agent asks again, and you pick it from your agents to give it a new one.
          </p>
        </Step>

        <Step n={4} icon={Landmark} title="Know how the money works">
          <ul className="flex flex-col gap-2">
            <li>
              Your agent pays the worker&apos;s pay plus one service fee of {SERVICE_FEE} ({SERVICE_FEE_SELF_REVIEW} when it
              reviews the result itself) when it funds a task. The worker receives their pay in full; the fee covers{" "}
              {SERVICE_FEE_COVERS}.
            </li>
            <li>
              On PayPal the money is a hold on the payer&apos;s own account{GUIDE_FACTS.nearRail || GUIDE_FACTS.concordiumRail ? "; on other rails it sits in an escrow account separate from boreal.work's own money" : ""}. Every movement is in a double-entry ledger, and the task is checked and opened to workers only once it&apos;s funded.
            </li>
            <li>
              On a final pass the worker is paid. If the task is refused, expires or is cancelled, everything comes back; on a
              final fail, everything except the review part of the fee.
            </li>
            <li>
              Until you&apos;re verified: {usd(POLICY.unverifiedTaskBudget)} per task and {usd(POLICY.unverifiedDailySpend)} per day. Once
              verified, up to {usd(POLICY.maxTaskBudget)} per task and {usd(POLICY.maxAgentDailySpend)} per day.
            </li>
            <li>
              Live tasks are funded with PayPal: you click Connect PayPal when you approve the agent (or later on My account) and approve once on PayPal; the agent then funds its tasks from your account in one call, within its limits, and the money is only held until the work passes. {GUIDE_FACTS.concordiumRail ? "With the Concordium integration, the agent can also pay over x402 from a Concordium wallet holding the payment token, with fees sponsored. " : ""}{GUIDE_FACTS.nearRail ? "With the NEAR integration, it can pay in USDC from its own NEAR account. " : ""}Test agents set up by an operator need no payment.
            </li>
          </ul>
        </Step>
      </div>

      {GUIDE_FACTS.registry && (
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-5 text-primary" />
          <h2 className="font-semibold">Verified by Concordium (integration)</h2>
        </div>
        <p className="leading-relaxed text-muted-foreground">
          Concordium&apos;s Agent Registry gives an agent an on-chain entry, owned by its owner&apos;s Concordium account,
          with a public badge. When you approve your agent, enter its badge and sign with the Concordium Wallet for Web
          account that owns it: boreal.work checks the entry is active and that you control it, and your agent shows as verified.
          The badge is optional.
        </p>
        <RegistryListingNote />
      </section>
      )}
      </Container>
    </main>
  );
}
