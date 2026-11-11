import { describe, expect, it } from "vitest";

import { hasPasskeySession, mayEnrollFirst, passkeyRequired, readChallenge, signChallenge, signPasskeySession } from "./admin-passkey";

const KEY = "k".repeat(40);
const NOW = 1_800_000_000_000;

describe("when /admin needs a passkey", () => {
  it("always on mainnet, when required by setting, and for anyone who registered one", () => {
    expect(passkeyRequired({ BOREAL_NETWORK: "mainnet" }, 0)).toBe(true);
    expect(passkeyRequired({ BOREAL_NETWORK: "testnet", ADMIN_PASSKEY: "required" }, 0)).toBe(true);
    expect(passkeyRequired({ BOREAL_NETWORK: "testnet" }, 1)).toBe(true);
    expect(passkeyRequired({ BOREAL_NETWORK: "testnet" }, 0)).toBe(false);
    expect(passkeyRequired({}, 0)).toBe(false);
  });

  it("takes the enrolment code for a first passkey wherever one is required", () => {
    const code = "enrol-me-0123456789";
    expect(mayEnrollFirst({ BOREAL_NETWORK: "mainnet", ADMIN_PASSKEY_ENROLL_CODE: code }, code)).toBe(true);
    expect(mayEnrollFirst({ BOREAL_NETWORK: "mainnet", ADMIN_PASSKEY_ENROLL_CODE: code }, "enrol-me-012345678X")).toBe(false);
    // Required but no code configured (or one too short to trust): nobody can enrol a first key.
    expect(mayEnrollFirst({ BOREAL_NETWORK: "mainnet" }, "")).toBe(false);
    expect(mayEnrollFirst({ BOREAL_NETWORK: "mainnet", ADMIN_PASSKEY_ENROLL_CODE: "short" }, "short")).toBe(false);
    // Where it's optional, an admin may register their first key without a code.
    expect(mayEnrollFirst({ BOREAL_NETWORK: "testnet" }, "")).toBe(true);
  });
});

describe("the passkey session cookie", () => {
  it("is good only for the admin it names, unexpired and untampered", () => {
    const cookie = signPasskeySession("admin-1", NOW + 1000, KEY);
    expect(hasPasskeySession(cookie, "admin-1", KEY, NOW)).toBe(true);
    expect(hasPasskeySession(cookie, "admin-2", KEY, NOW)).toBe(false);
    expect(hasPasskeySession(cookie, "admin-1", KEY, NOW + 2000)).toBe(false);
    expect(hasPasskeySession(cookie, "admin-1", "x".repeat(40), NOW)).toBe(false);
    expect(hasPasskeySession(`${cookie}x`, "admin-1", KEY, NOW)).toBe(false);
    expect(hasPasskeySession(undefined, "admin-1", KEY, NOW)).toBe(false);
    expect(hasPasskeySession(cookie, "admin-1", null, NOW)).toBe(false);
  });

  it("can't be forged from a challenge cookie, or the other way round", () => {
    const challenge = signChallenge({ ref: "admin-1", kind: "authenticate", challenge: "abc" }, NOW + 1000, KEY);
    expect(hasPasskeySession(challenge, "admin-1", KEY, NOW)).toBe(false);
    expect(readChallenge(signPasskeySession("admin-1", NOW + 1000, KEY), "admin-1", "authenticate", KEY, NOW)).toBeNull();
  });
});

describe("the challenge cookie", () => {
  it("is bound to the admin and to the ceremony it was made for", () => {
    const cookie = signChallenge({ ref: "admin-1", kind: "register", challenge: "abc" }, NOW + 1000, KEY);
    expect(readChallenge(cookie, "admin-1", "register", KEY, NOW)).toBe("abc");
    expect(readChallenge(cookie, "admin-1", "authenticate", KEY, NOW)).toBeNull();
    expect(readChallenge(cookie, "admin-2", "register", KEY, NOW)).toBeNull();
    expect(readChallenge(cookie, "admin-1", "register", KEY, NOW + 2000)).toBeNull();
  });
});
