import { DeskError } from "@boreal/desk";

import { getDesk } from "@/server/desk";
import { clientHash, getIdAppVerifier } from "@/server/id-app";

// Step 1 of Concordium ID sign-in: once the ID App has paired over WalletConnect, build and
// anchor the proof request for that session. The browser forwards it to the app.
export const maxDuration = 60;

export async function POST(request: Request) {
  const verifier = getIdAppVerifier();
  if (!verifier) {
    return Response.json({ error: "unavailable", message: "Concordium ID sign-in isn't set up yet" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { connectionId?: unknown } | null;
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  if (!/^[A-Za-z0-9]{16,128}$/.test(connectionId)) {
    return Response.json({ error: "invalid", message: "missing WalletConnect session" }, { status: 400 });
  }

  const desk = getDesk();
  const client = clientHash(request);
  try {
    await desk.checkVerificationAllowed(client);
    const { request: proofRequest } = await verifier.start(connectionId);
    const id = await desk.saveVerificationRequest(connectionId, proofRequest, client);
    return Response.json({ id, request: proofRequest });
  } catch (error) {
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 429 });
    console.error("[id-app] start failed", error);
    return Response.json({ error: "chain", message: "Couldn't reach Concordium. Try again." }, { status: 502 });
  }
}
