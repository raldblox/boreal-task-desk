ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'awaiting_funding';--> statement-breakpoint
-- Tasks are now funded before they are screened, so "posted" means funded and in screening.
-- A task posted under the old order (screening first) and never funded goes back to awaiting
-- funding; it is screened once its money is held.
UPDATE "tasks" SET "status" = 'awaiting_funding' WHERE "status" = 'posted' AND "funded_at" IS NULL;
