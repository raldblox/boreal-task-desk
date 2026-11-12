ALTER TABLE "submissions" ADD COLUMN "files_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "closed_at" timestamp with time zone;