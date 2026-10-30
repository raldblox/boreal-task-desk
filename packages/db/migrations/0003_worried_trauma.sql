ALTER TABLE "tasks" ADD COLUMN "needs_human" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "human_reason" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ai_retry_at" timestamp with time zone;