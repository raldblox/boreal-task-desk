import { ruleById } from "@boreal/brain";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

// Rule codes on a verdict (R4.1, R3.2…), each a link to its place on /rules. Hovering one shows
// the rule and what happens when it's broken; tapping it opens the rulebook at that rule.

const STAGE = { screening: "Screening", review: "Review", reviewer: "The reviewer's own rules", dispute: "Disputes" } as const;

export function RuleRef({ id }: { id: string }) {
  const rule = ruleById(id);
  const link = (
    <a href={`/rules#${id}`} className="font-mono underline decoration-dotted underline-offset-4 hover:text-foreground">
      {id}
    </a>
  );
  if (!rule) return link;
  return (
    <HoverCard>
      <HoverCardTrigger delay={150} render={link} />
      <HoverCardContent className="w-72 p-3.5" side="top">
        <p className="font-mono text-xs text-muted-foreground">
          {rule.id} · {STAGE[rule.stage]}
        </p>
        <p className="mt-1.5 text-sm leading-snug">{rule.text}</p>
        <p className="mt-2 text-xs text-muted-foreground">If broken: {rule.outcome}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Several codes, separated by dots; "No rules cited" when there are none. */
export function RuleRefs({ ids, empty = "No rules cited" }: { ids: readonly string[]; empty?: string }) {
  if (!ids.length) return <>{empty}</>;
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && " · "}
          <RuleRef id={id} />
        </span>
      ))}
    </>
  );
}
