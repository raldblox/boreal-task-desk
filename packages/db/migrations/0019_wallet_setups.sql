CREATE TYPE "public"."wallet_chain" AS ENUM('near', 'concordium');--> statement-breakpoint
CREATE TABLE "wallet_setups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain" "wallet_chain" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
