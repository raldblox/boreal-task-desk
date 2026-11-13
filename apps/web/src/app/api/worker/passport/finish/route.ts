import { DeskError } from "@boreal/desk";
import { ZkPassportError } from "@boreal/zkpassport";

import { addonRefusal } from "@/server/addons";
import { getDesk } from "@/server/desk";
import { startWorkerSession, workerFromSession } from "@/server/session";
import { getPassportVerifier, isPassportPending } from "@/server/zkpassport";

// Step 2 of ZKPassport: check the phone's proofs on this server against the question bound to
// the nonce, then sign the worker in, or (with `link`) add the passport to the signed-in worker.
// The proofs are checked here, never trusted from the browser.
export const maxDuration = 120;

export async function POST(request: Request) {
  const off = addonRefusal("zkpassport", "passport");
  if (off) return off;
  const verifier = getPassportVerifier();
  if (!verifier) return Response.json({ error: "unavailable", message: "ZKPassport isn't set up here yet" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { id?: unknown; proofs?: unknown; result?: unknown; link?: unknown } | null;
  if (typeof body?.id !== "string" || !Array.isArray(body.proofs) || !body.result) {
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
    if (!isPassportPending(pending.request)) {
      return Response.json({ error: "invalid", message: "that request isn't a ZKPassport request; start again" }, { status: 400 });
    }
    const identity = await verifier.verify(pending.request.nonce, body.proofs, body.result);
    if (worker) {
      const kept = await desk.linkPassport(worker, identity);
      // An empty account folded into the one holding this passport: continue as that account.
      if (worker.role === "worker" && kept.id !== worker.workerId) await startWorkerSession(kept.id);
    } else {
      await startWorkerSession((await desk.signInWithPassport(identity)).id);
    }
    return Response.json({ ok: true, attributes: identity.provenAttributes });
  } catch (error) {
    if (error instanceof ZkPassportError) {
      console.warn(`[zkpassport] proof rejected: ${error.message}`);
      return Response.json({ error: "proof", message: error.message }, { status: 403 });
    }
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: 409 });
    console.error("[zkpassport] finish failed", error);
    return Response.json({ error: "failed", message: "Couldn't check the proof right now. Try again." }, { status: 502 });
  }
}
