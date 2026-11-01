CREATE TYPE "public"."payment_rail" AS ENUM('concordium', 'paypal');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "payment_rail" "payment_rail";--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "paypal_email" text;