"use server";

import { DeskError } from "@boreal/desk";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { refresh } from "next/cache";
import { cookies } from "next/headers";

import { SITE } from "@/content/agent-guide";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  mayEnrollFirst,
  PASSKEY_COOKIE,
  PASSKEY_TTL_MS,
  readChallenge,
  signChallenge,
  signPasskeySession,
} from "@/lib/admin-passkey";
import { sessionSecret } from "@/lib/worker-cookie";
import { adminPasskeyState } from "@/server/admin";
import { getDesk } from "@/server/desk";

// The WebAuthn ceremonies for the admin passkey. Every action starts from the signed-in,
// allowlisted admin (anyone else gets "not available", like the 404 on /admin). The challenge
// travels in a signed, short-lived cookie bound to that admin and to the ceremony.

type Failed = { error: string };

const site = () => {
  const url = new URL(SITE);
  return { rpID: url.hostname, origin: url.origin };
};
const secret = () => sessionSecret(process.env.SESSION_SECRET);
const secure = process.env.NODE_ENV === "production";

async function state() {
  const found = await adminPasskeyState();
  const key = secret();
  if (!found || !key) return null;
  return { ...found, key };
}

async function setChallenge(ref: string, kind: "register" | "authenticate", challenge: string, key: string) {
  (await cookies()).set(CHALLENGE_COOKIE, signChallenge({ ref, kind, challenge }, Date.now() + CHALLENGE_TTL_MS, key), {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** Reads the challenge once: it is deleted whatever happens next. */
async function takeChallenge(ref: string, kind: "register" | "authenticate", key: string): Promise<string | null> {
  const jar = await cookies();
  const challenge = readChallenge(jar.get(CHALLENGE_COOKIE)?.value, ref, kind, key);
  jar.delete(CHALLENGE_COOKIE);
  return challenge;
}

async function startSession(ref: string, key: string) {
  (await cookies()).set(PASSKEY_COOKIE, signPasskeySession(ref, Date.now() + PASSKEY_TTL_MS, key), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: PASSKEY_TTL_MS / 1000,
  });
}

/**
 * Starts registering a passkey. A first passkey needs the enrolment code wherever a passkey is
 * required; a further one needs a passkey already presented in this session.
 */
export async function passkeyRegisterOptions(code: string) {
  const s = await state();
  if (!s) return { error: "Not available." } satisfies Failed;
  if (s.registered === 0 ? !mayEnrollFirst(process.env, code) : !s.passed) {
    return { error: s.registered === 0 ? "That enrolment code isn't right, or none is set for this site (ADMIN_PASSKEY_ENROLL_CODE)." : "Use one of your passkeys first." } satisfies Failed;
  }
  const existing = await getDesk().adminPasskeys(s.admin.ref);
  const options = await generateRegistrationOptions({
    rpName: "boreal.work admin",
    rpID: site().rpID,
    userName: `admin ${s.admin.ref.slice(0, 16)}`,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports ?? undefined })) as never,
    // A plain security key works: no need for it to store the credential or to have a PIN.
    authenticatorSelection: { residentKey: "discouraged", userVerification: "preferred" },
    preferredAuthenticatorType: "securityKey",
  });
  await setChallenge(s.admin.ref, "register", options.challenge, s.key);
  return { options };
}

export async function passkeyRegisterFinish(response: RegistrationResponseJSON, label: string, code: string) {
  const s = await state();
  if (!s) return { error: "Not available." } satisfies Failed;
  if (s.registered === 0 ? !mayEnrollFirst(process.env, code) : !s.passed) return { error: "Not allowed." } satisfies Failed;
  const challenge = await takeChallenge(s.admin.ref, "register", s.key);
  if (!challenge) return { error: "That took too long. Start again." } satisfies Failed;
  try {
    const { rpID, origin } = site();
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
    if (!result.verified) return { error: "The key's answer didn't check out. Try again." } satisfies Failed;
    const { credential } = result.registrationInfo;
    await getDesk().addAdminPasskey(s.admin, {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports,
      label,
    });
    // Registering it proves they hold it: this session has passed the check.
    await startSession(s.admin.ref, s.key);
    refresh();
    return { ok: true as const };
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message } satisfies Failed;
    console.error("[admin passkey] registration failed", error);
    return { error: "The key's answer didn't check out. Try again." } satisfies Failed;
  }
}

/** Starts the check: a challenge only this admin's registered keys can answer. */
export async function passkeyAuthOptions() {
  const s = await state();
  if (!s) return { error: "Not available." } satisfies Failed;
  const mine = await getDesk().adminPasskeys(s.admin.ref);
  if (mine.length === 0) return { error: "You have no passkey yet. Register one first." } satisfies Failed;
  const options = await generateAuthenticationOptions({
    rpID: site().rpID,
    allowCredentials: mine.map((p) => ({ id: p.credentialId, transports: p.transports ?? undefined })) as never,
    userVerification: "preferred",
  });
  await setChallenge(s.admin.ref, "authenticate", options.challenge, s.key);
  return { options };
}

export async function passkeyAuthFinish(response: AuthenticationResponseJSON) {
  const s = await state();
  if (!s) return { error: "Not available." } satisfies Failed;
  const challenge = await takeChallenge(s.admin.ref, "authenticate", s.key);
  if (!challenge) return { error: "That took too long. Start again." } satisfies Failed;
  const desk = getDesk();
  const passkey = (await desk.adminPasskeys(s.admin.ref)).find((p) => p.credentialId === response.id);
  if (!passkey) return { error: "That key isn't one of yours." } satisfies Failed;
  try {
    const { rpID, origin } = site();
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: passkey.credentialId, publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")), counter: passkey.counter, transports: (passkey.transports ?? undefined) as never },
      requireUserVerification: false,
    });
    if (!result.verified) return { error: "The key's answer didn't check out. Try again." } satisfies Failed;
    await desk.useAdminPasskey(s.admin.ref, passkey.credentialId, result.authenticationInfo.newCounter);
    await startSession(s.admin.ref, s.key);
    refresh();
    return { ok: true as const };
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message } satisfies Failed;
    console.error("[admin passkey] check failed", error);
    return { error: "The key's answer didn't check out. Try again." } satisfies Failed;
  }
}

/** Removes one of the admin's own passkeys (never the last), once they have passed the check. */
export async function passkeyRemove(passkeyId: string, reason: string) {
  const s = await state();
  if (!s || !s.passed) return { error: "Use one of your passkeys first." } satisfies Failed;
  try {
    await getDesk().removeAdminPasskey(s.admin, passkeyId, reason);
    refresh();
    return { ok: true as const };
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message } satisfies Failed;
    throw error;
  }
}
