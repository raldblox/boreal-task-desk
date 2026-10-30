import { TASK_STATUSES } from "@boreal/core";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const taskStatus = pgEnum("task_status", TASK_STATUSES);
export const ownerKind = pgEnum("owner_kind", ["individual", "business"]);
export const agentStatus = pgEnum("agent_status", ["active", "frozen"]);
export const resultFormat = pgEnum("result_format", ["text", "photo", "file"]);
export const ledgerAccount = pgEnum("ledger_account", [
  "requester",
  "escrow",
  "operating",
  "worker",
  "reviewer",
]);
export const ledgerStatus = pgEnum("ledger_status", ["pending", "settled", "failed"]);
export const outboxKind = pgEnum("outbox_kind", ["anchor", "payout", "refund", "webhook"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** The person or company accountable for a requester agent. */
export const owners = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: ownerKind("kind").notNull(),
  /** Concordium ID pseudonym for individuals, LEI for businesses. */
  verifiedRef: text("verified_ref").notNull().unique(),
  ...timestamps,
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  registryId: text("registry_id").notNull().unique(),
  name: text("name").notNull(),
  status: agentStatus("status").notNull().default("active"),
  maxTaskBudget: integer("max_task_budget").notNull(),
  maxDailySpend: integer("max_daily_spend").notNull(),
  ...timestamps,
});

/** Workers are known only by a pseudonym and the attributes they proved. */
export const workers = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  pseudonym: text("pseudonym").notNull().unique(),
  provenAttributes: jsonb("proven_attributes").$type<Record<string, string>>().notNull(),
  maxActiveClaims: integer("max_active_claims").notNull().default(1),
  ...timestamps,
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    status: taskStatus("status").notNull().default("posted"),
    description: text("description").notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull(),
    requiredAttributes: jsonb("required_attributes")
      .$type<{ attribute: string; value?: string }[]>()
      .notNull(),
    resultFormat: resultFormat("result_format").notNull(),
    budget: integer("budget").notNull(),
    platformFee: integer("platform_fee").notNull(),
    reviewFee: integer("review_fee").notNull(),
    rulebookVersion: text("rulebook_version").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    claimedBy: uuid("claimed_by").references(() => workers.id),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    verdictAt: timestamp("verdict_at", { withTimezone: true }),
    disputeUsed: boolean("dispute_used").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_agent_idx").on(t.agentId),
  ],
);

/** Append-only audit trail; each row's hash is anchored on Concordium through the outbox. */
export const taskEvents = pgTable(
  "task_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    payload: jsonb("payload").notNull(),
    /** Salted hash, so off-chain records can be deleted without breaking the trail. */
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_events_task_idx").on(t.taskId)],
);

/** Double-entry ledger: every movement is written before its on-chain transfer. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: uuid("task_id").references(() => tasks.id),
    idempotencyKey: text("idempotency_key").notNull(),
    debit: ledgerAccount("debit").notNull(),
    credit: ledgerAccount("credit").notNull(),
    amount: integer("amount").notNull(),
    status: ledgerStatus("status").notNull().default("pending"),
    txHash: text("tx_hash"),
    ...timestamps,
  },
  (t) => [uniqueIndex("ledger_idempotency_idx").on(t.idempotencyKey)],
);

/** Side effects committed with the state change that caused them, then sent with retries. */
export const outbox = pgTable(
  "outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: outboxKind("kind").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_due_idx").on(t.doneAt, t.nextAttemptAt)],
);
