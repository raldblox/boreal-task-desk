import { type PaymentRail, PAYMENT_RAILS } from "@boreal/concordium";
import { adminActions, controls, type Database, eq, inArray, type Transaction } from "@boreal/db";

import type { Admin } from "./admin";
import { DeskError } from "./errors";

// Switches an operator sets from /admin while the site runs. They live in the database, so
// every server instance and the monitor obey them at once, with no deploy.
//
// A closed rail takes no new money: funding on it is refused inside the desk's funding checks.
// Tasks already funded on it still settle there (payouts, refunds, captures), because closing a
// rail must never strand money that is already held.

const railKey = (rail: PaymentRail) => `rail:${rail}:closed`;

/** Whether an operator closed this rail to new money. Read inside the funding transaction. */
export async function railClosed(q: Database | Transaction, rail: PaymentRail): Promise<boolean> {
  const [row] = await q.select({ value: controls.value }).from(controls).where(eq(controls.key, railKey(rail)));
  return row?.value === true;
}

export function controlCommands(db: Database, now: () => Date) {
  return {
    /** The rails an operator has closed to new money. */
    async closedRails(): Promise<Set<PaymentRail>> {
      const rows = await db.select().from(controls).where(inArray(controls.key, PAYMENT_RAILS.map(railKey)));
      return new Set(PAYMENT_RAILS.filter((rail) => rows.some((r) => r.key === railKey(rail) && r.value === true)));
    },

    /** Every rail's switch, with who last changed it. */
    async railControls(): Promise<{ rail: PaymentRail; closed: boolean; updatedBy: string | null; updatedAt: Date | null }[]> {
      const rows = await db.select().from(controls).where(inArray(controls.key, PAYMENT_RAILS.map(railKey)));
      return PAYMENT_RAILS.map((rail) => {
        const row = rows.find((r) => r.key === railKey(rail));
        return { rail, closed: row?.value === true, updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt ?? null };
      });
    },

    /** Closes a rail to new money, or opens it again. Logged with who and why, in the same transaction. */
    async adminSetRailClosed(admin: Admin, rail: string, closed: boolean, reason: string) {
      if (!(PAYMENT_RAILS as readonly string[]).includes(rail)) throw new DeskError("invalid", `rail must be one of ${PAYMENT_RAILS.join(", ")}`);
      const why = reason.trim();
      if (why.length < 5) throw new DeskError("invalid", "give a reason of at least 5 characters");
      if (why.length > 1000) throw new DeskError("invalid", "keep the reason under 1000 characters");
      const key = railKey(rail as PaymentRail);
      return db.transaction(async (tx) => {
        const at = now();
        const [before] = await tx.select().from(controls).where(eq(controls.key, key)).for("update");
        if ((before?.value === true) === closed) throw new DeskError("conflict", `the ${rail} rail is already ${closed ? "closed" : "open"}`);
        await tx
          .insert(controls)
          .values({ key, value: closed, updatedBy: admin.ref, updatedAt: at })
          .onConflictDoUpdate({ target: controls.key, set: { value: closed, updatedBy: admin.ref, updatedAt: at } });
        await tx.insert(adminActions).values({ adminRef: admin.ref, action: closed ? "close_rail" : "open_rail", target: `rail:${rail}`, reason: why, outcome: "ok", detail: null, createdAt: at });
        return { rail: rail as PaymentRail, closed };
      });
    },
  };
}
