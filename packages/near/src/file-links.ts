import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, expiring links to a submission file, for a deliverable handed to someone who has no
// boreal key (a NEAR Agent Market buyer). The link names the file; nothing else is readable.

const sig = (secret: string, path: string, expires: number) =>
  createHmac("sha256", secret).update(`${path}\n${expires}`).digest("base64url");

export function signFileLink(secret: string, path: string, expires: Date): { expires: number; sig: string } {
  const at = Math.floor(expires.getTime() / 1000);
  return { expires: at, sig: sig(secret, path, at) };
}

export function verifyFileLink(secret: string, path: string, expires: string | null, signature: string | null, now = new Date()): boolean {
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  const at = Number(expires);
  if (at * 1000 < now.getTime()) return false;
  const want = Buffer.from(sig(secret, path, at));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}
