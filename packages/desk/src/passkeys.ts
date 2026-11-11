import { adminActions, adminPasskeys, and, asc, type Database, eq, sql } from "@boreal/db";

import type { Admin } from "./admin";
import { DeskError } from "./errors";

// The passkeys (WebAuthn security keys, such as a YubiKey) an admin presents on top of signing
// in. The web app runs the WebAuthn ceremony; this only stores the credentials it verified and
// logs every change. Only a public key is kept: nothing here can sign anything.

export interface StoredPasskey {
  id: string;
  credentialId: string;
  /** The credential's public key (COSE), base64url. */
  publicKey: string;
  counter: number;
  transports: string[] | null;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const BASE64URL = /^[A-Za-z0-9_-]{8,2048}$/;

export function passkeyCommands(db: Database, now: () => Date) {
  return {
    /** The admin's registered passkeys, oldest first. */
    async adminPasskeys(adminRef: string): Promise<StoredPasskey[]> {
      return db.select().from(adminPasskeys).where(eq(adminPasskeys.adminRef, adminRef)).orderBy(asc(adminPasskeys.createdAt));
    },

    /** Stores a passkey the web app has just verified for this admin. One credential belongs to one admin. */
    async addAdminPasskey(admin: Admin, input: { credentialId: string; publicKey: string; counter: number; transports?: string[]; label?: string }) {
      if (!BASE64URL.test(input.credentialId) || !BASE64URL.test(input.publicKey)) throw new DeskError("invalid", "that passkey isn't well formed");
      const label = input.label?.trim().slice(0, 60) || null;
      return db.transaction(async (tx) => {
        const at = now();
        const [row] = await tx
          .insert(adminPasskeys)
          .values({ adminRef: admin.ref, credentialId: input.credentialId, publicKey: input.publicKey, counter: Math.max(0, input.counter | 0), transports: input.transports ?? null, label, createdAt: at })
          .onConflictDoNothing({ target: adminPasskeys.credentialId })
          .returning();
        if (!row) throw new DeskError("conflict", "that passkey is already registered");
        await tx.insert(adminActions).values({ adminRef: admin.ref, action: "add_passkey", target: `passkey:${row.id}`, reason: label ?? "passkey registered", outcome: "ok", detail: null, createdAt: at });
        return row;
      });
    },

    /**
     * Records a successful use. A counter that went backwards means the key was cloned: the
     * use is refused. (Keys that don't count report 0 every time, which is allowed.)
     */
    async useAdminPasskey(adminRef: string, credentialId: string, newCounter: number) {
      const [row] = await db
        .update(adminPasskeys)
        .set({ counter: newCounter, lastUsedAt: now() })
        .where(and(eq(adminPasskeys.adminRef, adminRef), eq(adminPasskeys.credentialId, credentialId), sql`(${adminPasskeys.counter} = 0 and ${newCounter} = 0) or ${adminPasskeys.counter} < ${newCounter}`))
        .returning({ id: adminPasskeys.id });
      if (!row) throw new DeskError("forbidden", "that passkey wasn't accepted");
    },

    /** Removes one of the admin's passkeys, never the last: that would lock them out or drop the check. */
    async removeAdminPasskey(admin: Admin, passkeyId: string, reason: string) {
      const why = reason.trim();
      if (why.length < 5) throw new DeskError("invalid", "give a reason of at least 5 characters");
      return db.transaction(async (tx) => {
        const mine = await tx.select().from(adminPasskeys).where(eq(adminPasskeys.adminRef, admin.ref)).for("update");
        const found = mine.find((p) => p.id === passkeyId);
        if (!found) throw new DeskError("not_found", "passkey not found");
        if (mine.length === 1) throw new DeskError("conflict", "this is your only passkey; register another before removing it");
        await tx.delete(adminPasskeys).where(eq(adminPasskeys.id, found.id));
        await tx.insert(adminActions).values({ adminRef: admin.ref, action: "remove_passkey", target: `passkey:${found.id}`, reason: why.slice(0, 1000), outcome: "ok", detail: { label: found.label }, createdAt: now() });
      });
    },
  };
}
