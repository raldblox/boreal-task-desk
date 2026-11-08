import "server-only";

import { createHash } from "node:crypto";

import { createIdAppVerifier, idAppConfigFromEnv, type IdAppVerifier } from "@boreal/concordium";

import { gatedEnv } from "./addons";

let verifier: IdAppVerifier | null | undefined;

/** The Concordium ID App verifier, or null until its anchor account and the Reown project ID are set. */
export function getIdAppVerifier(): IdAppVerifier | null {
  if (verifier === undefined) {
    const config = idAppConfigFromEnv(gatedEnv());
    verifier = config && gatedEnv().NEXT_PUBLIC_REOWN_PROJECT_ID ? createIdAppVerifier(config) : null;
  }
  return verifier;
}

/** A salted hash of the caller's IP, for rate limiting without storing the IP. */
export function clientHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${ip}`).digest("hex");
}
