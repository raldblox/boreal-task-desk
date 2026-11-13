import { newNonce, type PassportRequestStart, ZKPASSPORT_SCOPE } from "@boreal/zkpassport";
import { DeskError } from "@boreal/desk";

import { addonRefusal } from "@/server/addons";
import { getDesk } from "@/server/desk";
import { clientHash } from "@/server/id-app";
import { getPassportVerifier, type PassportPending } from "@/server/zkpassport";

// Step 1 of ZKPassport: a one-time nonce the phone's proofs must be bound to, so a proof answers
// one sign-in only. Free: nothing goes on any chain.
export async function POST(request: Request) {
  const off = addonRefusal("zkpassport", "passport");
  if (off) return off;
  const verifier = getPassportVerifier();
  if (!verifier) return Response.json({ error: "unavailable", message: "ZKPassport isn't set up here yet" }, { status: 503 });

  const desk = getDesk();
  const client = clientHash(request);
  try {
    await desk.checkVerificationAllowed(client);
    const nonce = newNonce();
    const pending: PassportPending = { kind: "zkpassport", nonce };
    const id = await desk.saveVerificationRequest("zkpassport", pending, client);
    const start: PassportRequestStart = {
      id,
      nonce,
      domain: verifier.config.domain,
      scope: ZKPASSPORT_SCOPE,
      devMode: verifier.config.devMode,
    };
    return Response.json(start);
  } catch (error) {
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 429 });
    console.error("[zkpassport] start failed", error);
    return Response.json({ error: "failed", message: "Couldn't start. Try again." }, { status: 500 });
  }
}
