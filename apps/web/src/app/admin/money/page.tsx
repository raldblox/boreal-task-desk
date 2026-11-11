import Link from "next/link";
import { Suspense } from "react";

import { AdminForm } from "@/components/admin/admin-form";
import { LiveBadge, Mono, Section, shortId, StatusBadge, Table } from "@/components/admin/parts";
import { usd, when } from "@/lib/format";
import { resendPayout, retryOutbox } from "@/app/admin/actions";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

const ACCOUNTS = [
  ["worker", "Paid to workers"],
  ["reviewer", "Review fees"],
  ["operating", "Platform fees (boreal.work)"],
  ["requester", "Refunded to agents"],
] as const;

/** Where boreal's platform fee ends up, per rail: the question "who received the fee?". */
function FeeDestination() {
  const operating = process.env.OPERATING_ACCOUNT_ADDRESS;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">PayPal</p>
        <p className="text-muted-foreground">
          Stays in boreal.work&apos;s own PayPal business account (the app&apos;s merchant account). Capturing the agent&apos;s
          authorization takes the money in, workers and reviewers are paid out of it, and the platform fee is simply
          kept: the outbox settles the <code>operating</code> entry in place, with no payout.
        </p>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">Concordium</p>
        <p className="text-muted-foreground">
          Paid out of escrow to <code>OPERATING_ACCOUNT_ADDRESS</code> as a sponsored token transfer:
        </p>
        {operating ? (
          <Mono>{operating}</Mono>
        ) : (
          <p className="font-medium text-destructive">Not set: platform-fee payouts on Concordium will fail until it is.</p>
        )}
      </div>
    </div>
  );
}

async function Money() {
  await requireAdmin();
  const m = await getDesk().adminMoney();
  const rails = [...new Set(m.totals.map((t) => t.rail))];
  const sum = (rail: string, pick: (t: (typeof m.totals)[number]) => boolean) =>
    m.totals.filter((t) => t.rail === rail && pick(t)).reduce((s, t) => s + t.amount, 0);
  const cell = (rail: string, to: string) => {
    const settled = sum(rail, (t) => t.from === "escrow" && t.to === to && t.status === "settled");
    const pending = sum(rail, (t) => t.from === "escrow" && t.to === to && t.status === "pending");
    const failed = sum(rail, (t) => t.from === "escrow" && t.to === to && t.status === "failed");
    return (
      <td key={to} className="tabular-nums">
        {usd(settled)}
        {pending > 0 && <span className="block text-xs text-muted-foreground">+{usd(pending)} pending</span>}
        {failed > 0 && <span className="block text-xs text-destructive">{usd(failed)} failed</span>}
      </td>
    );
  };
  const transfers = m.outbox.filter((o) => ["payout", "refund", "capture", "release", "reconcile"].includes(o.kind));

  return (
    <div className="flex flex-col gap-8">
      <Section title="Who received the platform fee">
        <FeeDestination />
      </Section>

      <Section title="Ledger totals" description="Live money by rail. Settled amounts, with anything pending or failed beneath.">
        <Table head={["Rail", "Funded in", ...ACCOUNTS.map(([, label]) => label), "In escrow"]} empty="No live money yet.">
          {rails.map((rail) => {
            const fundedSettled = sum(rail, (t) => t.from === "requester" && t.status === "settled");
            const fundedPending = sum(rail, (t) => t.from === "requester" && t.status === "pending");
            const out = sum(rail, (t) => t.from === "escrow" && t.status === "settled");
            return (
              <tr key={rail}>
                <td className="font-medium">{rail}</td>
                <td className="tabular-nums">
                  {usd(fundedSettled)}
                  {fundedPending > 0 && <span className="block text-xs text-muted-foreground">+{usd(fundedPending)} held</span>}
                </td>
                {ACCOUNTS.map(([to]) => cell(rail, to))}
                <td className="tabular-nums">{usd(fundedSettled - out)}</td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Section title="Money on its way" description="Captures, payouts, refunds and provider reports the outbox hasn't finished.">
        <Table head={["#", "Kind", "Task / entry", "Amount", "Attempts", "Next try", "Last error", ""]} empty="Nothing in flight.">
          {transfers.map((o) => {
            const p = o.payload as { ledgerKey?: string; taskId?: string; amount?: number };
            const ref = p.ledgerKey ?? p.taskId ?? "";
            return (
              <tr key={o.id}>
                <td className="tabular-nums">{o.id}</td>
                <td>{o.kind}</td>
                <td>
                  <Link href={`/admin/tasks/${ref.split(":")[0]}`} className="hover:underline">
                    <Mono>{ref.length > 20 ? `${shortId(ref)}…${ref.split(":")[1] ?? ""}` : ref}</Mono>
                  </Link>
                </td>
                <td className="tabular-nums">{p.amount !== undefined ? usd(p.amount) : "—"}</td>
                <td className="tabular-nums">{o.attempts}</td>
                <td className="text-xs">{when(o.nextAttemptAt)}</td>
                <td className="max-w-64 text-xs text-destructive">{o.lastError ?? ""}</td>
                <td>
                  {o.lastError && (
                    <AdminForm action={retryOutbox.bind(null, o.id)} label="Retry now" confirm="Send this again now. Payouts are journaled and keyed, so it can't pay twice.">
                      {null}
                    </AdminForm>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Section
        title="Pending and failed entries"
        description="Live ledger entries not yet settled. A failed transfer means the money is back in escrow, and nothing is sent again by itself. Send again makes a new PayPal payout for the same ledger entry, to the worker's PayPal email as it is now. Check the reason first: if it was the email, make sure the worker has logged in with PayPal again so their email is current."
      >
        <EntryTable entries={m.unsettled} empty="Every live entry is settled." failures={m.failures} />
      </Section>

      <Section title="Refunds">
        <EntryTable entries={m.refunds} empty="No refunds yet." />
      </Section>

      <Section title="Recent entries" description="The latest 50 movements, live and test.">
        <EntryTable entries={m.recent} />
      </Section>
    </div>
  );
}

type Entry = Awaited<ReturnType<ReturnType<typeof getDesk>["adminMoney"]>>["recent"][number];

type Failures = Awaited<ReturnType<ReturnType<typeof getDesk>["adminMoney"]>>["failures"];

function EntryTable({ entries, empty, failures }: { entries: Entry[]; empty?: string; failures?: Failures }) {
  const resend = failures !== undefined;
  return (
    <Table head={["When", "Task", "From → to", "Amount", "Status", "Rail", "Tx", ...(resend ? ["Why it failed", "Sent", "Action"] : [])]} empty={empty}>
      {entries.map((e) => (
        <tr key={e.id}>
          <td className="text-xs whitespace-nowrap">{when(e.at)}</td>
          <td>
            {e.taskId && (
              <Link href={`/admin/tasks/${e.taskId}`} className="hover:underline">
                <Mono>{shortId(e.taskId)}</Mono>
              </Link>
            )}
          </td>
          <td className="whitespace-nowrap">
            {e.from} → {e.to}
          </td>
          <td className="tabular-nums">{usd(e.amount)}</td>
          <td>
            <StatusBadge status={e.status} />
          </td>
          <td className="whitespace-nowrap">
            {e.rail ?? "—"} <LiveBadge test={e.test} />
          </td>
          <td>
            <Mono title={e.txHash ?? undefined}>{e.txHash ? `${e.txHash.slice(0, 14)}…` : "—"}</Mono>
          </td>
          {resend && (
            <td className="max-w-64 text-xs">
              {e.status === "failed" ? (
                <span className="text-destructive">{failures[e.key]?.reason ?? "No reason reported"}</span>
              ) : (
                "—"
              )}
            </td>
          )}
          {resend && (
            <td className="tabular-nums">{e.status === "failed" ? `${failures[e.key]?.sends ?? 0}×` : "—"}</td>
          )}
          {resend && (
            <td>
              {/* The desk checks again: only a failed PayPal payout to a worker or reviewer is sent again. */}
              {e.status === "failed" && e.rail === "paypal" && (e.to === "worker" || e.to === "reviewer") && (
                <AdminForm
                  action={resendPayout.bind(null, e.key)}
                  label="Send again"
                  confirm="Send a new PayPal payout for this entry, to the worker's current PayPal email. Only do this once whatever stopped the last one is fixed."
                >
                  {null}
                </AdminForm>
              )}
            </td>
          )}
        </tr>
      ))}
    </Table>
  );
}

export default function AdminMoneyPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Money</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Money />
      </Suspense>
    </main>
  );
}
