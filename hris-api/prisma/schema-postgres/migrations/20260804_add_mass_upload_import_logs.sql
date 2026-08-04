-- Durable DM3 compensation / deduction mass-upload import history.
-- Additive only. Does not alter EmployeeBenefit / EmployeeLoan write semantics.

CREATE TABLE IF NOT EXISTS "mass_upload_import_logs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sourceFilename" TEXT,
  "migrationRunId" TEXT,
  "startedByUserId" TEXT,
  "total" INTEGER NOT NULL DEFAULT 0,
  "created" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "periodCodes" JSONB,
  "summaryJson" JSONB NOT NULL,
  "errorsJson" JSONB NOT NULL,
  "resultsJson" JSONB,
  "errorsTruncated" BOOLEAN NOT NULL DEFAULT false,
  "resultsTruncated" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mass_upload_import_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mass_upload_import_logs_org_kind_created_idx"
  ON "mass_upload_import_logs"("organizationId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "mass_upload_import_logs_org_run_idx"
  ON "mass_upload_import_logs"("organizationId", "migrationRunId");
CREATE INDEX IF NOT EXISTS "mass_upload_import_logs_createdAt_idx"
  ON "mass_upload_import_logs"("createdAt");
