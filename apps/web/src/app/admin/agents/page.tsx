import { Suspense } from "react";

import { setAgentStatus } from "@/app/admin/actions";
import { AdminForm } from "@/components/admin/admin-form";
import { Mono, StatusBadge, Table } from "@/components/admin/parts";
import { Badge } from "@/components/ui/badge";
import { usd, when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

async function Agents() {
  await requireAdmin();
  const list = await getDesk().adminAgents();
  return (
    <Table head={["Requester", "Owner", "Status", "Limits (task / day)", "Spent (live / 24h)", "Badge", "PayPal", ""]} empty="No agents yet.">
      {list.map((a) => (
        <tr key={a.id}>
          <td>
            <p className="font-medium">
              {a.name} {a.kind === "personal" && <Badge variant="secondary">person</Badge>}
              {a.kind === "market" && <Badge variant="secondary">NEAR market</Badge>}
            </p>
            {a.kind === "personal" ? <p className="text-xs text-muted-foreground">Posts on the website; no key</p> : <Mono>{a.registryId}</Mono>}
            <p className="text-xs text-muted-foreground">
              {a.tasks} tasks · since {when(a.createdAt)}
            </p>
          </td>
          <td>
            <Mono>{a.owner.verifiedRef}</Mono>
            <p className="text-xs text-muted-foreground">{a.owner.kind}</p>
          </td>
          <td className="whitespace-nowrap">
            <StatusBadge status={a.status} /> {a.testMode && <Badge variant="outline">test mode</Badge>}
          </td>
          <td className="tabular-nums whitespace-nowrap">
            {usd(a.limits.maxTaskBudget)} / {usd(a.limits.maxDailySpend)}
          </td>
          <td className="tabular-nums whitespace-nowrap">
            {usd(a.spent)} / {usd(a.spentLast24h)}
          </td>
          <td>{a.badge ? <Badge>{a.badge.network ?? "verified"}</Badge> : <span className="text-muted-foreground">—</span>}</td>
          <td>{a.paypalConnected ? "connected" : <span className="text-muted-foreground">—</span>}</td>
          <td>
            <AdminForm
              action={setAgentStatus.bind(null, a.id)}
              label={a.status === "frozen" ? "Unfreeze" : "Freeze"}
              variant={a.status === "frozen" ? "outline" : "destructive"}
              confirm={
                a.status === "frozen"
                  ? a.kind === "personal"
                    ? `Let ${a.name} post on the website again.`
                    : `Let ${a.name} use its key again.`
                  : a.kind === "personal"
                    ? `Pause ${a.name}'s posting: they can't post or fund tasks. Their tasks' timers and payouts carry on.`
                    : `Lock ${a.name}'s key: it can't post, fund, accept or dispute. Its tasks' timers and payouts carry on.`
              }
            >
              <input type="hidden" name="status" value={a.status === "frozen" ? "active" : "frozen"} />
            </AdminForm>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export default function AdminAgentsPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Agents and owners</h1>
        <p className="text-sm text-muted-foreground">
          Owners show as their Concordium ID pseudonym (or LEI for businesses). Spend counts live money funded into escrow.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Agents />
      </Suspense>
    </main>
  );
}
