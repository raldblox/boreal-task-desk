import { Suspense } from "react";

import { setWorkerBlocked } from "@/app/admin/actions";
import { AdminForm } from "@/components/admin/admin-form";
import { Mono, Table } from "@/components/admin/parts";
import { Badge } from "@/components/ui/badge";
import { attributeLabel, usd, when } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

async function Workers() {
  await requireAdmin();
  const list = await getDesk().adminWorkers();
  return (
    <Table head={["Pseudonym", "Signs in with", "Proven attributes", "Payout set", "Claimed", "Paid / not paid", "Earned (live)", "Since"]} empty="No workers yet.">
      {list.map((w) => (
        <tr key={w.id}>
          <td>
            <Mono>{w.pseudonym}</Mono> {w.testMode && <Badge variant="outline">tester</Badge>}
          </td>
          <td>
            <div className="flex flex-wrap gap-1">
              {w.hasPayPal && <Badge variant="outline">PayPal{w.paypalVerified ? " · verified" : ""}</Badge>}
              {w.hasConcordium && <Badge>Verified by Concordium</Badge>}
              {!w.hasPayPal && !w.hasConcordium && "—"}
            </div>
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

/** Accounts that may be one person: shared payout destinations, and repeat passes by one owner. */
async function SamePerson() {
  await requireAdmin();
  const signals = await getDesk().adminSamePersonSignals();
  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">No signs of one person behind two accounts in the last 30 days.</p>;
  }
  return (
    <Table head={["Signal", "What", "Workers"]}>
      {signals.map((s, i) => (
        <tr key={i}>
          <td>
            <Badge variant={s.kind === "shared payout" ? "destructive" : "outline"}>{s.kind}</Badge>
          </td>
          <td className="text-sm">{s.detail}</td>
          <td>
            <div className="flex flex-col gap-2">
              {s.workers.map((w) => (
                <div key={w.id} className="flex flex-wrap items-center gap-2">
                  <Mono>{w.pseudonym.length > 20 ? `${w.pseudonym.slice(0, 18)}…` : w.pseudonym}</Mono>
                  {w.blocked && <Badge variant="destructive">blocked</Badge>}
                  <AdminForm
                    action={setWorkerBlocked.bind(null, w.id)}
                    label={w.blocked ? "Unblock" : "Block from claiming"}
                    variant={w.blocked ? "outline" : "destructive"}
                    confirm={
                      w.blocked
                        ? "Let this worker claim tasks again."
                        : "Stop this worker claiming tasks. Work they've already claimed or submitted runs its course, and they're still paid for it."
                    }
                  >
                    <input type="hidden" name="blocked" value={w.blocked ? "no" : "yes"} />
                  </AdminForm>
                </div>
              ))}
            </div>
          </td>
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
          A pseudonym, which identities sign them in, and proven attributes are all boreal.work keeps. Identities and payout
          destinations show only whether one is set.
        </p>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Possibly the same person</h2>
        <p className="text-sm text-muted-foreground">
          One person, one account. The desk already refuses a second account for a person proven with Concordium ID, and a payout
          destination already connected elsewhere. These are the softer signs, for you to look into: block one account from claiming if
          it&apos;s one person working twice.
        </p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Checking…</p>}>
          <SamePerson />
        </Suspense>
      </section>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Workers />
      </Suspense>
    </main>
  );
}
