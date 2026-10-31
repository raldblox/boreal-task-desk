import { describe, expect, it } from "vitest";

import { createDevConcordium, signDevPayment } from "./dev";
import { idAppConfigFromEnv, IdAppError, loadConcordium, readPresentation } from "./index";

const secret = "x".repeat(32);

describe("dev payments", () => {
  it("confirms a correctly signed payment and is deterministic per nonce", async () => {
    const c = createDevConcordium({ secret });
    const requirement = await c.payments.createPaymentRequest("task-1", 1_170);
    const payment = { requirement, signature: signDevPayment(secret, requirement) };
    const first = await c.payments.confirmPayment("task-1", payment);
    expect(first.amount).toBe(1_170);
    expect((await c.payments.confirmPayment("task-1", payment)).txHash).toBe(first.txHash);
  });

  it("rejects tampered amounts, other tasks and expired requests", async () => {
    let clock = new Date("2026-11-02T00:00:00Z");
    const c = createDevConcordium({ secret, now: () => clock });
    const requirement = await c.payments.createPaymentRequest("task-1", 1_170);
    const signature = signDevPayment(secret, requirement);

    await expect(
      c.payments.confirmPayment("task-1", { requirement: { ...requirement, amount: 1 }, signature }),
    ).rejects.toThrow(/signature/);
    await expect(c.payments.confirmPayment("task-2", { requirement, signature })).rejects.toThrow(/another task/);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    await expect(c.payments.confirmPayment("task-1", { requirement, signature })).rejects.toThrow(/expired/);
  });
});

describe("dev identity", () => {
  it("accepts a presentation that proves every requested attribute", async () => {
    const c = createDevConcordium({ secret });
    const request = await c.identity.createProofRequest([{ attribute: "residency", value: "PH" }]);
    const worker = await c.identity.verifyPresentation(request, {
      pseudonym: "ph-1",
      attributes: { residency: "PH", age_over_18: "true" },
    });
    expect(worker.pseudonym).toBe("ph-1");
  });

  it("rejects a forged challenge or a missing attribute", async () => {
    const c = createDevConcordium({ secret });
    const request = await c.identity.createProofRequest([{ attribute: "residency", value: "PH" }]);
    await expect(
      c.identity.verifyPresentation(request, { pseudonym: "us-1", attributes: { residency: "US" } }),
    ).rejects.toThrow(/residency/);
    await expect(
      c.identity.verifyPresentation({ ...request, challenge: `${request.challenge}x` }, { pseudonym: "a", attributes: {} }),
    ).rejects.toThrow(/signature/);
  });
});

describe("loadConcordium", () => {
  it("stays off when unset and refuses dev mode on production", () => {
    expect(loadConcordium({})).toBeNull();
    expect(() =>
      loadConcordium({ CONCORDIUM_MODE: "dev", DEV_CONCORDIUM_SECRET: secret, VERCEL_ENV: "production" }),
    ).toThrow(/refused on production/);
    expect(() =>
      loadConcordium({ CONCORDIUM_MODE: "dev", DEV_CONCORDIUM_SECRET: secret, DATABASE_URL: "postgres://u@ep-x.neon.tech/db" }),
    ).toThrow(/local DATABASE_URL/);
    expect(
      loadConcordium({ CONCORDIUM_MODE: "dev", DEV_CONCORDIUM_SECRET: secret, DATABASE_URL: "postgres://postgres@localhost:5433/postgres" }),
    ).not.toBeNull();
  });
});

describe("Concordium ID App presentations", () => {
  const account = (statement: object[]) =>
    ({
      verifiableCredential: [
        {
          type: ["VerifiableCredential", "ConcordiumVerifiableCredentialV1", "ConcordiumAccountBasedCredential"],
          credentialSubject: { id: "did:ccd:testnet:cred:a1b2", statement },
        },
      ],
    }) as unknown as Parameters<typeof readPresentation>[0];

  it("reads the account DID, the age proof and the revealed country", () => {
    const worker = readPresentation(
      account([
        { type: "AttributeInRange", attributeTag: "dob", lower: "18000101", upper: "20081102" },
        { type: "AttributeValue", attributeTag: "countryOfResidence", attributeValue: "PH" },
      ]),
    );
    expect(worker).toEqual({ pseudonym: "did:ccd:testnet:cred:a1b2", provenAttributes: { residency: "PH", age_over_18: "true" } });
  });

  it("rejects a proof without the age statement, or from an identity credential", () => {
    expect(() => readPresentation(account([{ type: "AttributeValue", attributeTag: "countryOfResidence", attributeValue: "PH" }]))).toThrow(IdAppError);
    const identity = { verifiableCredential: [{ type: ["VerifiableCredential", "ConcordiumIdBasedCredential"], credentialSubject: { id: "x", statement: [] } }] };
    expect(() => readPresentation(identity as never)).toThrow(/account credential/);
  });

  it("is configured only with an anchor account and key", () => {
    expect(idAppConfigFromEnv({})).toBeNull();
    expect(idAppConfigFromEnv({ CONCORDIUM_ANCHOR_ACCOUNT: "4abc", CONCORDIUM_ANCHOR_KEY: "00" })).toMatchObject({
      network: "Testnet",
      grpcHost: "grpc.testnet.concordium.com",
      grpcPort: 20000,
    });
  });
});
