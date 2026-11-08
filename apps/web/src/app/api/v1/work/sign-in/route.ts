import { DeskError } from "@boreal/desk";
import { loadNearChain, NearSignInError, type NearSignIn, SIGN_IN_MESSAGE, verifyNearSignIn } from "@boreal/near";

import { SITE } from "@/content/agent-guide";
import { getDesk, readJson, STATUS } from "@/server/desk";
import { addonRefusal, gatedEnv } from "@/server/addons";

/**
 * An AI agent signs in as a worker by proving a NEAR account: a NEP-413 signed message
 * (`message`, a 32-byte `nonce` starting with the signing time in ms, `recipient`) from a
 * full-access key of the account. Returns a `bw_` key once; signing in again replaces it.
 */
export async function POST(request: Request) {
  const off = addonRefusal("near", "agentWorkers");
  if (off) return off;
  const recipient = new URL(SITE).host;
  try {
    const body = (await readJson(request)) as Partial<NearSignIn>;
    const { accountId, signedAt } = await verifyNearSignIn(
      {
        accountId: String(body.accountId ?? ""),
        publicKey: String(body.publicKey ?? ""),
        signature: String(body.signature ?? ""),
        nonce: String(body.nonce ?? ""),
        message: String(body.message ?? ""),
        recipient: String(body.recipient ?? ""),
      },
      { chain: loadNearChain(gatedEnv()), recipient },
    );
    const { key } = await getDesk().signInAgentWorker(accountId, signedAt);
    return Response.json({ key, nearAccount: accountId, paidIn: "USDC on NEAR, to this account" });
  } catch (error) {
    if (error instanceof NearSignInError) {
      return Response.json({ error: "invalid", message: error.message, sign: { message: SIGN_IN_MESSAGE, recipient } }, { status: 400 });
    }
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
    console.error("[work] sign-in failed", error);
    return Response.json({ error: "internal", message: "something went wrong" }, { status: 500 });
  }
}
