CREATE TYPE "public"."fulfillers" AS ENUM('people', 'people_or_agents');--> statement-breakpoint
CREATE TYPE "public"."worker_kind" AS ENUM('person', 'agent');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "fulfillers" "fulfillers" DEFAULT 'people' NOT NULL;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "kind" "worker_kind" DEFAULT 'person' NOT NULL;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "api_key_hash" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "api_key_issued_at" timestamp with time zone;