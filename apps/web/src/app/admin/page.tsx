import { TASK_STATUSES } from "@boreal/core";
import type { PaymentRail } from "@boreal/concordium";
import Link from "next/link";
import { Suspense } from "react";

import { Section, Stat, Table } from "@/components/admin/parts";
import { AddonsPanel } from "@/components/addons-panel";
import { usd, when } from "@/lib/format";
import { getAddons } from "@/server/addons";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

type EscrowState = { label: string; detail: string; className: string };

/** Short pauses the rail's payouts and refunds; in flight settles by itself; unmatched pauses nothing. */
function escrowState(r: { gap: number | null; inFlight: number | null; short: number | null; error: string | null }): EscrowState {
  if (r.error) return { label: "Couldn't check", detail: r.error, className: "text-destructive" };
  if (r.short && r.short > 0) {
    return { label: `Short ${usd(r.short)}`, detail: "Payouts and refunds on this rail are paused until it's found.", className: "font-semibold text-destructive" };
  }
  if (r.gap !== null && r.gap < 0) {
    return { label: `In flight ${usd(-r.gap)}`, detail: "Sent and not yet recorded. Settles by itself; nothing is paused.", className: "text-foreground" };
  }
  if (r.gap !== null && r.gap > 0) {
    return { label: `Unmatched ${usd(r.gap)}`, detail: "More than the ledger accounts for, such as a deposit no task claims. Nothing is paused.", className: "font-medium text-foreground" };
  }
  return { label: "Matches", detail: "", className: "text-muted-foreground" };
}

/** Each rail's escrow against the ledger; a shortfall pauses the outbox. */
async function Escrow() {
  const desk = getDesk();
  const rails = Object.keys(desk.rails) as PaymentRail[];
  const rows = await Promise.all(
    rails.map(async (rail) => {
      try {
        return { rail, ...(await desk.reconcileEscrow(rail)), error: null };
      } catch (error) {
        return { rail, expected: null, actual: null, gap: null, inFlight: null, short: null, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  return (
    <Section
      title="Escrow reconciliation"
      description="Settled live money the ledger says escrow holds, against the rail's own balance. Short (red) means the rail holds less than the ledger and any transfers still in flight, so its payouts and refunds are paused. In flight means a transfer was sent and isn't recorded yet; it settles by itself. Unmatched means the rail holds more than the ledger says; nothing is paused. PayPal's account also holds boreal.work's fees, so its balance is read from the ledger and always matches here."
    >
      <Table head={["Rail", "Ledger says", "Rail holds", "State"]} empty="No payment rail is switched on here.">
        {rows.map((r) => (
          <tr key={r.rail}>
            <td className="font-medium">
              {r.rail}
              {r.rail === "paypal" && <span className="block text-xs font-normal text-muted-foreground">from the ledger</span>}
            </td>
            <td className="tabular-nums">{r.expected === null ? "—" : usd(r.expected)}</td>
            <td className="tabular-nums">{r.actual === null ? "—" : usd(r.actual)}</td>
            <td>
              {(() => {
                const state = escrowState(r);
                return (
                  <>
                    <span className={state.className}>{state.label}</span>
                    {state.detail && <span className="block max-w-72 text-xs text-muted-foreground">{state.detail}</span>}
                  </>
                );
              })()}
            </td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

async function Overview() {
  await requireAdmin();
  const [o, setups, closedRails] = await Promise.all([getDesk().adminOverview(), getDesk().walletSetupCounts(), getDesk().closedRails()]);
  const count = (status: string, test: boolean) => o.byStatus.find((s) => s.status === status && s.test === test)?.n ?? 0;
  const failing = o.outbox.reduce((sum, r) => sum + r.failing, 0);
  const backlog = o.outbox.reduce((sum, r) => sum + r.n, 0);
  const addons = getAddons();
  const waiting = o.queue.screen + o.queue.review + o.queue.human + o.queue.disputed;
  return (
    <div className="flex flex-col gap-8">
      {closedRails.size > 0 && (
        <Link
          href="/admin/controls"
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm font-medium text-destructive hover:underline"
        >
          Closed to new money: {[...closedRails].join(", ")}. New funding on {closedRails.size === 1 ? "it" : "them"} is refused. Open it again in Controls.
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/admin/review">
          <Stat label="Waiting on boreal.work" value={waiting} note={`${o.queue.screen} to screen · ${o.queue.review} to review · ${o.queue.disputed} disputed · ${o.queue.human} flagged`} tone={waiting ? "warn" : undefined} />
        </Link>
        <Stat label="Waiting on requesters" value={o.queue.requester} note="Submissions the agent reviews itself" />
        <Link href="/admin/controls">
          <Stat label="Outbox backlog" value={backlog} note={`${failing} failing`} tone={failing ? "warn" : undefined} />
        </Link>
        <Link href="/admin/money">
          <Stat label="Failed transfers" value={o.failedLedgerEntries} note="Ledger entries a provider reported failed" tone={o.failedLedgerEntries ? "warn" : undefined} />
        </Link>
      </div>

      <Section
        title="Integrations"
        description="PayPal is the core. NEAR and Concordium are optional, switched on per deployment with BOREAL_ADDONS; each lists what it needs before it can run."
      >
        <AddonsPanel addons={[addons.concordium, addons.near, addons.evm]} source={addons.source} operator />
        {(addons.on("near") || addons.on("concordium")) && (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {/* Counted per chain only, from the guided setup on a task; nothing about who. */}
            {addons.on("near") && <Stat label="NEAR accounts set up through boreal.work" value={setups.near} note="First payout account, from a task’s guided setup" />}
            {addons.on("concordium") && (
              <Stat label="Concordium accounts set up through boreal.work" value={setups.concordium} note="First payout account, from a task’s guided setup" />
            )}
          </div>
        )}
      </Section>

      <Section title="Activity" description="Live money only; test money never leaves the ledger.">
        <Table head={["Window", "Posted (live / test)", "Funded", "Paid to workers"]}>
          {o.windows.map((w) => (
            <tr key={w.days}>
              <td className="font-medium">{w.days === 1 ? "Last 24 hours" : `Last ${w.days} days`}</td>
              <td className="tabular-nums">
                {w.posted.live} / {w.posted.test}
              </td>
              <td className="tabular-nums">
                {w.funded.n} · {usd(w.funded.amount)}
              </td>
              <td className="tabular-nums">
                {w.paid.n} · {usd(w.paid.amount)}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Checking escrow…</p>}>
        <Escrow />
      </Suspense>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Tasks by status">
          <Table head={["Status", "Live", "Test"]}>
            {TASK_STATUSES.filter((s) => count(s, false) + count(s, true) > 0).map((s) => (
              <tr key={s}>
                <td>
                  <Link href={`/admin/tasks?status=${s}`} className="hover:underline">
                    {s.replace("_", " ")}
                  </Link>
                </td>
                <td className="tabular-nums">{count(s, false)}</td>
                <td className="tabular-nums text-muted-foreground">{count(s, true)}</td>
              </tr>
            ))}
          </Table>
        </Section>
        <Section title="Outbox" description="Side effects still to send, by kind.">
          <Table head={["Kind", "Pending", "Failing", "Oldest"]} empty="All sent.">
            {o.outbox.map((r) => (
              <tr key={r.kind}>
                <td>{r.kind}</td>
                <td className="tabular-nums">{r.n}</td>
                <td className={r.failing ? "font-semibold text-destructive tabular-nums" : "tabular-nums"}>{r.failing}</td>
                <td className="text-xs text-muted-foreground">{r.oldest ? when(r.oldest) : "—"}</td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}
