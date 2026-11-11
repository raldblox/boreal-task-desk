CREATE TYPE "public"."funding_approval_status" AS ENUM('pending', 'approved', 'declined', 'used');--> statement-breakpoint
CREATE TYPE "public"."spending_mode" AS ENUM('ask', 'auto');--> statement-breakpoint
ALTER TYPE "public"."payment_rail" ADD VALUE 'evm';--> statement-breakpoint
CREATE TABLE "admin_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_ref" text NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "admin_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "controls" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"task_ids" jsonb NOT NULL,
	"total" integer NOT NULL,
	"status" "funding_approval_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "spending_mode" "spending_mode" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "evm_address" text;--> statement-breakpoint
ALTER TABLE "funding_approvals" ADD CONSTRAINT "funding_approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_actions" ADD CONSTRAINT "owner_actions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_actions" ADD CONSTRAINT "owner_actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_passkeys_admin_idx" ON "admin_passkeys" USING btree ("admin_ref");--> statement-breakpoint
CREATE INDEX "funding_approvals_agent_idx" ON "funding_approvals" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "owner_actions_agent_idx" ON "owner_actions" USING btree ("agent_id","created_at");