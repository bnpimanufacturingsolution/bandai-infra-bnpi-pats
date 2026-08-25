-- Disciplinary Action (spec gap M3.2) — additive table, safe to apply.
-- Apply explicitly; do not run destructive migrations.

CREATE TYPE "DisciplinaryActionStatus" AS ENUM ('OPEN', 'ONGOING', 'RESOLVED', 'DISMISSED');

CREATE TABLE IF NOT EXISTS "disciplinary_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT,
    "offenseType" TEXT NOT NULL,
    "offenseDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "DisciplinaryActionStatus" NOT NULL DEFAULT 'OPEN',
    "actionTaken" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "attachmentDocumentId" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "disciplinary_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "disciplinary_actions_organizationId_employeeId_isDeleted_idx"
    ON "disciplinary_actions"("organizationId", "employeeId", "isDeleted");
CREATE INDEX IF NOT EXISTS "disciplinary_actions_organizationId_status_isDeleted_idx"
    ON "disciplinary_actions"("organizationId", "status", "isDeleted");
CREATE INDEX IF NOT EXISTS "disciplinary_actions_organizationId_offenseDate_idx"
    ON "disciplinary_actions"("organizationId", "offenseDate");
