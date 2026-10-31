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
  /** SHA-256 of the agent's API key secret; the key itself is shown once and never stored. */
  apiKeyHash: text("api_key_hash"),
  /** Concordium account that refunds go to. */
  refundAddress: text("refund_address"),
  ...timestamps,
});

/** Workers are known only by a pseudonym and the attributes they proved. */
export const workers = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  pseudonym: text("pseudonym").notNull().unique(),
  provenAttributes: jsonb("proven_attributes").$type<Record<string, string>>().notNull(),
  maxActiveClaims: integer("max_active_claims").notNull().default(1),
  /** Concordium account that payouts go to. */
  payoutAddress: text("payout_address"),
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
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    fundingTxHash: text("funding_tx_hash"),
    claimedBy: uuid("claimed_by").references(() => workers.id),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    /** Reviewer whose verdict stands; paid the review fee once the task is final. */
    reviewerRef: text("reviewer_ref"),
    verdictAt: timestamp("verdict_at", { withTimezone: true }),
    disputeUsed: boolean("dispute_used").notNull().default(false),
    /** Set when the AI reviewer can't decide; a human reviewer takes it from there. */
    needsHuman: boolean("needs_human").notNull().default(false),
    humanReason: text("human_reason"),
    /** Failed AI attempts for the current step, and when to try again. */
    aiAttempts: integer("ai_attempts").notNull().default(0),
    aiRetryAt: timestamp("ai_retry_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_agent_idx").on(t.agentId),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id),
    text: text("text"),
    fileUrls: jsonb("file_urls").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submissions_task_idx").on(t.taskId)],
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
    /** Deleting the salt with the record leaves the anchored hash meaningless, as privacy requires. */
    salt: text("salt").notNull(),
    /** Hash of the task's previous event, so the trail can't be reordered or trimmed unnoticed. */
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    /** Set once the outbox has anchored this hash on-chain. */
    anchorTxHash: text("anchor_tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_events_task_idx").on(t.taskId)],
);

/** Every movement of money, written before its on-chain transfer. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: uuid("task_id").references(() => tasks.id),
    idempotencyKey: text("idempotency_key").notNull(),
    fromAccount: ledgerAccount("from_account").notNull(),
    toAccount: ledgerAccount("to_account").notNull(),
    /** Who on the receiving side: an agent, worker or reviewer id. */
    party: text("party"),
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

/** Named leases, so only one monitor tick runs at a time across the worker, cron and the app. */
export const leases = pgTable("leases", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  until: timestamp("until", { withTimezone: true }).notNull(),
});
