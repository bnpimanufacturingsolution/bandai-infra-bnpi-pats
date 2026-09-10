-- Responsible line-leader assignment (2026-09-07).
-- One member employee has at most one responsible leader
-- (Employee.lineLeaderId self-FK). When a section has 2+ leaders, members are
-- partitioned among them; unset falls back to section-leader resolution at
-- request time. Idempotent for re-apply.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "lineLeaderId" TEXT;

CREATE INDEX IF NOT EXISTS "employees_lineLeaderId_idx" ON "employees"("lineLeaderId");

DO $$ BEGIN
	ALTER TABLE "employees"
		ADD CONSTRAINT "employees_lineLeaderId_fkey"
		FOREIGN KEY ("lineLeaderId") REFERENCES "employees"("id")
		ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
