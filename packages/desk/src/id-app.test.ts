import type { Database } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
const isDeskError = (code: string) => (e: unknown) => e instanceof DeskError && e.code === code;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  desk = createDesk({ db, now: () => clock });
});

afterEach(() => close());

describe("Concordium ID sign-in requests", () => {
  it("can be taken once, and not after 15 minutes", async () => {
    const id = await desk.saveVerificationRequest("topic-1", { anchored: true }, "client-a");
    expect((await desk.takeVerificationRequest(id)).request).toEqual({ anchored: true });
    await expect(desk.takeVerificationRequest(id)).rejects.toSatisfy(isDeskError("conflict"));

    const late = await desk.saveVerificationRequest("topic-2", {}, "client-a");
    clock = new Date(clock.getTime() + 16 * 60_000);
    await expect(desk.takeVerificationRequest(late)).rejects.toSatisfy(isDeskError("conflict"));
  });

  it("limits each client to five starts in ten minutes", async () => {
    for (let i = 0; i < 5; i++) {
      await desk.checkVerificationAllowed("client-b");
      await desk.saveVerificationRequest(`t${i}`, {}, "client-b");
    }
    await expect(desk.checkVerificationAllowed("client-b")).rejects.toSatisfy(isDeskError("limit"));
    await desk.checkVerificationAllowed("client-c");
    clock = new Date(clock.getTime() + 11 * 60_000);
    await desk.checkVerificationAllowed("client-b");
  });

  it("keeps one worker per account credential, refreshing attributes", async () => {
    const did = "did:ccd:testnet:cred:abc123";
    const first = await desk.signInVerifiedWorker({ pseudonym: did, provenAttributes: { residency: "PH", age_over_18: "true" } });
    const again = await desk.signInVerifiedWorker({ pseudonym: did, provenAttributes: { residency: "SG", age_over_18: "true" } });
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ testMode: false, provenAttributes: { residency: "SG" } });
  });
});
