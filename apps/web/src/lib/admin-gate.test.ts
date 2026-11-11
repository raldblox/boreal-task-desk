import { describe, expect, it, vi } from "vitest";

import { adminGate, isAdminRequest } from "./admin-gate";
import { signPasskeySession } from "./admin-passkey";
import { readWorkerCookie, signWorkerCookie } from "./worker-cookie";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000_000;
const WORKER = "3ecf9e8c-fa8a-4a37-885f-7f2053a3cfe5";
const env = { SESSION_SECRET: SECRET, ADMIN_PSEUDONYMS: "ccdid:admin" };
const cookie = signWorkerCookie(WORKER, NOW + 60_000, SECRET);
const admin = async () => ({ ref: "ccdid:admin" });

describe("worker cookie", () => {
  it("reads a valid cookie and refuses tampered, expired or malformed ones", () => {
    expect(readWorkerCookie(cookie, SECRET, NOW)).toBe(WORKER);
    expect(readWorkerCookie(cookie, SECRET, NOW + 60_000)).toBeNull();
    expect(readWorkerCookie(cookie, "t".repeat(40), NOW)).toBeNull();
    expect(readWorkerCookie(cookie, null, NOW)).toBeNull();
    const [body, signature] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ workerId: "someone-else", exp: NOW + 60_000 })).toString("base64url");
    expect(readWorkerCookie(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(readWorkerCookie(`${body}.${signature}.x`, SECRET, NOW)).toBeNull();
    expect(readWorkerCookie("garbage", SECRET, NOW)).toBeNull();
    expect(readWorkerCookie(undefined, SECRET, NOW)).toBeNull();
  });
});

describe("admin gate", () => {
  it("lets an allowlisted worker with a valid session through", async () => {
    const lookup = vi.fn(admin);
    expect(await isAdminRequest(cookie, env, lookup, NOW)).toBe(true);
    expect(lookup).toHaveBeenCalledWith(WORKER, "ccdid:admin");
  });

  it("turns everyone else away, asking the database only for a valid session", async () => {
    const lookup = vi.fn(admin);
    expect(await isAdminRequest(undefined, env, lookup, NOW)).toBe(false);
    expect(await isAdminRequest("forged.cookie", env, lookup, NOW)).toBe(false);
    expect(await isAdminRequest(cookie, env, lookup, NOW + 120_000)).toBe(false);
    expect(await isAdminRequest(cookie, { ...env, ADMIN_PSEUDONYMS: "" }, lookup, NOW)).toBe(false);
    expect(await isAdminRequest(cookie, { ADMIN_PSEUDONYMS: "ccdid:admin" }, lookup, NOW)).toBe(false);
    expect(await isAdminRequest(cookie, { ...env, SESSION_SECRET: "short" }, lookup, NOW)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();

    expect(await isAdminRequest(cookie, env, async () => null, NOW)).toBe(false);
  });

  it("fails closed when the lookup throws", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await isAdminRequest(cookie, env, async () => Promise.reject(new Error("db down")), NOW)).toBe(false);
    quiet.mockRestore();
  });
});

describe("admin gate with the passkey step", () => {
  const cookies = (passkey?: string) => ({ session: cookie, passkey });
  const none = async () => 0;
  const one = async () => 1;

  it("lets an admin in without a passkey only where none is required and none is registered", async () => {
    expect(await adminGate(cookies(), { ...env, BOREAL_NETWORK: "testnet" }, admin, none, NOW)).toBe("ok");
    expect(await adminGate(cookies(), { ...env, BOREAL_NETWORK: "mainnet" }, admin, none, NOW)).toBe("passkey");
    expect(await adminGate(cookies(), { ...env, BOREAL_NETWORK: "testnet" }, admin, one, NOW)).toBe("passkey");
  });

  it("opens for a valid passkey session of that admin, and for nothing else", async () => {
    const mainnet = { ...env, BOREAL_NETWORK: "mainnet" };
    expect(await adminGate(cookies(signPasskeySession("ccdid:admin", NOW + 1000, SECRET)), mainnet, admin, one, NOW)).toBe("ok");
    expect(await adminGate(cookies(signPasskeySession("ccdid:other", NOW + 1000, SECRET)), mainnet, admin, one, NOW)).toBe("passkey");
    expect(await adminGate(cookies(signPasskeySession("ccdid:admin", NOW - 1, SECRET)), mainnet, admin, one, NOW)).toBe("passkey");
    // A worker session cookie is not a passkey session.
    expect(await adminGate(cookies(cookie), mainnet, admin, one, NOW)).toBe("passkey");
  });

  it("never reaches the passkey step for someone who isn't an admin, and fails closed", async () => {
    expect(await adminGate(cookies(), env, async () => null, one, NOW)).toBe("no");
    expect(await adminGate({ session: undefined, passkey: signPasskeySession("ccdid:admin", NOW + 1000, SECRET) }, env, admin, one, NOW)).toBe("no");
    const broken = async () => {
      throw new Error("db down");
    };
    expect(await adminGate(cookies(), { ...env, BOREAL_NETWORK: "testnet" }, admin, broken, NOW)).toBe("passkey");
  });
});
