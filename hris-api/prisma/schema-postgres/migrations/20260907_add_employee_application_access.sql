-- Training & Performance access configuration (Phase 3).
-- Explicit employee-level deltas over policy defaults + provisioning telemetry.
-- Safe additive migration; idempotent for re-apply.
-- Table name matches the Prisma postgres-tree default (no @@map on this tree).

DROP TABLE IF EXISTS "employee_application_accesses";

CREATE TABLE IF NOT EXISTS "EmployeeApplicationAccess" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "lmsRoleOverride" TEXT,
  "epmrGrants" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "epmrRemovals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "provisioningStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "lastProvisionedAt" TIMESTAMP(3),
  "lastBridgeSnapshot" JSONB,
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "EmployeeApplicationAccess_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeApplicationAccess_organizationId_employeeId_key"
  ON "EmployeeApplicationAccess"("organizationId", "employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeApplicationAccess_organizationId_provisioningStatus_idx"
  ON "EmployeeApplicationAccess"("organizationId", "provisioningStatus");
CREATE INDEX IF NOT EXISTS "EmployeeApplicationAccess_organizationId_employeeId_isDeleted_idx"
  ON "EmployeeApplicationAccess"("organizationId", "employeeId", "isDeleted");
