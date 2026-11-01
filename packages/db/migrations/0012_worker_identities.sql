ALTER TABLE "workers" ADD COLUMN "concordium_ref" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "paypal_ref" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "paypal_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_concordium_ref_unique" UNIQUE("concordium_ref");--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_paypal_ref_unique" UNIQUE("paypal_ref");--> statement-breakpoint
-- Every worker so far signed in with Concordium ID (testers aside): that is their Concordium identity.
UPDATE "workers" SET "concordium_ref" = "pseudonym" WHERE "test_mode" = false;
