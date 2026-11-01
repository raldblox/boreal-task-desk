import { DeskError } from "@boreal/desk";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LiveBadge, Mono, Section, StatusBadge, Table } from "@/components/admin/parts";
import { canDecide, ReviewControls } from "@/components/admin/review-controls";
import { Badge } from "@/components/ui/badge";
import { attributeLabel, usd, when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  let d;
  try {
    d = await getDesk().adminTask(id);
  } catch (error) {
    if (error instanceof DeskError && error.code === "not_found") notFound();
    throw error;
  }
  const { task, money } = d;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <LiveBadge test={task.test} />
          {task.needsHuman && <Badge variant="destructive">flagged for a human</Badge>}
          <Badge variant="outline">reviewer: {task.reviewMode}</Badge>
          {task.disputeUsed && <Badge variant="outline">dispute used</Badge>}
        </div>
        <Mono>{task.id}</Mono>
        <p className="text-lg">{task.description}</p>
        {task.humanReason && <p className="text-sm text-destructive">Flagged: {task.humanReason}</p>}
        <ul className="list-disc pl-5 text-sm">
          {task.acceptanceCriteria.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {task.requiredAttributes.map((a) => (
            <Badge key={a.attribute} variant="outline">
              {attributeLabel(a)}
            </Badge>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Agent</dt>
            <dd>
              {d.agent.name} <StatusBadge status={d.agent.status} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Worker</dt>
            <dd>{d.worker ? <Mono>{d.worker.pseudonym}</Mono> : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Deadline</dt>
            <dd>{when(task.deadline)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Result format</dt>
            <dd>{task.resultFormat}</dd>
          </div>
        </dl>
      </div>

      {canDecide(task) && (
        <Section title="Decide" description="Goes through the desk's reviewer commands; the trail shows boreal's reviewer, the audit log shows you.">
          <ReviewControls task={task} />
        </Section>
      )}

      <Section title="Submission">
        {d.submission ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
            <p className="text-xs text-muted-foreground">{when(d.submission.createdAt)}</p>
            {d.submission.text && <p className="whitespace-pre-wrap">{d.submission.text}</p>}
            <div className="flex flex-wrap gap-3">
              {d.submission.fileUrls.map((path) => (
                <a key={path} href={`/api/files/${path}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private files, served by our own route */}
                  <img src={`/api/files/${path}`} alt="Submitted file" className="max-h-64 rounded-lg border" />
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing submitted.</p>
        )}
        {d.verdict && (
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="font-medium">
              Standing verdict: {d.verdict.outcome} by the {d.verdict.by} · {when(d.verdict.at)}
            </p>
            {d.verdict.ruleIds.length > 0 && <p className="font-mono text-xs">{d.verdict.ruleIds.join(", ")}</p>}
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{d.verdict.reasoning}</p>
          </div>
        )}
      </Section>

      <Section title="Money" description={`Total ${usd(money.total)}: budget ${usd(task.budget)}, platform fee ${usd(task.platformFee)}, review fee ${usd(task.reviewFee)}. State: ${money.state.replaceAll("_", " ")}.`}>
        <Table head={["Entry", "From → to", "Amount", "Status", "Tx", "Updated"]} empty="No money has moved.">
          {d.entries.map((e) => (
            <tr key={e.id}>
              <td>
                <Mono>{e.idempotencyKey.split(":")[1]}</Mono>
              </td>
              <td>
                {e.fromAccount} → {e.toAccount}
              </td>
              <td className="tabular-nums">{usd(e.amount)}</td>
              <td>
                <StatusBadge status={e.status} />
              </td>
              <td>
                <Mono title={e.txHash ?? undefined}>{e.txHash ? `${e.txHash.slice(0, 18)}…` : "—"}</Mono>
              </td>
              <td className="text-xs">{when(e.updatedAt)}</td>
            </tr>
          ))}
        </Table>
        {d.outbox.length > 0 && (
          <Table head={["Outbox", "Kind", "Attempts", "Done", "Last error"]}>
            {d.outbox.map((o) => (
              <tr key={o.id}>
                <td className="tabular-nums">{o.id}</td>
                <td>{o.kind}</td>
                <td className="tabular-nums">{o.attempts}</td>
                <td className="text-xs">{o.doneAt ? when(o.doneAt) : "pending"}</td>
                <td className="text-xs text-destructive">{o.lastError ?? ""}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Trail" description="Every event, hash-chained and anchored on Concordium.">
        <Table head={["When", "Event", "Actor", "Details", "Hash"]}>
          {d.trail.map((e) => (
            <tr key={e.id}>
              <td className="text-xs whitespace-nowrap">{when(e.at)}</td>
              <td className="font-medium">{e.type}</td>
              <td>{e.actor}</td>
              <td className="max-w-96">
                <pre className="overflow-x-auto font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{JSON.stringify(e.payload)}</pre>
              </td>
              <td>
                <Mono title={e.hash}>{e.hash.slice(0, 10)}…</Mono>
                <span className="block text-[11px] text-muted-foreground">{e.anchorTxHash ? "anchored" : "not anchored yet"}</span>
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      {d.audit.length > 0 && (
        <Section title="Admin actions on this task">
          <Table head={["When", "Admin", "Action", "Reason", "Outcome"]}>
            {d.audit.map((a) => (
              <tr key={a.id}>
                <td className="text-xs whitespace-nowrap">{when(a.createdAt)}</td>
                <td>
                  <Mono>{a.adminRef}</Mono>
                </td>
                <td>{a.action}</td>
                <td>{a.reason}</td>
                <td className="text-xs">{a.outcome}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
    </div>
  );
}

export default function AdminTaskPage({ params }: PageProps<"/admin/tasks/[id]">) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Task</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}
