import type { Task } from "@boreal/db";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { attributeLabel, usd, when, WORKER_STATUS } from "@/lib/format";

export function TaskCard({ task, showStatus = false }: { task: Task; showStatus?: boolean }) {
  const status = WORKER_STATUS[task.status];
  return (
    <Link href={`/tasks/${task.id}`} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="flex items-start justify-between gap-4 text-base leading-snug">
            <span>{task.description}</span>
            <span className="shrink-0 text-lg font-semibold">{usd(task.budget)}</span>
          </CardTitle>
          <CardDescription>
            {task.resultFormat === "photo" ? "Photo" : task.resultFormat === "file" ? "File" : "Written answer"} · due{" "}
            {when(task.deadline)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {showStatus && <Badge variant={status.tone}>{status.label}</Badge>}
          {task.test && <Badge variant="secondary">Test money</Badge>}
          {task.requiredAttributes.map((a) => (
            <Badge key={a.attribute} variant="outline">
              {attributeLabel(a)}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
