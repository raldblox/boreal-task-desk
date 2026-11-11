import { adminActions, type Database } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";

let db: Database;
let close: () => Promise<void>;
let desk: Desk;
const admin = { ref: "pp:admin" };
const other = { ref: "pp:other" };
const key = (n: number) => ({ credentialId: `credential-${n}`, publicKey: `public-key-${n}`, counter: 0, label: `key ${n}` });

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === code);
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  desk = createDesk({ db });
});
afterEach(() => close());

describe("admin passkeys", () => {
  it("stores a passkey once, for one admin, and logs it", async () => {
    await desk.addAdminPasskey(admin, key(1));
    await expectDeskError(desk.addAdminPasskey(other, key(1)), "conflict");
    await expectDeskError(desk.addAdminPasskey(admin, { ...key(2), publicKey: "not base64 url!" }), "invalid");
    expect((await desk.adminPasskeys(admin.ref)).map((p) => p.label)).toEqual(["key 1"]);
    expect(await desk.adminPasskeys(other.ref)).toEqual([]);
    expect((await db.select().from(adminActions)).map((a) => a.action)).toEqual(["add_passkey"]);
  });

  it("refuses a counter that went backwards (a cloned key), and another admin's key", async () => {
    await desk.addAdminPasskey(admin, key(1));
    await desk.useAdminPasskey(admin.ref, "credential-1", 0); // keys that don't count report 0
    await desk.useAdminPasskey(admin.ref, "credential-1", 5);
    await expectDeskError(desk.useAdminPasskey(admin.ref, "credential-1", 5), "forbidden");
    await expectDeskError(desk.useAdminPasskey(admin.ref, "credential-1", 3), "forbidden");
    await expectDeskError(desk.useAdminPasskey(other.ref, "credential-1", 9), "forbidden");
    await desk.useAdminPasskey(admin.ref, "credential-1", 6);
  });

  it("never removes an admin's last passkey", async () => {
    const first = await desk.addAdminPasskey(admin, key(1));
    await expectDeskError(desk.removeAdminPasskey(admin, first.id, "lost this key"), "conflict");
    const second = await desk.addAdminPasskey(admin, key(2));
    await expectDeskError(desk.removeAdminPasskey(other, first.id, "not mine to remove"), "not_found");
    await desk.removeAdminPasskey(admin, first.id, "lost this key");
    expect((await desk.adminPasskeys(admin.ref)).map((p) => p.id)).toEqual([second.id]);
  });
});
