import "server-only";

import type { Caller } from "@boreal/desk";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { readWorkerCookie, sessionSecret, signWorkerCookie, WORKER_COOKIE } from "@/lib/worker-cookie";

// Worker sessions: an HMAC-signed cookie holding only the worker's internal id. Workers are
// known by pseudonym, so there is no personal data to protect in it.

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const secret = () => sessionSecret(process.env.SESSION_SECRET);

export async function startWorkerSession(workerId: string): Promise<void> {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  (await cookies()).set(WORKER_COOKIE, signWorkerCookie(workerId, Date.now() + TTL_MS, key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function workerFromSession(): Promise<Caller | null> {
  await connection(); // the expiry check reads the clock, so this is request-time only
  const workerId = readWorkerCookie((await cookies()).get(WORKER_COOKIE)?.value, secret());
  return workerId ? { role: "worker", workerId } : null;
}

export async function endWorkerSession(): Promise<void> {
  (await cookies()).delete(WORKER_COOKIE);
}
