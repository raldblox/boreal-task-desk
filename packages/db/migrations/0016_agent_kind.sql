CREATE TYPE "public"."agent_kind" AS ENUM('agent', 'personal', 'market');--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "kind" "agent_kind" DEFAULT 'agent' NOT NULL;--> statement-breakpoint
UPDATE "agents" SET "kind" = 'personal' WHERE "personal";