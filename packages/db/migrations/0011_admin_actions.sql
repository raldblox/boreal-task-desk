CREATE TABLE "admin_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_ref" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"reason" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");