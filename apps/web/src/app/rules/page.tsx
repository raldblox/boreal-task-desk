import { PRECEDENCE, REVIEW_STEPS, type Rule, RULEBOOK_VERSION, RULES, SCREENING_STEPS, type Severity } from "@boreal/brain";
import { Gavel, ScanSearch, Scale, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { RelatedQuestions } from "@/components/related-questions";
import { Container, PageHero } from "@/components/page";

export const metadata: Metadata = {
  title: "Rulebook",
  alternates: { canonical: "/rules" },
  description: "The rules boreal.work's screener and reviewer follow, how they apply them, and what happens when one is broken. Every refusal and every fail cites one by ID.",
};

// The rulebook the screener and reviewer are given, word for word (packages/brain/src/rulebook.ts).
// Verdicts link here by rule ID: /rules#R4.1.

const GROUPS: { prefix: string; stage: Rule["stage"]; icon: typeof Gavel; title: string; who: string }[] = [
  { prefix: "R1", stage: "screening", icon: ScanSearch, title: "R1 · Task quality", who: "Checked on every task once it's funded, before any worker sees it. A task that breaks one goes back to its requester with the fix." },
  { prefix: "R2", stage: "screening", icon: ScanSearch, title: "R2 · Safety and legality", who: "Checked at screening too. A task that breaks one is refused, and everything paid for it is released." },
  { prefix: "R3", stage: "review", icon: ShieldCheck, title: "R3 · Integrity", who: "Checked first on every result. Evidence that isn't genuine fails the result whatever else it shows." },
  { prefix: "R4", stage: "review", icon: ShieldCheck, title: "R4 · Completeness and accuracy", who: "Checked on every result, one check at a time." },
  { prefix: "R5", stage: "reviewer", icon: Scale, title: "R5 · The reviewer's own rules", who: "Rules the reviewer must follow, whether it's boreal.work's AI or the person who posted the task. Breaking one voids or overturns the verdict." },
  { prefix: "R6", stage: "dispute", icon: Gavel, title: "R6 · Disputes", who: "When either side disagrees with a verdict. A panel of two decides: boreal.work's AI reviewer votes, then a person decides, and the person's verdict stands." },
];

const SEVERITY: Record<Severity, { label: string; tone: string; meaning: string }> = {
  critical: { label: "Critical", tone: "border-destructive/30 bg-destructive/10 text-destructive", meaning: "Refused or failed outright; may cost the account" },
  major: { label: "Major", tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400", meaning: "Refused or failed; fixable next time" },
  minor: { label: "Minor", tone: "border-border bg-muted text-muted-foreground", meaning: "Sent back to fix; never a fail on its own" },
  protective: { label: "Safeguard", tone: "border-primary/30 bg-primary-soft text-primary-soft-foreground", meaning: "Protects the people involved; never fails anyone" },
};

function Steps({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <h3 className="text-lg font-normal tracking-tight">{title}</h3>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft font-mono text-xs text-primary-soft-foreground">{i + 1}</span>
            <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function RulesPage() {
  return (
    <main className="flex-1">
      <PageHero
        kicker={`Rulebook v${RULEBOOK_VERSION}`}
        title="The rules every verdict follows"
        lede="Every refusal and every fail cites one of these rules by its ID, so anyone can see why, and dispute it."
      />
      <Container className="flex flex-col gap-14 pb-16 md:pb-24">
        <section aria-labelledby="how" className="flex flex-col gap-5">
          <h2 id="how" className="text-2xl font-normal tracking-tight">
            How it&apos;s applied
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Steps title="Screening a task" steps={SCREENING_STEPS} />
            <Steps title="Reviewing a result" steps={REVIEW_STEPS} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <p className="rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">When rules meet:</span> {PRECEDENCE} Reviewers can&apos;t add checks of their own (R5.1).
            </p>
            <dl className="grid gap-2 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-2">
              {(Object.keys(SEVERITY) as Severity[]).map((s) => (
                <div key={s} className="flex items-start gap-2.5">
                  <dt className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY[s].tone}`}>{SEVERITY[s].label}</dt>
                  <dd className="text-muted-foreground">{SEVERITY[s].meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {GROUPS.map(({ prefix, icon: Icon, title, who }) => (
          <section key={prefix} aria-labelledby={`group-${prefix}`} className="flex flex-col gap-5">
            <div className="flex max-w-3xl flex-col gap-2">
              <h2 id={`group-${prefix}`} className="flex items-center gap-2.5 text-2xl font-normal tracking-tight">
                <Icon className="size-5 text-primary" aria-hidden />
                {title}
              </h2>
              <p className="leading-relaxed text-muted-foreground">{who}</p>
            </div>
            <ol className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {RULES.filter((r) => r.id.startsWith(`${prefix}.`)).map((rule) => (
                <li
                  key={rule.id}
                  id={rule.id}
                  className="grid scroll-mt-40 gap-2 p-5 transition-colors target:bg-primary-soft/50 sm:grid-cols-[5rem_1fr_minmax(0,15rem)] sm:gap-6"
                >
                  <a href={`#${rule.id}`} className="w-fit font-mono text-sm font-medium text-primary hover:underline">
                    {rule.id}
                  </a>
                  <div className="flex flex-col gap-1.5">
                    <p className="leading-relaxed">{rule.text}</p>
                    {rule.example && <p className="text-sm leading-relaxed text-muted-foreground">For example: {rule.example}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5 sm:items-end sm:text-right">
                    <span className={`w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY[rule.severity].tone}`}>{SEVERITY[rule.severity].label}</span>
                    <p className="text-sm text-muted-foreground">If broken: {rule.outcome}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <RelatedQuestions ids={["ai-fair", "ai-unsure", "result-fails", "who-decides"]} className="max-w-2xl" />
      </Container>
    </main>
  );
}
