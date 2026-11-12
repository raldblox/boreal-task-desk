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
export const paymentRail = pgEnum("payment_rail", ["concordium", "paypal", "near", "evm"]);
export const marketJobState = pgEnum("market_job_state", ["posted", "started", "delivered", "closed"]);
/**
 * Who a requester is: an AI agent acting for its owner, a person posting on the website
 * themselves (their own requester, made on their first post), or a NEAR Agent Market buyer.
 */
export const agentKind = pgEnum("agent_kind", ["agent", "personal", "market"]);
/** Who may do a task: verified people only (the default), or AI agents too. */
export const fulfillers = pgEnum("fulfillers", ["people", "people_or_agents"]);
/** A worker is a person (proves who they are) or an AI agent (proves a NEAR account). */
export const workerKind = pgEnum("worker_kind", ["person", "agent"]);
/** Chains a worker can set up a self-held payout account on through boreal. */
export const walletChain = pgEnum("wallet_chain", ["near", "concordium"]);
/**
 * How an agent may use the payment method its owner saved. `ask`: the owner approves each
 * payment (or batch) before any money is held. `auto`: the agent pays on its own, within its limits.
 */
export const spendingMode = pgEnum("spending_mode", ["ask", "auto"]);
export const fundingApprovalStatus = pgEnum("funding_approval_status", ["pending", "approved", "declined", "used"]);
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
  /** The agent's own NEAR account, which it pays tasks from and its owner funds. */
  nearAccount: text("near_account"),
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
  /** Whether the saved payment method is charged only after the owner approves each payment. */
  spendingMode: spendingMode("spending_mode").notNull().default("auto"),
  /** Set while the owner has paused the agent: it can read, but not post, fund, accept or review. */
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  /**
   * `personal` is a person's own requester: made the first time they post on the website, owned
   * by them, named after their pseudonym. It never gets a key and isn't listed among their agents.
   */
  kind: agentKind("kind").notNull().default("agent"),
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
    /** The NEAR account the agent says it pays from, shown to its owner to fund. */
    nearAccount: text("near_account"),
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
  /**
   * `cw:` plus a keyed hash of the Concordium wallet account that answered the worker's
   * latest identity proof. Signing a message with that account signs them in again without a
   * new proof (and its on-chain anchor). Never the account address itself.
   */
  concordiumWalletRef: text("concordium_wallet_ref").unique(),
  maxActiveClaims: integer("max_active_claims").notNull().default(1),
  /** Concordium account that payouts go to. */
  payoutAddress: text("payout_address"),
  /** PayPal email for payouts on the PayPal rail; never on-chain, never shown to agents. */
  paypalEmail: text("paypal_email"),
  /** NEAR account that payouts go to on the NEAR rail. */
  nearAccount: text("near_account"),
  /** EVM address (0x…, checksummed) that payouts go to on the EVM rail. */
  evmAddress: text("evm_address"),
  kind: workerKind("kind").notNull().default("person"),
  /** Agent workers only: hash of their `bw_` API key's secret. */
  apiKeyHash: text("api_key_hash"),
  /** Agent workers only: when the key was last issued; an older sign-in signature can't issue another. */
  apiKeyIssuedAt: timestamp("api_key_issued_at", { withTimezone: true }),
  /** Signed in with a test invite; sees and claims only test tasks. */
  testMode: boolean("test_mode").notNull().default(false),
  /**
   * Set when the person closed their account: every identity, email and payout address is gone,
   * and the pseudonym became `closed:<id>`, so signing in again starts a new, empty account.
   */
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps,
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    status: taskStatus("status").notNull().default("awaiting_funding"),
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
    /**
     * On rails that settle at once (NEAR, Concordium): the account the funding came from, which
     * a refund goes back to. Null on PayPal, where the hold itself is released.
     */
    fundingPayer: text("funding_payer"),
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
    fulfillers: fulfillers("fulfillers").notNull().default("people"),
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
    /** When the result's files were deleted (90 days after the task was final); `fileUrls` is then empty. */
    filesDeletedAt: timestamp("files_deleted_at", { withTimezone: true }),
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

/**
 * Hires of boreal's listing on NEAR Agent Market, each turned into a boreal task posted by
 * boreal's market agent. The treasury's funding transfer is journaled here before it is sent.
 */
export const marketJobs = pgTable("market_jobs", {
  assignmentId: text("assignment_id").primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id),
  state: marketJobState("state").notNull().default("posted"),
  fundingSent: jsonb("funding_sent").$type<{ txHash: string; expiry: number }>(),
  note: text("note"),
  ...timestamps,
});

/**
 * An agent in `ask` mode asking its owner to pay for some of its tasks from the saved payment
 * method. Nothing is held until the owner approves; an approval covers exactly these tasks and
 * this total, once.
 */
export const fundingApprovals = pgTable(
  "funding_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    taskIds: jsonb("task_ids").$type<string[]>().notNull(),
    /** What the owner was shown: the tasks' totals together, in minor units. */
    total: integer("total").notNull(),
    status: fundingApprovalStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** After approval: which tasks were funded and which were refused, with why. */
    result: jsonb("result").$type<{ funded: string[]; failed: { taskId: string; error: string }[] }>(),
    ...timestamps,
  },
  (t) => [index("funding_approvals_agent_idx").on(t.agentId, t.createdAt)],
);

/** Every change an owner makes to one of their agents: what, when, and the values. Append-only. */
export const ownerActions = pgTable(
  "owner_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("owner_actions_agent_idx").on(t.agentId, t.createdAt)],
);

/**
 * Switches an operator sets from /admin while the site runs, such as closing a payment rail to
 * new money. One row per switch; the audit log has who changed it and why.
 */
export const controls = pgTable("controls", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Passkeys (WebAuthn security keys) an admin must present, on top of signing in, to use /admin. */
export const adminPasskeys = pgTable(
  "admin_passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The admin's worker pseudonym, as in ADMIN_PSEUDONYMS. */
    adminRef: text("admin_ref").notNull(),
    credentialId: text("credential_id").notNull().unique(),
    /** The credential's public key, base64url (COSE). */
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: jsonb("transports").$type<string[]>(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("admin_passkeys_admin_idx").on(t.adminRef)],
);

/**
 * One row per worker who set up a payout account on a chain for the first time through boreal's
 * guided setup, counted per chain for the status page. Deliberately nothing else: no worker,
 * no account, no task. boreal never holds a wallet for anyone; this only counts that one was made.
 */
export const walletSetups = pgTable("wallet_setups", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  chain: walletChain("chain").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
