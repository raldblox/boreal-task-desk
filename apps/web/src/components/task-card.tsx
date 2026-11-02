import type { Task } from "@boreal/db";
import type { RequesterKind } from "@boreal/desk";
import { BadgeCheck, Bot, Camera, Clock, FileText, PenLine, ShieldCheck, Store, UserCheck } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { attributeLabel, usd, when, WORKER_STATUS } from "@/lib/format";

const FORMAT = {
  photo: { icon: Camera, label: "Photo" },
  file: { icon: FileText, label: "File" },
  text: { icon: PenLine, label: "Written answer" },
} as const;

/** A task, plus who's behind it: a Verified by Concordium agent, a verified person, a NEAR market buyer, or none (from the desk). */
export function TaskCard({
  task,
  showStatus = false,
}: {
  task: Task & { requesterKind?: RequesterKind; fulfilledBy?: "person" | "agent" | null };
  showStatus?: boolean;
}) {
  const shown = task.requesterKind === "verified_agent" || task.requesterKind === "verified_person" || task.requesterKind === "market";
  const status = WORKER_STATUS[task.status];
  const format = FORMAT[task.resultFormat];
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group flex flex-col gap-3 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-medium leading-snug group-hover:text-foreground">{task.description}</p>
        <p className="shrink-0 text-xl font-semibold tabular-nums text-primary">{usd(task.budget)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <format.icon className="size-4" /> {format.label}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" /> Due {when(task.deadline)}
        </span>
      </div>
      {(showStatus || task.test || task.paymentRail || shown || task.requiredAttributes.length > 0 || task.fulfillers === "people_or_agents") && (
        <div className="flex flex-wrap gap-2">
          {showStatus && <Badge variant={status.tone}>{status.label}</Badge>}
          {task.test && <Badge className="bg-primary-soft text-primary-soft-foreground">Test money</Badge>}
          {task.requesterKind === "verified_agent" && (
            // The posting agent's owner is an accountable Concordium account (Agent Registry badge).
            <Badge variant="outline" className="gap-1">
              <BadgeCheck className="size-3.5 text-primary" /> Verified agent
            </Badge>
          )}
          {task.requesterKind === "verified_person" && (
            // A person posted it themselves, and has Concordium ID on their account.
            <Badge variant="outline" className="gap-1">
              <UserCheck className="size-3.5 text-primary" /> Verified person
            </Badge>
          )}
          {task.requesterKind === "market" && (
            // Hired through boreal's listing on NEAR Agent Market.
            <Badge variant="outline" className="gap-1">
              <Store className="size-3.5 text-primary" /> NEAR market buyer
            </Badge>
          )}
          {task.paymentRail === "paypal" && <Badge variant="outline">Paid via PayPal</Badge>}
          {task.paymentRail === "concordium" && <Badge variant="outline">Paid in tokens</Badge>}
          {task.paymentRail === "near" && <Badge variant="outline">Paid in USDC on NEAR</Badge>}
          {task.fulfillers === "people_or_agents" && !task.fulfilledBy && (
            // The requester let AI agents take it too, under the same review.
            <Badge variant="outline" className="gap-1">
              <Bot className="size-3.5 text-primary" /> Open to AI agents
            </Badge>
          )}
          {task.fulfilledBy === "agent" && (
            <Badge variant="outline" className="gap-1">
              <Bot className="size-3.5 text-primary" /> Done by an AI agent
            </Badge>
          )}
          {task.requiredAttributes.length > 0 && (
            // Required attributes are proven with Concordium ID, so the task needs its badge.
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="size-3.5 text-primary" /> Needs Verified by Concordium
            </Badge>
          )}
          {task.requiredAttributes.map((a) => (
            <Badge key={a.attribute} variant="outline">
              {attributeLabel(a)}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  );
}
