CREATE TYPE "public"."market_job_state" AS ENUM('posted', 'started', 'delivered', 'closed');--> statement-breakpoint
ALTER TYPE "public"."payment_rail" ADD VALUE 'near';--> statement-breakpoint
CREATE TABLE "market_jobs" (
	"assignment_id" text PRIMARY KEY NOT NULL,
	"task_id" uuid,
	"state" "market_job_state" DEFAULT 'posted' NOT NULL,
	"funding_sent" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "near_account" text;--> statement-breakpoint
ALTER TABLE "market_jobs" ADD CONSTRAINT "market_jobs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;