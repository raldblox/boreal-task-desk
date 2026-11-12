import { RuleRefs } from "@/components/rule-refs";
import { when } from "@/lib/format";
import { getDesk } from "@/server/desk";

/**
 * The AI's vote as the dispute panel's other member, shown to the person who decides (R6.3).
 * The person's verdict is the panel's decision; when the two disagree, theirs stands.
 */
export async function PanelAiVote({ taskId }: { taskId: string }) {
  const vote = await getDesk().panelAiVote(taskId);
  if (!vote) {
    return (
      <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        Panel: the AI hasn&apos;t voted on this dispute yet. It votes on the next monitor tick when a reviewer key is set; you can decide
        without it.
      </p>
    );
  }
  const label = vote.outcome === "unsure" ? "unsure, it's yours to decide" : vote.outcome;
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-medium">Panel, AI member&apos;s vote: {label}.</span>{" "}
        <span className="text-muted-foreground">
          You are the other member. Your verdict is the panel&apos;s decision, and stands if you disagree.
        </span>
      </p>
      {vote.reasoning && <p>{vote.reasoning}</p>}
      <p className="font-mono text-xs text-muted-foreground">
        {vote.ruleIds.length > 0 && (
          <>
            <RuleRefs ids={vote.ruleIds} />
            {" · "}
          </>
        )}
        {vote.model ?? "no model"} · {when(vote.at)}
      </p>
    </div>
  );
}
