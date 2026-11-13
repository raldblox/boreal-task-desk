ALTER TABLE "workers" ADD COLUMN "person_ref" text;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_person_ref_unique" UNIQUE("person_ref");