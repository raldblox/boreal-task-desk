ALTER TABLE "workers" ADD COLUMN "concordium_wallet_ref" text;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_concordium_wallet_ref_unique" UNIQUE("concordium_wallet_ref");