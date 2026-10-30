import { createHash, randomBytes } from "node:crypto";

import { desc, eq, outbox, taskEvents, type Transaction } from "@boreal/db";

/** JSON with sorted keys, so the same event always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashEvent(input: {
  salt: string;
  prevHash: string | null;
  taskId: string;
  type: string;
  actor: string;
  payload: unknown;
  at: Date;
}): string {
  const body = canonicalJson({
    taskId: input.taskId,
    type: input.type,
    actor: input.actor,
    payload: input.payload,
    at: input.at.toISOString(),
    prevHash: input.prevHash,
  });
  return createHash("sha256").update(`${input.salt}:${body}`).digest("hex");
}

/**
 * Appends an event to the task's hash chain and queues its hash for on-chain anchoring,
 * in the caller's transaction.
 */
export async function appendEvent(
  tx: Transaction,
  event: { taskId: string; type: string; actor: string; payload: unknown; at: Date },
): Promise<{ hash: string }> {
  const [prev] = await tx
    .select({ hash: taskEvents.hash })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, event.taskId))
    .orderBy(desc(taskEvents.id))
    .limit(1);

  const salt = randomBytes(16).toString("hex");
  const prevHash = prev?.hash ?? null;
  const hash = hashEvent({ ...event, salt, prevHash });

  const [row] = await tx
    .insert(taskEvents)
    .values({
      taskId: event.taskId,
      type: event.type,
      actor: event.actor,
      payload: event.payload,
      salt,
      prevHash,
      hash,
      createdAt: event.at,
    })
    .returning({ id: taskEvents.id });

  await tx.insert(outbox).values({
    kind: "anchor",
    payload: { eventId: row!.id, hash },
    nextAttemptAt: event.at,
    createdAt: event.at,
  });
  return { hash };
}
