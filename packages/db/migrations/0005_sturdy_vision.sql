CREATE TYPE "public"."review_mode" AS ENUM('boreal', 'requester');--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "test_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "review_mode" "review_mode" DEFAULT 'boreal' NOT NULL;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "test_mode" boolean DEFAULT false NOT NULL;