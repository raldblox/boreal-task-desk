import { IdAppError } from "@boreal/concordium";
import { DeskError } from "@boreal/desk";

import { takePendingWallet } from "@/server/concordium-wallet";
import { getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { startWorkerSession, workerFromSession } from "@/server/session";
import { addonRefusal } from "@/server/addons";

// Step 2: verify the ID App's proof against the anchored request, then sign the worker in, or
// (with `link`) add this Concordium ID to the signed-in worker: the badge and its attributes.
export const maxDuration = 60;

export async function POST(request: Request) {
  const off = addonRefusal("concordium", "id");
  if (off) return off;
  const verifier = getIdAppVerifier();
  if (!verifier) {
    return Response.json({ error: "unavailable", message: "Concordium ID sign-in isn't set up yet" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    presentation?: unknown;
    link?: unknown;
    wallet?: unknown;
  } | null;
  if (typeof body?.id !== "string" || !body.presentation) {
    return Response.json({ error: "invalid", message: "missing proof" }, { status: 400 });
  }

  const linking = body.link === true;
  const worker = linking ? await workerFromSession() : null;
  if (linking && worker?.role !== "worker") {
    return Response.json({ error: "forbidden", message: "Your session has ended. Sign in again." }, { status: 401 });
  }

  const desk = getDesk();
  try {
    const pending = await desk.takeVerificationRequest(body.id);
    const verified = await verifier.finish(pending.request, body.presentation, pending.id);
    // A Wallet for Web sign-in signed for its account first: remember it for quick sign-in.
    const wallet = body.wallet === true ? ((await takePendingWallet()) ?? undefined) : undefined;
    if (worker) {
      const kept = await desk.linkVerifiedConcordium(worker, verified, wallet);
      // An empty account folded into the one holding this ID: continue as that account.
      if (worker.role === "worker" && kept.id !== worker.workerId) await startWorkerSession(kept.id);
    } else {
      await startWorkerSession((await desk.signInVerifiedWorker(verified, wallet)).id);
    }
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
