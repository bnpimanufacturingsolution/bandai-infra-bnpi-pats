-- Section Line Leader assignment (2026-09-07).
-- Many-to-many: a section can have multiple line leaders; an employee can
-- lead many sections. Role derivation treats membership as hris-line-leader
-- (manager class). Idempotent for re-apply.

CREATE TABLE IF NOT EXISTS "section_line_leaders" (
	"id" TEXT NOT NULL,
	"organizationId" TEXT NOT NULL,
	"sectionId" TEXT NOT NULL,
	"employeeId" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "section_line_leaders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "section_line_leaders_sectionId_employeeId_key"
	ON "section_line_leaders"("sectionId", "employeeId");

CREATE INDEX IF NOT EXISTS "section_line_leaders_organizationId_idx"
	ON "section_line_leaders"("organizationId");

CREATE INDEX IF NOT EXISTS "section_line_leaders_employeeId_idx"
	ON "section_line_leaders"("employeeId");

DO $$ BEGIN
	ALTER TABLE "section_line_leaders"
		ADD CONSTRAINT "section_line_leaders_sectionId_fkey"
		FOREIGN KEY ("sectionId") REFERENCES "sections"("id")
		ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "section_line_leaders"
		ADD CONSTRAINT "section_line_leaders_employeeId_fkey"
		FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
		ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
