import { describe, expect, it } from "vitest";

import { readPresentation, readWalletPresentation, walletChallenge } from "./index";

// Concordium Wallet for Web answers a fee-free Web3 ID request. Its presentation must give the
// same worker as the ID App's anchored one, and must prove exactly what boreal.work asked.

const secret = "p".repeat(32);
const asked = [
  {
    idQualifier: { type: "cred", issuers: [0, 1] },
    statement: [
      { type: "AttributeInRange", attributeTag: "dob", lower: "18000101", upper: "20081102" },
      { type: "RevealAttribute", attributeTag: "countryOfResidence" },
      { type: "RevealAttribute", attributeTag: "idDocNo" },
      { type: "RevealAttribute", attributeTag: "idDocIssuer" },
      { type: "RevealAttribute", attributeTag: "firstName" },
      { type: "RevealAttribute", attributeTag: "lastName" },
      { type: "RevealAttribute", attributeTag: "dob" },
    ],
  },
] as unknown as Parameters<typeof readWalletPresentation>[1];
const values = ["PH", "P1234567", "PH", "Juan", "Dela Cruz", "19950407"];

const walletPresentation = (statement = (asked[0] as { statement: object[] }).statement, issuer = "did:ccd:testnet:idp:0") =>
  ({
    verifiableCredential: [
      {
        type: ["VerifiableCredential", "ConcordiumVerifiableCredential"],
        issuer,
        credentialSubject: {
          id: "did:ccd:testnet:cred:abc",
          // Written by the wallet in its own key order.
          statement: statement.map((s) => Object.fromEntries(Object.entries(s).reverse())),
          proof: { type: "ConcordiumZKProofV3", created: "", proofValue: [{ type: "AttributeInRange", proof: "" }, ...values.map((attribute) => ({ type: "RevealAttribute", attribute, proof: "" }))] },
        },
      },
    ],
  }) as unknown as Parameters<typeof readWalletPresentation>[0];

const idAppPresentation = () =>
  ({
    verifiableCredential: [
      {
        type: ["VerifiableCredential", "ConcordiumVerifiableCredentialV1", "ConcordiumIdBasedCredential"],
        issuer: "did:ccd:testnet:idp:0",
        credentialSubject: {
          id: "x",
          statement: [
            { type: "AttributeInRange", attributeTag: "dob", lower: "18000101", upper: "20081102" },
            ...["countryOfResidence", "idDocNo", "idDocIssuer", "firstName", "lastName", "dob"].map((attributeTag, i) => ({
              type: "AttributeValue",
              attributeTag,
              attributeValue: values[i],
            })),
          ],
        },
      },
    ],
  }) as unknown as Parameters<typeof readPresentation>[0];

describe("Wallet for Web proofs (Web3 ID, no anchor)", () => {
  it("gives the same worker and person code as the ID App's proof of the same identity", () => {
    const wallet = readWalletPresentation(walletPresentation(), asked, secret);
    const idApp = readPresentation(idAppPresentation(), secret);
    expect(wallet).toEqual(idApp);
    expect(wallet.personRef).toMatch(/^ccdp:/);
    expect(JSON.stringify(wallet)).not.toContain("P1234567");
  });

  it("refuses a proof of anything other than what was asked", () => {
    const fewer = (asked[0] as { statement: object[] }).statement.slice(0, 4);
    expect(() => readWalletPresentation(walletPresentation(fewer), asked, secret)).toThrow(/doesn't answer/);
    const younger = [{ type: "AttributeInRange", attributeTag: "dob", lower: "18000101", upper: "20201102" }, ...(asked[0] as { statement: object[] }).statement.slice(1)];
    expect(() => readWalletPresentation(walletPresentation(younger), asked, secret)).toThrow(/doesn't answer/);
  });

  it("refuses an identity provider that wasn't listed", () => {
    expect(() => readWalletPresentation(walletPresentation(undefined, "did:ccd:testnet:idp:7"), asked, secret)).toThrow(/identity provider/);
  });

  it("binds the challenge to the block and the nonce", () => {
    const block = "ab".repeat(32);
    expect(walletChallenge(block, "01".repeat(32))).toMatch(/^[0-9a-f]{64}$/);
    expect(walletChallenge(block, "01".repeat(32))).not.toBe(walletChallenge(block, "02".repeat(32)));
    expect(walletChallenge(block, "01".repeat(32))).not.toBe(walletChallenge("cd".repeat(32), "01".repeat(32)));
  });
});
