import Link from "next/link";
import { Suspense } from "react";

import { retryOutbox, runMonitorTick } from "@/app/admin/actions";
import { AdminForm } from "@/components/admin/admin-form";
import { Mono, Section, shortId, Table } from "@/components/admin/parts";
import { when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

async function Outbox() {
  await requireAdmin();
  const rows = await getDesk().adminOutbox();
  return (
    <Table head={["#", "Kind", "About", "Attempts", "Next try", "Last error", ""]} empty="The outbox is empty: every side effect has been sent.">
      {rows.map((o) => {
        const p = o.payload as { ledgerKey?: string; taskId?: string; eventId?: number };
        const taskId = (p.ledgerKey ?? p.taskId)?.split(":")[0];
        return (
          <tr key={o.id}>
            <td className="tabular-nums">{o.id}</td>
            <td>{o.kind}</td>
            <td>
              {taskId ? (
                <Link href={`/admin/tasks/${taskId}`} className="hover:underline">
                  <Mono>{shortId(taskId)}</Mono>
                </Link>
              ) : p.eventId ? (
                <span className="text-xs text-muted-foreground">event {p.eventId}</span>
              ) : null}
            </td>
            <td className="tabular-nums">{o.attempts}</td>
            <td className="text-xs whitespace-nowrap">{when(o.nextAttemptAt)}</td>
            <td className="max-w-72 text-xs text-destructive">{o.lastError ?? ""}</td>
            <td>
              {o.lastError && (
                <AdminForm
                  action={retryOutbox.bind(null, o.id)}
                  label="Retry now"
                  confirm="Send this again now. Payouts are journaled and keyed, so it can't pay twice."
                />
              )}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

async function Audit() {
  await requireAdmin();
  const log = await getDesk().adminAudit();
  return (
    <Table head={["When", "Admin", "Action", "Target", "Reason", "Outcome"]} empty="No admin actions yet.">
      {log.map((a) => {
        const [kind, id] = (a.target ?? "").split(":");
        return (
          <tr key={a.id}>
            <td className="text-xs whitespace-nowrap">{when(a.createdAt)}</td>
            <td>
              <Mono>{a.adminRef}</Mono>
            </td>
            <td>{a.action}</td>
            <td>
              {kind === "task" && id ? (
                <Link href={`/admin/tasks/${id}`} className="hover:underline">
                  <Mono>task:{shortId(id)}</Mono>
                </Link>
              ) : (
                <Mono>{a.target}</Mono>
              )}
            </td>
            <td className="max-w-72">{a.reason}</td>
            <td className="max-w-60 text-xs">{a.outcome}</td>
          </tr>
        );
      })}
    </Table>
  );
}

export default function AdminControlsPage() {
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Controls</h1>
      <Section
        title="Monitor"
        description="One tick: expire claims and deadlines, close objection windows, run the AI reviewer if it has a key, check escrow, then send the outbox. It also runs after activity and from the daily cron."
      >
        <AdminForm action={runMonitorTick} label="Run a tick now" confirm="Run one monitor tick now. It moves money that is due." />
      </Section>
      <Section
        title="Outbox"
        description="Side effects still to send, oldest first. A failing row backs off up to an hour between tries; retry makes it due now."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <Outbox />
        </Suspense>
      </Section>
      <Section
        title="Audit log"
        description="Every change made from the admin area, newest first. Agents are frozen from the Agents page; reviews from the Review queue."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <Audit />
        </Suspense>
      </Section>
    </main>
  );
}
