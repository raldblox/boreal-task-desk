import { describe, expect, it, vi } from "vitest";

import { isAdminRequest } from "./admin-gate";
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
