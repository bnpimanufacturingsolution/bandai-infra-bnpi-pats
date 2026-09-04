-- Operator default: all timesheets auto-approved (2026-09-04).
-- Aligns the physical column with Prisma schema (@default(true)) and the
-- normalized config creator (enableAutoApprove: true).
-- Idempotent for re-apply. Row UPDATE only flips explicit false -> true;
-- it never touches true and never deletes anything.

ALTER TABLE "timesheet_configs"
	ALTER COLUMN "enableAutoApprove" SET DEFAULT true;

UPDATE "timesheet_configs"
	SET "enableAutoApprove" = true,
		"updatedAt" = CURRENT_TIMESTAMP
	WHERE "enableAutoApprove" = false;
