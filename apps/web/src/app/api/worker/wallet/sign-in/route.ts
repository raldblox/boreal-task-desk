import { BadgeError, verifyAccountSignature } from "@boreal/concordium";
import { DeskError } from "@boreal/desk";

import { NETWORK } from "@/content/agent-guide";
import { holdPendingWallet, takeChallenge, walletRef } from "@/server/concordium-wallet";
import { getDesk } from "@/server/desk";
import { startWorkerSession } from "@/server/session";

// Wallet sign-in, step 2: check the wallet account signed this browser's challenge, then sign
// in its worker, creating one for a new wallet: no proof, nothing on-chain, no CCD. When linking
// to a signed-in account, hold the wallet for the identity proof that follows instead.
export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { account?: unknown; signature?: unknown; link?: unknown } | null;
  const message = await takeChallenge();
  if (!message) return Response.json({ error: "expired", message: "The sign-in took too long. Try again." }, { status: 400 });
  if (typeof body?.account !== "string" || !body.signature || typeof body.signature !== "object") {
    return Response.json({ error: "invalid", message: "missing signature" }, { status: 400 });
  }

  const ref = walletRef(body.account);
  if (!ref) return Response.json({ error: "unavailable", message: "Concordium ID sign-in isn't set up yet" }, { status: 503 });

  try {
    const valid = await verifyAccountSignature(NETWORK, body.account, message, body.signature as never);
    if (!valid) return Response.json({ error: "signature", message: "The wallet's signature didn't match. Try again." }, { status: 403 });
    // Signing in: the signature alone is enough, and a new wallet gets its own account (free).
    // Linking to an account keeps the identity proof that follows, which adds the badge.
    const worker = body.link === true ? null : await getDesk().signInWithWallet(ref, { create: true });
    if (worker) {
      await startWorkerSession(worker.id);
      return Response.json({ signedIn: true });
    }
    await holdPendingWallet(ref);
    return Response.json({ signedIn: false });
  } catch (error) {
    if (error instanceof BadgeError) {
      return Response.json(
        { error: "account", message: `${error.message}. Switch the wallet to Concordium ${NETWORK} and try again.` },
        { status: 400 },
      );
    }
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
    console.error("[wallet] sign-in failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "chain", message: "Couldn't reach Concordium. Try again." }, { status: 502 });
  }
}
