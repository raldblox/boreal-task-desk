CREATE TYPE "public"."agent_link_status" AS ENUM('pending', 'approved', 'denied', 'collected');--> statement-breakpoint
CREATE TABLE "agent_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"poll_token_hash" text NOT NULL,
	"agent_name" text NOT NULL,
	"agent_description" text,
	"status" "agent_link_status" DEFAULT 'pending' NOT NULL,
	"owner_id" uuid,
	"agent_id" uuid,
	"client_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_links_code_unique" UNIQUE("code"),
	CONSTRAINT "agent_links_poll_token_hash_unique" UNIQUE("poll_token_hash")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "badge_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "badge_network" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "owner_account" text;--> statement-breakpoint
ALTER TABLE "agent_links" ADD CONSTRAINT "agent_links_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_links" ADD CONSTRAINT "agent_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_links_client_idx" ON "agent_links" USING btree ("client_hash","created_at");