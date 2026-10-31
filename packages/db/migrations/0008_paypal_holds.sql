ALTER TYPE "public"."outbox_kind" ADD VALUE 'capture';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'release';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'reconcile';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "funding_hold" text;