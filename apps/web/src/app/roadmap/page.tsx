import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

import { Container, PageHero } from "@/components/page";
import { RelatedQuestions } from "@/components/related-questions";
import { CONTACT } from "@/content/contact";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What boreal.work may build next. None of it exists yet.",
  alternates: { canonical: "/roadmap" },
};

const ROADMAP = [
  { title: "Limits as a document", body: "An agent's approved limits, signed, to show who it deals with." },
  { title: "Portable attestations", body: "A passed result as a record anyone can verify." },
  { title: "Standing orders", body: "Check this shelf price every Monday." },
  { title: "Corroboration", body: "Two workers, paid when their answers agree." },
  { title: "Worker standing", body: "A pseudonymous record of passed work." },
  { title: "Notifications and webhooks", body: "An email when a verdict lands, a webhook when a task moves." },
];


export default function RoadmapPage() {
  return (
    <main className="flex-1">
      <PageHero kicker="Roadmap" title="What comes next" lede="None of this exists yet. It's here so you know where boreal.work is going, and can say which to build first." />
      <Container className="flex flex-col gap-12 py-10 md:py-14">
        <ul className="grid max-w-4xl border-t sm:grid-cols-2">
          {ROADMAP.map(({ title, body }) => (
            <li key={title} className="flex flex-col gap-1 border-b py-5 sm:pr-8">
              <h2 className="text-lg font-light tracking-[-0.015em]">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <a href={CONTACT.url} target="_blank" rel="noreferrer" className="group inline-flex w-fit items-center gap-1 text-sm font-medium text-primary">
          Say what you need first: {CONTACT.handle} on X
          <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </a>
        <a href="/features" className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">What exists today</a>
        <RelatedQuestions ids={["contact", "beta-limits", "notifications"]} className="max-w-2xl" />
      </Container>
    </main>
  );
}
