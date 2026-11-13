import { ChevronRight } from "lucide-react";

import { Fold } from "@/components/page";
import { faqItems } from "@/content/faq";
import { cn } from "@/lib/utils";

/**
 * "Questions about this": a page's own FAQ entries, each a direct link that opens the answer on
 * /faq. Pass FAQ ids (src/content/faq.tsx); ids switched off on this site are left out.
 *
 * Folded by default: questions are there when wanted, not in the way. `bare` drops the fold for
 * a list that already sits inside one.
 */
export function RelatedQuestions({ ids, className, bare = false }: { ids: string[]; className?: string; bare?: boolean }) {
  const items = faqItems(ids);
  if (!items.length) return null;
  const list = (
    <>
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
      <a href="/faq" className="mt-3 block w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
        Every question
      </a>
    </>
  );
  if (bare) return <div className={className}>{list}</div>;
  return (
    <aside className={cn("border-t", className)} aria-label="Questions about this">
      <Fold summary="Questions about this" hint={items.length}>
        {list}
      </Fold>
    </aside>
  );
}
