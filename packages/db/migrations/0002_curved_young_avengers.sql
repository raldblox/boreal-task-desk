ALTER TABLE "agents" ADD COLUMN "refund_address" text;--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "anchor_tx_hash" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "payout_address" text;