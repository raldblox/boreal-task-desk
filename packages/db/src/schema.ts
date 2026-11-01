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
export const outboxKind = pgEnum("outbox_kind", [
  "anchor",
  "payout",
  "refund",
  "webhook",
  // Holds (PayPal authorizations): take some or all of the money, or give it all back.
  "capture",
  "release",
  // A payment provider's report on a transfer (a PayPal webhook), applied to the ledger.
  "reconcile",
]);
export const reviewMode = pgEnum("review_mode", ["boreal", "requester"]);
export const paymentRail = pgEnum("payment_rail", ["concordium", "paypal"]);
export const agentLinkStatus = pgEnum("agent_link_status", ["pending", "approved", "denied", "collected"]);

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
  /** Allowlisted for test runs: its tasks use test money and only test workers see them. */
  testMode: boolean("test_mode").notNull().default(false),
  /** Set once the owner proved they control the agent's Agent Registry entry (registryId is then its badge). */
  badgeVerifiedAt: timestamp("badge_verified_at", { withTimezone: true }),
  /** The registry network the badge lives on: testnet or mainnet. */
  badgeNetwork: text("badge_network"),
  /** The Concordium account that owns the registry entry, as proven by the owner's signature. */
  ownerAccount: text("owner_account"),
  /**
   * A payment method the owner saved for this agent (a PayPal vault id), so later tasks are
   * funded without an approval page. Only boreal's own spending limits gate it.
   */
  paymentVaultId: text("payment_vault_id"),
  ...timestamps,
});

/**
 * An agent asking to be linked to an owner. The agent holds a secret poll token; the owner
 * approves the short code on boreal.work, and the agent collects its key once.
 */
export const agentLinks = pgTable(
  "agent_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** What the owner types or opens, like K7QM-2XPA. */
    code: text("code").notNull().unique(),
    /** SHA-256 of the agent's poll token. */
    pollTokenHash: text("poll_token_hash").notNull().unique(),
    agentName: text("agent_name").notNull(),
    agentDescription: text("agent_description"),
    status: agentLinkStatus("status").notNull().default("pending"),
    ownerId: uuid("owner_id").references(() => owners.id),
    agentId: uuid("agent_id").references(() => agents.id),
    /** SHA-256 of the requester's IP, for rate limiting; never the IP itself. */
    clientHash: text("client_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("agent_links_client_idx").on(t.clientHash, t.createdAt)],
);

/**
 * Workers are known only by a pseudonym and the attributes they proved. A worker signs in with
 * PayPal and/or Concordium ID; each identity is a keyed hash, and each belongs to one worker.
 */
export const workers = pgTable("workers", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The worker's ID: the hash of whichever identity they first signed in with. Never changes. */
  pseudonym: text("pseudonym").notNull().unique(),
  /** Proven by Concordium ID (age, residency, …); empty until the worker adds Concordium ID. */
  provenAttributes: jsonb("proven_attributes").$type<Record<string, string>>().notNull(),
  /** Concordium ID identity (`ccdid:<hmac>`): set means the Verified by Concordium badge. */
  concordiumRef: text("concordium_ref").unique(),
  /** PayPal identity: `pp:<hmac>` of the PayPal payer_id, which is never stored itself. */
  paypalRef: text("paypal_ref").unique(),
  /** PayPal's `verified_account` claim, from the worker's latest Log in with PayPal. */
  paypalVerified: boolean("paypal_verified").notNull().default(false),
  maxActiveClaims: integer("max_active_claims").notNull().default(1),
  /** Concordium account that payouts go to. */
  payoutAddress: text("payout_address"),
  /** PayPal email for payouts on the PayPal rail; never on-chain, never shown to agents. */
  paypalEmail: text("paypal_email"),
  /** Signed in with a test invite; sees and claims only test tasks. */
  testMode: boolean("test_mode").notNull().default(false),
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
    /** On rails that hold funds (a PayPal authorization id): captured or released once the task is final. */
    fundingHold: text("funding_hold"),
    /** The rail the task was funded on; its payouts and refunds settle on the same rail. Null for test money. */
    paymentRail: paymentRail("payment_rail"),
    claimedBy: uuid("claimed_by").references(() => workers.id),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    /** Reviewer whose verdict stands; paid the review fee once the task is final. */
    reviewerRef: text("reviewer_ref"),
    verdictAt: timestamp("verdict_at", { withTimezone: true }),
    disputeUsed: boolean("dispute_used").notNull().default(false),
    /** Test task: test money, test workers only, never paid out on-chain. */
    test: boolean("test").notNull().default(false),
    /** Who judges the result: boreal's reviewer, or the requester itself (worker can still dispute). */
    reviewMode: reviewMode("review_mode").notNull().default("boreal"),
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

/** Concordium ID proof requests waiting for the wallet's answer; each can be used once. */
export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: text("connection_id").notNull(),
    request: jsonb("request").notNull(),
    /** SHA-256 of the requester's IP, for rate limiting; never the IP itself. */
    clientHash: text("client_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("verification_requests_client_idx").on(t.clientHash, t.createdAt)],
);

/**
 * Every change an operator makes from the admin area: who (their worker pseudonym), what,
 * on which target, when and why. Append-only, written with the change it records.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminRef: text("admin_ref").notNull(),
    action: text("action").notNull(),
    /** What it acted on, like `task:<id>`, `agent:<id>` or `outbox:<id>`. */
    target: text("target"),
    reason: text("reason").notNull(),
    /** `ok`, or the refusal the desk gave. */
    outcome: text("outcome").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_actions_created_idx").on(t.createdAt)],
);
