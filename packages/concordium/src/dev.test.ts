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
      c.payments.confirmPayment("task-1", { requirement: { ...requirement, amount: "1" }, signature }),
    ).rejects.toThrow(/signature/);
    await expect(
      c.payments.confirmPayment("task-1", { requirement: { ...requirement, extra: { ...requirement.extra, minorUnits: 1 } }, signature }),
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
  const secret = "p".repeat(32);
  const identity = (statement: object[], issuer = "did:ccd:testnet:idp:0") =>
    ({
      verifiableCredential: [
        {
          type: ["VerifiableCredential", "ConcordiumVerifiableCredentialV1", "ConcordiumIdBasedCredential"],
          issuer,
          credentialSubject: { id: "ephemeral-changes-every-time", statement },
        },
      ],
    }) as unknown as Parameters<typeof readPresentation>[0];
  const full = [
    { type: "AttributeInRange", attributeTag: "dob", lower: "18000101", upper: "20081102" },
    { type: "AttributeValue", attributeTag: "countryOfResidence", attributeValue: "PH" },
    { type: "AttributeValue", attributeTag: "idDocNo", attributeValue: "P1234567" },
    { type: "AttributeValue", attributeTag: "idDocIssuer", attributeValue: "PH" },
  ];

  it("derives a stable pseudonym without keeping the document number", () => {
    const first = readPresentation(identity(full), secret);
    const again = readPresentation(identity(full), secret);
    expect(first.pseudonym).toBe(again.pseudonym);
    expect(first.pseudonym).toMatch(/^ccdid:[0-9a-f]{64}$/);
    expect(JSON.stringify(first)).not.toContain("P1234567");
    expect(first.provenAttributes).toEqual({ age_over_18: "true", residency: "PH" });
  });

  it("gives different people, providers or secrets different pseudonyms", () => {
    const base = readPresentation(identity(full), secret).pseudonym;
    const other = full.map((st) => (st.attributeTag === "idDocNo" ? { ...st, attributeValue: "P7654321" } : st));
    expect(readPresentation(identity(other), secret).pseudonym).not.toBe(base);
    expect(readPresentation(identity(full, "did:ccd:testnet:idp:3"), secret).pseudonym).not.toBe(base);
    expect(readPresentation(identity(full), "q".repeat(32)).pseudonym).not.toBe(base);
  });

  it("rejects a proof without the age statement or document details, or an account credential", () => {
    expect(() => readPresentation(identity(full.slice(1)), secret)).toThrow(/18 or older/);
    expect(() => readPresentation(identity(full.slice(0, 2)), secret)).toThrow(/document/);
    const account = { verifiableCredential: [{ type: ["VerifiableCredential", "ConcordiumAccountBasedCredential"], credentialSubject: { id: "x", statement: full } }] };
    expect(() => readPresentation(account as never, secret)).toThrow(IdAppError);
  });

  it("is configured only with an anchor account, key and pseudonym secret", () => {
    const account = "4".padEnd(50, "a");
    const env = { CONCORDIUM_ANCHOR_ACCOUNT: account, CONCORDIUM_ANCHOR_KEY: "1".repeat(64), CONCORDIUM_PSEUDONYM_SECRET: secret };
    expect(idAppConfigFromEnv({})).toBeNull();
    expect(idAppConfigFromEnv({ ...env, CONCORDIUM_PSEUDONYM_SECRET: undefined })).toBeNull();
    expect(idAppConfigFromEnv({ ...env, CONCORDIUM_ANCHOR_ACCOUNT: `0x${"a".repeat(40)}` })).toBeNull();
    expect(idAppConfigFromEnv(env)).toMatchObject({ network: "Testnet", grpcHost: "grpc.testnet.concordium.com", grpcPort: 20000 });
  });
});
