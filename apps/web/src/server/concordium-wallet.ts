import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { SITE } from "@/content/agent-guide";

// Quick sign-in with the Concordium Wallet for Web. A worker's first sign-in is a full identity
// proof, which costs boreal an on-chain anchor. The wallet account that answered it is then
// remembered as a keyed hash, and later sign-ins only ask that account to sign a one-time
// challenge: free, and nothing goes on-chain.

const CHALLENGE_COOKIE = "wallet_challenge";
const PENDING_COOKIE = "wallet_pending";
const CHALLENGE_TTL_S = 5 * 60;
const PENDING_TTL_S = 15 * 60;
const COOKIE = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/worker" } as const;

function secret(): string | null {
  const value = process.env.CONCORDIUM_PSEUDONYM_SECRET;
  return value && value.length >= 32 ? value : null;
}

function tag(key: string, value: string): string {
  return createHmac("sha256", key).update(`wallet-cookie:${value}`).digest("hex");
}

/** `cw:` plus a keyed hash of a wallet account address; the address itself is never stored. */
export function walletRef(account: string): string | null {
  const key = secret();
  return key ? `cw:${createHmac("sha256", key).update(`wallet:${account}`).digest("hex")}` : null;
}

const challengeMessage = (code: string) =>
  `Sign in to ${SITE}\n\nOne-time code: ${code}\n\nThis signature only signs you in. It sends no transaction and costs nothing.`;

/** A fresh message for the wallet to sign; its one-time code waits in a short-lived cookie. */
export async function issueChallenge(): Promise<string> {
  const code = randomBytes(16).toString("hex");
  (await cookies()).set(CHALLENGE_COOKIE, code, { ...COOKIE, maxAge: CHALLENGE_TTL_S });
  return challengeMessage(code);
}

/** The message this browser was given to sign, used up as it is read. */
export async function takeChallenge(): Promise<string | null> {
  const jar = await cookies();
  const code = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete({ name: CHALLENGE_COOKIE, path: COOKIE.path });
  return code && /^[0-9a-f]{32}$/.test(code) ? challengeMessage(code) : null;
}

/** Holds a signed-for wallet until the identity proof that follows it lands. */
export async function holdPendingWallet(ref: string): Promise<void> {
  const key = secret();
  if (!key) return;
  const value = `${ref}.${Date.now() + PENDING_TTL_S * 1000}`;
  (await cookies()).set(PENDING_COOKIE, `${value}.${tag(key, value)}`, { ...COOKIE, maxAge: PENDING_TTL_S });
}

/** The wallet held for this proof, if still valid, used up as it is read. */
export async function takePendingWallet(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  jar.delete({ name: PENDING_COOKIE, path: COOKIE.path });
  const key = secret();
  const [ref, expires, mac] = raw.split(".");
  if (!key || !ref || !expires || !mac) return null;
  const expected = Buffer.from(tag(key, `${ref}.${expires}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(expires) > Date.now() ? ref : null;
}
