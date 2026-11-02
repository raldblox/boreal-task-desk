import { type Database, walletSetups } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";

// A worker with only PayPal sets up their own NEAR or Concordium account to take a task paid
// there. boreal never holds the wallet; it only counts first setups made through its guide.

let db: Database;
let close: () => Promise<void>;
let desk: Desk;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  desk = createDesk({ db });
});

afterEach(() => close());

async function worker(n: number): Promise<Caller> {
  const w = await desk.signInWithPayPal({ ref: `pp:${n.toString(16).padStart(64, "0")}`, email: `w${n}@example.com`, verified: true });
  return { role: "worker", workerId: w.id };
}

describe("wallet setups through boreal", () => {
  it("counts a first guided setup per chain, and nothing about who", async () => {
    const maria = await worker(1);
    const jun = await worker(2);
    expect(await desk.payoutReady(maria, "near")).toBe(false);

    await desk.setPayoutAddress(maria, "maria.testnet", "near", { guided: true });
    await desk.setPayoutAddress(jun, "jun.testnet", "near", { guided: true });
    await desk.setPayoutAddress(jun, "4UrDcXrqCfC8Nbf2SpFGwHuQbVKfVjAc6mJYNGc9Kqpt", "concordium", { guided: true });
    expect(await desk.payoutReady(maria, "near")).toBe(true);
    expect(await desk.walletSetupCounts()).toEqual({ near: 2, concordium: 1 });

    // Changing an account isn't a new setup; neither is one typed on My account, or a PayPal email.
    await desk.setPayoutAddress(maria, "maria2.testnet", "near", { guided: true });
    const ana = await worker(3);
    await desk.setPayoutAddress(ana, "ana.testnet", "near");
    await desk.setPayoutAddress(ana, "ana@example.com", "paypal", { guided: true });
    expect(await desk.walletSetupCounts()).toEqual({ near: 2, concordium: 1 });

    // Each row is the chain and a time, nothing else.
    const [row] = await db.select().from(walletSetups).limit(1);
    expect(Object.keys(row!).sort()).toEqual(["chain", "createdAt", "id"]);
  });
});
