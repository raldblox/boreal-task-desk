CREATE TYPE "public"."agent_status" AS ENUM('active', 'frozen');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('requester', 'escrow', 'operating', 'worker', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('pending', 'settled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outbox_kind" AS ENUM('anchor', 'payout', 'refund', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."owner_kind" AS ENUM('individual', 'business');--> statement-breakpoint
CREATE TYPE "public"."result_format" AS ENUM('text', 'photo', 'file');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('posted', 'refused', 'awaiting_funding', 'cancelled', 'open', 'expired', 'claimed', 'submitted', 'passed', 'failed', 'disputed', 'final_pass', 'final_fail');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"registry_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"max_task_budget" integer NOT NULL,
	"max_daily_spend" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_registry_id_unique" UNIQUE("registry_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" uuid,
	"idempotency_key" text NOT NULL,
	"from_account" "ledger_account" NOT NULL,
	"to_account" "ledger_account" NOT NULL,
	"party" text,
	"amount" integer NOT NULL,
	"status" "ledger_status" DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" "outbox_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "owner_kind" NOT NULL,
	"verified_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_verified_ref_unique" UNIQUE("verified_ref")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"text" text,
	"file_urls" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"salt" text NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'posted' NOT NULL,
	"description" text NOT NULL,
	"acceptance_criteria" jsonb NOT NULL,
	"required_attributes" jsonb NOT NULL,
	"result_format" "result_format" NOT NULL,
	"budget" integer NOT NULL,
	"platform_fee" integer NOT NULL,
	"review_fee" integer NOT NULL,
	"rulebook_version" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"funded_at" timestamp with time zone,
	"funding_tx_hash" text,
	"claimed_by" uuid,
	"claim_expires_at" timestamp with time zone,
	"reviewer_ref" text,
	"verdict_at" timestamp with time zone,
	"dispute_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pseudonym" text NOT NULL,
	"proven_attributes" jsonb NOT NULL,
	"max_active_claims" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_pseudonym_unique" UNIQUE("pseudonym")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_claimed_by_workers_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_idempotency_idx" ON "ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("done_at","next_attempt_at");--> statement-breakpoint
CREATE INDEX "submissions_task_idx" ON "submissions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_agent_idx" ON "tasks" USING btree ("agent_id");