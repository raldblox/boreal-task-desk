import { Suspense } from "react";

import { Mono, Table } from "@/components/admin/parts";
import { Badge } from "@/components/ui/badge";
import { attributeLabel, usd, when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

async function Workers() {
  await requireAdmin();
  const list = await getDesk().adminWorkers();
  return (
    <Table head={["Pseudonym", "Proven attributes", "Payout set", "Claimed", "Paid / not paid", "Earned (live)", "Since"]} empty="No workers yet.">
      {list.map((w) => (
        <tr key={w.id}>
          <td>
            <Mono>{w.pseudonym}</Mono> {w.testMode && <Badge variant="outline">tester</Badge>}
          </td>
          <td>
            <div className="flex flex-wrap gap-1">
              {Object.entries(w.provenAttributes).map(([attribute, value]) => (
                <Badge key={attribute} variant="outline">
                  {attributeLabel({ attribute, value })}
                </Badge>
              ))}
            </div>
          </td>
          <td className="text-xs whitespace-nowrap">
            {[w.paypalSet && "PayPal", w.concordiumSet && "Concordium"].filter(Boolean).join(", ") || "—"}
          </td>
          <td className="tabular-nums">{w.claimed}</td>
          <td className="tabular-nums">
            {w.passed} / {w.failed}
          </td>
          <td className="tabular-nums">{usd(w.earned)}</td>
          <td className="text-xs whitespace-nowrap">{when(w.createdAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

export default function AdminWorkersPage() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Workers</h1>
        <p className="text-sm text-muted-foreground">
          A pseudonym and proven attributes are all boreal keeps. Payout destinations show only whether one is set.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Workers />
      </Suspense>
    </main>
  );
}
