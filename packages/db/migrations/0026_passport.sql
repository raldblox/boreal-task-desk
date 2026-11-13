ALTER TABLE "workers" ADD COLUMN "passport_ref" text;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_passport_ref_unique" UNIQUE("passport_ref");