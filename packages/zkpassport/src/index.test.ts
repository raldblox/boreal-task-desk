import { personRef } from "@boreal/concordium";
import { describe, expect, it } from "vitest";

import { readPassportResult, ZkPassportError, zkPassportConfigFromEnv } from "./index";
import { passportQuery } from "./query";

const SECRET = "s".repeat(32);
const verified = { verified: true, uniqueIdentifier: "0x1234" };
const result = {
  age: { gte: { result: true, expected: 18 } },
  facematch: { passed: true },
  nationality: { disclose: { result: "PHL" } },
  firstname: { disclose: { result: "JUAN MIGUEL" } },
  lastname: { disclose: { result: "DELA CRUZ" } },
  // As it arrives from the browser: a JSON date string.
  birthdate: { disclose: { result: "1995-04-07T00:00:00.000Z" } },
};

describe("reading a verified ZKPassport result", () => {
  it("keys the identifier, keeps 18+ and nationality, and gives Concordium's person code", () => {
    const identity = readPassportResult(verified, result, SECRET);
    expect(identity.ref).toMatch(/^zkp:[0-9a-f]{64}$/);
    expect(identity.ref).not.toContain("1234");
    expect(identity.provenAttributes).toEqual({ age_over_18: "true", nationality: "PHL" });
    // The same person proving with Concordium ID gets the same code: one account between them.
    expect(identity.personRef).toBe(personRef({ firstName: "Juan Miguel", lastName: "Dela Cruz", dob: "19950407" }, SECRET));
    // Same document, same identity; another document, another.
    expect(readPassportResult(verified, result, SECRET).ref).toBe(identity.ref);
    expect(readPassportResult({ ...verified, uniqueIdentifier: "0x99" }, result, SECRET).ref).not.toBe(identity.ref);
  });

  it("refuses unverified proofs, no identifier, under 18 or a failed face check", () => {
    expect(() => readPassportResult({ ...verified, verified: false }, result, SECRET)).toThrow(ZkPassportError);
    expect(() => readPassportResult({ ...verified, uniqueIdentifier: undefined }, result, SECRET)).toThrow(/unique identifier/);
    expect(() => readPassportResult(verified, { ...result, age: { gte: { result: true, expected: 16 } } }, SECRET)).toThrow(/18 or older/);
    expect(() => readPassportResult(verified, { ...result, age: { gte: { result: false, expected: 18 } } }, SECRET)).toThrow(/18 or older/);
    expect(() => readPassportResult(verified, { ...result, facematch: { passed: false } }, SECRET)).toThrow(/face check/);
  });

  it("leaves out the person code when name or birth date is missing", () => {
    const { birthdate: _skip, ...rest } = result;
    expect(readPassportResult(verified, rest, SECRET).personRef).toBeUndefined();
  });
});

describe("the question", () => {
  it("asks for 18+, nationality, name, birth date, a face match and the nonce", () => {
    const calls: string[] = [];
    const builder = new Proxy({} as Record<string, unknown>, {
      get: (_t, name: string) => (...args: unknown[]) => {
        calls.push(`${name}(${args.join(",")})`);
        return builder;
      },
    });
    passportQuery(builder as never, "abc");
    expect(calls).toEqual([
      "gte(age,18)",
      "disclose(nationality)",
      "disclose(firstname)",
      "disclose(lastname)",
      "disclose(birthdate)",
      "disclose(document_type)",
      "facematch(strict)",
      "bind(custom_data,abc)",
    ]);
  });
});

describe("config", () => {
  it("needs the pseudonym secret, takes the domain from the site's address, and refuses mock passports on mainnet", () => {
    expect(zkPassportConfigFromEnv({})).toBeNull();
    expect(zkPassportConfigFromEnv({ BOREAL_PSEUDONYM_SECRET: SECRET })).toMatchObject({ domain: "boreal.work", devMode: false, verifierMode: "local" });
    expect(zkPassportConfigFromEnv({ BOREAL_PSEUDONYM_SECRET: SECRET, PUBLIC_URL: "https://testnet.boreal.work", ZKPASSPORT_DEV_MODE: "1" })).toMatchObject({
      domain: "testnet.boreal.work",
      devMode: true,
    });
    expect(zkPassportConfigFromEnv({ BOREAL_PSEUDONYM_SECRET: SECRET, BOREAL_NETWORK: "mainnet", ZKPASSPORT_DEV_MODE: "1" })?.devMode).toBe(false);
  });
});
