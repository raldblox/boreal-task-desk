import "server-only";

import { createZkPassportVerifier, zkPassportConfigFromEnv, type ZkPassportVerifier } from "@boreal/zkpassport";

import { gatedEnv, getAddons } from "./addons";

let verifier: ZkPassportVerifier | null | undefined;

/** The ZKPassport verifier, or null while the add-on is off or missing its secret. */
export function getPassportVerifier(): ZkPassportVerifier | null {
  if (verifier === undefined) {
    const config = getAddons().ready("zkpassport", "passport") ? zkPassportConfigFromEnv(gatedEnv()) : null;
    verifier = config ? createZkPassportVerifier(config) : null;
  }
  return verifier;
}

/** Whether people can verify with ZKPassport here, for pages. */
export function passportReady(): boolean {
  return getPassportVerifier() !== null;
}

/** What a stored ZKPassport request holds: the nonce its proofs must be bound to. */
export interface PassportPending {
  kind: "zkpassport";
  nonce: string;
}

export function isPassportPending(request: unknown): request is PassportPending {
  const r = request as Partial<PassportPending> | null;
  return r?.kind === "zkpassport" && typeof r.nonce === "string" && /^[0-9a-f]{32}$/.test(r.nonce);
}
