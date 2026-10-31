import { IdAppError } from "@boreal/concordium";
import { DeskError } from "@boreal/desk";

import { getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { startWorkerSession } from "@/server/session";

// Step 2: verify the ID App's proof against the anchored request and sign the worker in.
export const maxDuration = 60;

export async function POST(request: Request) {
  const verifier = getIdAppVerifier();
  if (!verifier) {
    return Response.json({ error: "unavailable", message: "Concordium ID sign-in isn't set up yet" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { id?: unknown; presentation?: unknown } | null;
  if (typeof body?.id !== "string" || !body.presentation) {
    return Response.json({ error: "invalid", message: "missing proof" }, { status: 400 });
  }

  const desk = getDesk();
  try {
    const pending = await desk.takeVerificationRequest(body.id);
    const verified = await verifier.finish(pending.request, body.presentation, pending.id);
    const worker = await desk.signInVerifiedWorker(verified);
    await startWorkerSession(worker.id);
    return Response.json({ ok: true, attributes: verified.provenAttributes });
  } catch (error) {
    if (error instanceof IdAppError) {
      console.warn(`[id-app] proof rejected: ${error.message}`);
      return Response.json({ error: "proof", message: error.message }, { status: 403 });
    }
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 409 });
    console.error("[id-app] finish failed", error);
    return Response.json({ error: "chain", message: "Couldn't verify the proof right now. Try again." }, { status: 502 });
  }
}
