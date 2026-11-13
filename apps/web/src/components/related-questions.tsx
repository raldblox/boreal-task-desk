import { ChevronRight } from "lucide-react";

import { faqItems } from "@/content/faq";
import { cn } from "@/lib/utils";

/**
 * "Questions about this": a page's own FAQ entries, each a direct link that opens the answer on
 * /faq. Pass FAQ ids (src/content/faq.tsx); ids switched off on this site are left out.
 */
export function RelatedQuestions({ ids, className }: { ids: string[]; className?: string }) {
  const items = faqItems(ids);
  if (!items.length) return null;
  return (
    <aside className={cn("flex flex-col gap-3", className)} aria-label="Questions about this">
      <p className="text-sm font-medium">Questions about this</p>
      <ul className="flex flex-col divide-y border-y">
        {items.map(({ id, q }) => (
          <li key={id}>
            <a href={`/faq#${id}`} className="group flex items-center justify-between gap-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {q}
              <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <a href="/faq" className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
        Every question
      </a>
    </aside>
  );
}
