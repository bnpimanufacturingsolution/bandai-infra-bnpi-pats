-- Per-day Direct/Indirect *work* tag on the timesheet line.
-- Distinct from Employee.workforceSource (hire source DIRECT vs AGENCY).
-- Nullable: untagged until a supervisor/HR sets it for that day.
-- Idempotent for re-apply.

DO $$
BEGIN
	CREATE TYPE "DayLaborType" AS ENUM ('DIRECT', 'INDIRECT');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "timesheet_lines"
	ADD COLUMN IF NOT EXISTS "dayLaborType" "DayLaborType";

ALTER TABLE "attendance_obligations"
	ADD COLUMN IF NOT EXISTS "dayLaborType" "DayLaborType";
