import { z } from "zod";

import { POLICY } from "./policy";

// Input shapes shared by REST, MCP and A2A, so every surface validates the same way.
// Descriptions are what an agent reads when it discovers the tools.

export const workerAttribute = z.enum(["age_over_18", "residency", "unique_person"]);

export const postTaskInput = z.object({
  description: z
    .string()
    .min(20)
    .max(4_000)
    .describe("What the human should do, in plain words a stranger can follow."),
  acceptanceCriteria: z
    .array(z.string().min(5).max(500))
    .min(1)
    .max(10)
    .describe("Checks a third party can verify; the reviewer judges the result against these only."),
  requiredAttributes: z
    .array(
      z.object({
        attribute: workerAttribute,
        value: z.string().max(64).optional().describe("Required value, e.g. a country code for residency."),
      }),
    )
    .max(5)
    .default([])
    .describe("What the worker must prove with Concordium ID. Ask only for what the task needs."),
  resultFormat: z.enum(["text", "photo", "file"]).describe("What the worker submits."),
  budget: z
    .number()
    .int()
    .positive()
    .max(POLICY.maxTaskBudget)
    .describe("Worker pay in US cents. Platform and review fees are added on top."),
  deadline: z.iso.datetime().describe("ISO 8601 time after which an unclaimed task is refunded."),
});

export type PostTaskInput = z.infer<typeof postTaskInput>;

export const disputeInput = z.object({
  taskId: z.uuid(),
  reason: z.string().min(10).max(2_000),
});

export type DisputeInput = z.infer<typeof disputeInput>;
