import Link from "next/link";
import { Suspense } from "react";

import { LiveBadge, Mono, shortId, StatusBadge } from "@/components/admin/parts";
import { ReviewControls } from "@/components/admin/review-controls";
import { Badge } from "@/components/ui/badge";
import { usd, when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

const STAGE: Record<string, string> = {
  posted: "Screen",
  submitted: "Review the submission",
  disputed: "Decide the dispute",
};

async function Queue() {
  await requireAdmin();
  const queue = await getDesk().adminReviewQueue();
  if (queue.length === 0) return <p className="text-sm text-muted-foreground">Nothing is waiting on boreal.work.</p>;
  return (
    <div className="flex flex-col gap-4">
      {queue.map((task) => (
        <article key={task.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{STAGE[task.status]}</span>
            <StatusBadge status={task.status} />
            <LiveBadge test={task.test} />
            {task.needsHuman && <Badge variant="destructive">flagged</Badge>}
            <span className="text-muted-foreground">
              {usd(task.budget)} · waiting since {when(task.updatedAt)}
            </span>
            <Link href={`/admin/tasks/${task.id}`} className="ml-auto hover:underline">
              <Mono>{shortId(task.id)}</Mono> details →
            </Link>
          </div>
          <p>{task.description}</p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {task.acceptanceCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {task.humanReason && <p className="text-sm text-destructive">Flagged: {task.humanReason}</p>}
          {task.status !== "posted" && (
            <p className="text-sm text-muted-foreground">Open the details to see the submission before deciding.</p>
          )}
          <ReviewControls task={task} />
        </article>
      ))}
    </div>
  );
}

export default function AdminReviewPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Tasks waiting on boreal.work, oldest first: screening, submissions boreal.work reviews, and disputes. Without an AI reviewer
          key, this is how live tasks get screened. Cite rule IDs from the rulebook for any refusal or fail.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Queue />
      </Suspense>
    </main>
  );
}
