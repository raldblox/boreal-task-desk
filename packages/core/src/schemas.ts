import { z } from "zod";

import { POLICY } from "./policy";

// Input shapes shared by REST, MCP and A2A, so every surface validates the same way.

export const workerAttribute = z.enum(["age_over_18", "residency", "unique_person"]);

export const postTaskInput = z.object({
  description: z.string().min(20).max(4_000),
  acceptanceCriteria: z.array(z.string().min(5).max(500)).min(1).max(10),
  requiredAttributes: z
    .array(z.object({ attribute: workerAttribute, value: z.string().max(64).optional() }))
    .max(5)
    .default([]),
  resultFormat: z.enum(["text", "photo", "file"]),
  budget: z.number().int().positive().max(POLICY.maxTaskBudget),
  deadline: z.iso.datetime(),
});

export type PostTaskInput = z.infer<typeof postTaskInput>;

export const disputeInput = z.object({
  taskId: z.uuid(),
  reason: z.string().min(10).max(2_000),
});

export type DisputeInput = z.infer<typeof disputeInput>;
