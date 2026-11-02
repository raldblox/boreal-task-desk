import { type Database, eq, inArray, marketJobs } from "@boreal/db";

import type { MarketJob, MarketJobStore } from "./bridge";

export function dbMarketJobStore(db: Database, now: () => Date = () => new Date()): MarketJobStore {
  const toJob = (row: typeof marketJobs.$inferSelect): MarketJob => ({
    assignmentId: row.assignmentId,
    taskId: row.taskId,
    state: row.state,
    fundingSent: row.fundingSent ?? null,
    note: row.note,
  });
  return {
    async create(assignmentId) {
      const at = now();
      const rows = await db
        .insert(marketJobs)
        .values({ assignmentId, createdAt: at, updatedAt: at })
        .onConflictDoNothing({ target: marketJobs.assignmentId })
        .returning({ id: marketJobs.assignmentId });
      return rows.length === 1;
    },
    async get(assignmentId) {
      const [row] = await db.select().from(marketJobs).where(eq(marketJobs.assignmentId, assignmentId));
      return row ? toJob(row) : null;
    },
    async byTask(taskId) {
      const [row] = await db.select().from(marketJobs).where(eq(marketJobs.taskId, taskId));
      return row ? toJob(row) : null;
    },
    async update(assignmentId, patch) {
      const updated = await db
        .update(marketJobs)
        .set({ ...patch, updatedAt: now() })
        .where(eq(marketJobs.assignmentId, assignmentId))
        .returning({ id: marketJobs.assignmentId });
      if (updated.length !== 1) throw new Error(`no market job ${assignmentId}`);
    },
    async open() {
      const rows = await db.select().from(marketJobs).where(inArray(marketJobs.state, ["posted", "started"]));
      return rows.map(toJob);
    },
  };
}
