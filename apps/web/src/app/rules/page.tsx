import { type Rule, RULEBOOK_VERSION, RULES } from "@boreal/brain";
import { Gavel, ScanSearch, Scale, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { Container, PageHero } from "@/components/page";

export const metadata: Metadata = {
  title: "Rulebook",
  alternates: { canonical: "/rules" },
  description: "The rules boreal.work's screener and reviewer follow. Every refusal and every fail cites one of these by ID.",
};

// The rulebook the screener and reviewer are given, word for word (packages/brain/src/rulebook.ts).
// Verdicts link here by rule ID: /rules#R4.1.

const STAGES: { stage: Rule["stage"]; icon: typeof Gavel; title: string; who: string }[] = [
  {
    stage: "screening",
    icon: ScanSearch,
    title: "Screening",
    who: "Checked on every task once it's funded, before any worker sees it. A task that breaks R1 is sent back for edits; one that breaks R2 is refused, and its money is returned in full.",
  },
  {
    stage: "review",
    icon: ShieldCheck,
    title: "Review",
    who: "Checked on every result. A fail must name the rule and the criterion that was missed.",
  },
  {
    stage: "reviewer",
    icon: Scale,
    title: "The reviewer's own rules",
    who: "Rules the reviewer must follow, whether it's boreal.work's AI or the person who posted the task. Breaking them voids or overturns the verdict.",
  },
  {
    stage: "dispute",
    icon: Gavel,
    title: "Disputes",
    who: "When either side disagrees with a verdict. A panel with a person on it decides.",
  },
];

export default function RulesPage() {
  return (
    <main className="flex-1">
      <PageHero
        kicker={`Rulebook v${RULEBOOK_VERSION}`}
        title="The rules every verdict follows"
        lede="boreal.work's screener and reviewer are given exactly these rules, and may cite only these. Every refusal and every fail names a rule by its ID, so you can always see why."
      />
      <Container className="flex flex-col gap-12 pb-16 md:pb-24">
        <p className="max-w-3xl rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">When rules meet:</span> the law comes first, then R2, then the task&apos;s own
          acceptance criteria, then every other rule. Reviewers can&apos;t add requirements of their own, and where a criterion is
          unclear, the worker&apos;s reasonable reading wins (R5.2).
        </p>
        {STAGES.map(({ stage, icon: Icon, title, who }) => (
          <section key={stage} aria-labelledby={`stage-${stage}`} className="flex flex-col gap-5">
            <div className="flex max-w-3xl flex-col gap-2">
              <h2 id={`stage-${stage}`} className="flex items-center gap-2.5 text-2xl font-normal tracking-tight">
                <Icon className="size-5 text-primary" aria-hidden />
                {title}
              </h2>
              <p className="leading-relaxed text-muted-foreground">{who}</p>
            </div>
            <ol className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {RULES.filter((r) => r.stage === stage).map((rule) => (
                <li
                  key={rule.id}
                  id={rule.id}
                  className="grid scroll-mt-40 gap-1.5 border-l-4 border-l-transparent p-5 transition-colors target:border-l-primary target:bg-primary-soft/50 sm:grid-cols-[5rem_1fr_minmax(0,16rem)] sm:gap-6"
                >
                  <a href={`#${rule.id}`} className="w-fit font-mono text-sm font-medium text-primary hover:underline">
                    {rule.id}
                  </a>
                  <p className="leading-relaxed">{rule.text}</p>
                  <p className="text-sm text-muted-foreground sm:text-right">If broken: {rule.outcome}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </Container>
    </main>
  );
}
