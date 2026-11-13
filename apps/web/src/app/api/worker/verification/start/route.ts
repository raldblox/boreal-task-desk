import { DeskError } from "@boreal/desk";

import { getDesk } from "@/server/desk";
import { clientHash, getIdAppVerifier } from "@/server/id-app";
import { addonRefusal } from "@/server/addons";

// Step 1 of Concordium ID sign-in: once the ID App has paired over WalletConnect, build and
// anchor the proof request for that session. The browser forwards it to the app. With
// `wallet: true` (Concordium Wallet for Web), a Web3 ID request instead: its challenge is a recent
// block's hash, so nothing is anchored and boreal.work pays no fee.
export const maxDuration = 60;

export async function POST(request: Request) {
  const off = addonRefusal("concordium", "id");
  if (off) return off;
  const verifier = getIdAppVerifier();
  if (!verifier) {
    return Response.json({ error: "unavailable", message: "Concordium ID sign-in isn't set up yet" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { connectionId?: unknown; wallet?: unknown } | null;
  const desk = getDesk();
  const client = clientHash(request);

  if (body?.wallet === true) {
    try {
      await desk.checkVerificationAllowed(client);
      const walletRequest = await verifier.startWallet();
      const id = await desk.saveVerificationRequest("wallet", walletRequest, client);
      return Response.json({ id, challenge: walletRequest.challenge, statements: walletRequest.statements });
    } catch (error) {
      if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 429 });
      console.error("[id-app] wallet start failed", error);
      return Response.json({ error: "chain", message: "Couldn't reach Concordium. Try again." }, { status: 502 });
    }
  }

  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  if (!/^[A-Za-z0-9]{16,128}$/.test(connectionId)) {
    return Response.json({ error: "invalid", message: "missing WalletConnect session" }, { status: 400 });
  }

  try {
    await desk.checkVerificationAllowed(client);
    const { request: proofRequest } = await verifier.start(connectionId);
    const id = await desk.saveVerificationRequest(connectionId, proofRequest, client);
    return Response.json({ id, request: proofRequest });
  } catch (error) {
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 429 });
    console.error("[id-app] start failed", error);
    // The anchor account pays a small CCD fee per sign-in; when it runs dry, say so plainly.
    if (error instanceof Error && /enough funds/i.test(error.message)) {
      return Response.json(
        { error: "unfunded", message: "Sign-in is paused: boreal.work's Concordium account needs topping up with CCD. Try again later." },
        { status: 503 },
      );
    }
    return Response.json({ error: "chain", message: "Couldn't reach Concordium. Try again." }, { status: 502 });
  }
}
