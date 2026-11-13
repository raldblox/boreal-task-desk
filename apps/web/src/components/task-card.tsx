import type { Task } from "@boreal/db";
import type { RequesterKind } from "@boreal/desk";
import { ArrowRight, BadgeCheck, Camera, Clock, FileText, PenLine, Store, UserCheck } from "lucide-react";
import Link from "next/link";

import { PointMark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { attributeLabel, usd, when, WORKER_STATUS } from "@/lib/format";
import { RAIL_LABEL } from "@/lib/rails";

const FORMAT = {
  photo: { icon: Camera, label: "Photo" },
  file: { icon: FileText, label: "File" },
  text: { icon: PenLine, label: "Written answer" },
} as const;

const POSTED_BY: Partial<Record<RequesterKind, { icon: typeof BadgeCheck; label: string }>> = {
  verified_agent: { icon: BadgeCheck, label: "Verified agent" },
  verified_person: { icon: UserCheck, label: "Verified person" },
  market: { icon: Store, label: "NEAR market buyer" },
};

/**
 * A task as a worker scans it: what to do and the pay first, then the format and deadline, then
 * one quiet line for what it needs and how it pays. The whole card is the link; on hover
 * a needle from the mark slides in at its edge (globals.css: .brand-card).
 */
export function TaskCard({
  task,
  showStatus = false,
}: {
  task: Task & { requesterKind?: RequesterKind; fulfilledBy?: "person" | "agent" | null };
  showStatus?: boolean;
}) {
  const status = WORKER_STATUS[task.status];
  const format = FORMAT[task.resultFormat];
  const postedBy = task.requesterKind ? POSTED_BY[task.requesterKind] : undefined;
  const needs = [
    ...(task.requiredAttributes.length > 0 ? ["Concordium ID"] : []),
    ...task.requiredAttributes.map(attributeLabel),
  ];
  const fine = [
    task.paymentRail ? RAIL_LABEL[task.paymentRail] : null,
    task.fulfillers === "people_or_agents" && !task.fulfilledBy ? "Open to AI agents" : null,
    task.fulfilledBy === "agent" ? "Done by an AI agent" : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="brand-card group flex flex-col gap-5 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-6">
        <p className="line-clamp-3 text-lg leading-snug text-balance">{task.description}</p>
        <p className="shrink-0 text-3xl font-light tracking-[-0.03em] tabular-nums text-primary">{usd(task.budget)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <format.icon className="size-4" aria-hidden /> {format.label}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" aria-hidden /> Due {when(task.deadline)}
        </span>
        {postedBy && (
          <span className="flex items-center gap-1.5">
            <postedBy.icon className="size-4 text-primary" aria-hidden /> {postedBy.label}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 border-t pt-4">
        <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
          {(showStatus || task.test) && (
            <div className="flex flex-wrap gap-2">
              {showStatus && <Badge variant={status.tone}>{status.label}</Badge>}
              {task.test && <Badge className="bg-primary-soft text-primary-soft-foreground">Test money</Badge>}
            </div>
          )}
          {needs.length > 0 && (
            <span className="flex items-center gap-2 text-foreground">
              <PointMark className="h-2.5 w-1.25 shrink-0 text-primary" />
              Needs {needs.join(" · ")}
            </span>
          )}
          {fine.length > 0 && <span>{fine.join(" · ")}</span>}
        </div>
        <ArrowRight
          className="size-5 shrink-0 text-muted-foreground transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:text-primary"
          aria-hidden
        />
      </div>
    </Link>
  );
}
