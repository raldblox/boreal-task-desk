import { TASK_STATUSES, type TaskStatus } from "@boreal/core";
import Link from "next/link";
import { Suspense } from "react";

import { LiveBadge, Mono, shortId, StatusBadge, Table } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usd, when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

type Search = { q?: string; status?: string; money?: string };

const select = "h-8 rounded-lg border bg-background px-2 text-sm";

async function Results({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const { q, status, money } = await searchParams;
  const valid = TASK_STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : undefined;
  const rows = await getDesk().adminTasks({ q, status: valid, test: money === "live" ? false : money === "test" ? true : undefined });
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Task id or words in the description" className="w-72" />
        <select name="status" defaultValue={valid ?? ""} className={select} aria-label="Status">
          <option value="">Any status</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select name="money" defaultValue={money ?? ""} className={select} aria-label="Live or test">
          <option value="">Live and test</option>
          <option value="live">Live only</option>
          <option value="test">Test only</option>
        </select>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {rows.length === 100 ? "The newest 100 matches" : `${rows.length} ${rows.length === 1 ? "task" : "tasks"}`}
      </p>
      <Table head={["Task", "Status", "Description", "Requester", "Budget", "Rail", "Posted"]} empty="No tasks match.">
        {rows.map(({ task, agentName, kind }) => (
          <tr key={task.id}>
            <td>
              <Link href={`/admin/tasks/${task.id}`} className="hover:underline">
                <Mono>{shortId(task.id)}</Mono>
              </Link>
            </td>
            <td className="whitespace-nowrap">
              <StatusBadge status={task.status} /> {task.needsHuman && <span className="text-xs text-destructive">flagged</span>}
            </td>
            <td className="max-w-80">
              <Link href={`/admin/tasks/${task.id}`} className="line-clamp-2 hover:underline">
                {task.description}
              </Link>
            </td>
            <td>
              {agentName} {kind !== "agent" && <span className="text-xs text-muted-foreground">({kind === "personal" ? "person" : "NEAR market"})</span>}
            </td>
            <td className="tabular-nums">{usd(task.budget)}</td>
            <td className="whitespace-nowrap">
              {task.paymentRail ?? "—"} <LiveBadge test={task.test} />
            </td>
            <td className="text-xs whitespace-nowrap">{when(task.createdAt)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

export default function AdminTasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Results searchParams={searchParams as Promise<Search>} />
      </Suspense>
    </main>
  );
}
