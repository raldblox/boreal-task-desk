import "server-only";

import type { Caller } from "@boreal/desk";

import { getDesk } from "./desk";
import { workerFromSession } from "./session";

// People post tasks on the website through their own requester: a keyless agent the desk
// makes on their first post (desk `personalRequester`). Their web session then acts as it, so
// every rule an agent meets (screening, escrow, review, limits) applies unchanged.

export type Poster = {
  worker: Extract<Caller, { role: "worker" }>;
  /** Null until they first post (unless `create`). */
  requester: Extract<Caller, { role: "requester" }> | null;
};

/** The signed-in person as a requester, or null when nobody is signed in. Request-time only. */
export async function posterFromSession({ create = false } = {}): Promise<Poster | null> {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return null;
  const desk = getDesk();
  const agent = create ? await desk.personalRequester(worker.workerId) : await desk.findPersonalRequester(worker.workerId);
  return { worker, requester: agent ? { role: "requester", agentId: agent.id } : null };
}
