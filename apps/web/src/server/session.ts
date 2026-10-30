import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Caller } from "@boreal/desk";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Worker sessions: an HMAC-signed cookie holding only the worker's internal id. Workers are
// known by pseudonym, so there is no personal data to protect in it.

const COOKIE = "boreal_worker";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string | null {
  const value = process.env.SESSION_SECRET;
  return value && value.length >= 32 ? value : null;
}

const sign = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

export async function startWorkerSession(workerId: string): Promise<void> {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  const body = Buffer.from(JSON.stringify({ workerId, exp: Date.now() + TTL_MS })).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function workerFromSession(): Promise<Caller | null> {
  await connection(); // the expiry check reads the clock, so this is request-time only
  const key = secret();
  const value = (await cookies()).get(COOKIE)?.value;
  if (!key || !value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const { workerId, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as { workerId: string; exp: number };
  return exp > Date.now() ? { role: "worker", workerId } : null;
}

export async function endWorkerSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
