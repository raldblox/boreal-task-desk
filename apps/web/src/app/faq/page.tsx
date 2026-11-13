import { Plus } from "lucide-react";
import type { Metadata } from "next";

import { FaqHashOpener } from "@/components/faq-hash-opener";
import { Container, PageHero } from "@/components/page";
import { questions } from "@/content/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "How taking tasks, getting paid, posting, fees, the AI reviewer and privacy work on boreal.work.",
  alternates: { canonical: "/faq" },
};

// The questions live in src/content/faq.tsx, each with a fixed id, so other pages link straight
// to an answer (/faq#when-paid) and FaqHashOpener opens it.
export default function FaqPage() {
  const sections = questions();
  return (
    <main className="flex-1">
      <PageHero kicker="FAQ" title="Questions, answered" />
      <Container className="grid gap-10 py-10 md:py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
        <FaqHashOpener />
        <nav aria-label="FAQ sections" className="hidden lg:block">
          <ul className="sticky top-28 flex flex-col gap-2 text-sm">
            {sections.map((s) => (
              <li key={s.title}>
                <a href={`#${slug(s.title)}`} className="text-muted-foreground transition-colors hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex max-w-3xl flex-col gap-12">
          {sections.map((section) => (
            <section key={section.title} id={slug(section.title)} className="flex scroll-mt-28 flex-col gap-4">
              <h2 className="text-2xl font-light tracking-[-0.025em]">{section.title}</h2>
              <div className="flex flex-col divide-y border-y">
                {section.items.map(({ id, q, a }) => (
                  <details key={id} id={id} className="group scroll-mt-28 py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                      {q}
                      <Plus aria-hidden className="size-4 shrink-0 text-primary transition-transform duration-300 ease-out group-open:rotate-45" />
                    </summary>
                    <div className="max-w-[68ch] pt-3 leading-7 text-foreground/85">{a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Container>
    </main>
  );
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
