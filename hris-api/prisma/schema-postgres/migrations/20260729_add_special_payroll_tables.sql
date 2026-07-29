-- Special Payroll: dedicated one-time compensation runs (separate from employee_payrolls).
-- Additive only. Does not alter regular payroll uniqueness or generation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SpecialPayrollRunStatus') THEN
    CREATE TYPE "SpecialPayrollRunStatus" AS ENUM ('FINALIZED', 'RELEASED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "special_payroll_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runCode" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "runType" TEXT NOT NULL DEFAULT 'SPECIAL_PAYROLL',
  "status" "SpecialPayrollRunStatus" NOT NULL DEFAULT 'FINALIZED',
  "contextPayrollPeriodId" TEXT,
  "contextPeriodCode" TEXT,
  "contextPeriodName" TEXT,
  "contextStartDate" DATE NOT NULL,
  "contextEndDate" DATE NOT NULL,
  "contextPayDate" DATE NOT NULL,
  "totalGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineCount" INTEGER NOT NULL DEFAULT 0,
  "employeeCount" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "sourceFilename" TEXT,
  "sourceHash" TEXT,
  "sourceFingerprint" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "releasedByUserId" TEXT,
  "cancelledByUserId" TEXT,
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  CONSTRAINT "special_payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "special_payroll_runs_organizationId_runCode_key"
  ON "special_payroll_runs"("organizationId", "runCode");
CREATE UNIQUE INDEX IF NOT EXISTS "special_payroll_runs_organizationId_idempotencyKey_key"
  ON "special_payroll_runs"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "special_payroll_runs_organizationId_status_isDeleted_idx"
  ON "special_payroll_runs"("organizationId", "status", "isDeleted");
CREATE INDEX IF NOT EXISTS "special_payroll_runs_org_context_status_idx"
  ON "special_payroll_runs"("organizationId", "contextPayrollPeriodId", "status", "isDeleted");
CREATE INDEX IF NOT EXISTS "special_payroll_runs_organizationId_sourceFingerprint_idx"
  ON "special_payroll_runs"("organizationId", "sourceFingerprint");
CREATE INDEX IF NOT EXISTS "special_payroll_runs_createdAt_idx"
  ON "special_payroll_runs"("createdAt");

CREATE TABLE IF NOT EXISTS "special_payroll_lines" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "benefitTypeId" TEXT,
  "compensationCode" TEXT NOT NULL,
  "compensationName" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'COMPENSATION',
  "isTaxable" BOOLEAN NOT NULL DEFAULT false,
  "amount" DOUBLE PRECISION NOT NULL,
  "sourceRowNumber" INTEGER,
  "sourcePayDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "special_payroll_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "special_payroll_lines_runId_idx"
  ON "special_payroll_lines"("runId");
CREATE INDEX IF NOT EXISTS "special_payroll_lines_organizationId_employeeId_idx"
  ON "special_payroll_lines"("organizationId", "employeeId");
CREATE INDEX IF NOT EXISTS "special_payroll_lines_organizationId_compensationCode_idx"
  ON "special_payroll_lines"("organizationId", "compensationCode");
CREATE INDEX IF NOT EXISTS "special_payroll_lines_runId_employeeId_compensationCode_idx"
  ON "special_payroll_lines"("runId", "employeeId", "compensationCode");

CREATE TABLE IF NOT EXISTS "special_payroll_payslips" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "payslipNumber" TEXT NOT NULL,
  "grossPay" DOUBLE PRECISION NOT NULL,
  "netPay" DOUBLE PRECISION NOT NULL,
  "lineSnapshot" JSONB NOT NULL,
  "isReleased" BOOLEAN NOT NULL DEFAULT false,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "special_payroll_payslips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "special_payroll_payslips_runId_employeeId_key"
  ON "special_payroll_payslips"("runId", "employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "special_payroll_payslips_organizationId_payslipNumber_key"
  ON "special_payroll_payslips"("organizationId", "payslipNumber");
CREATE INDEX IF NOT EXISTS "special_payroll_payslips_org_employee_released_idx"
  ON "special_payroll_payslips"("organizationId", "employeeId", "isReleased");
CREATE INDEX IF NOT EXISTS "special_payroll_payslips_runId_idx"
  ON "special_payroll_payslips"("runId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'special_payroll_lines_runId_fkey'
  ) THEN
    ALTER TABLE "special_payroll_lines"
      ADD CONSTRAINT "special_payroll_lines_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "special_payroll_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'special_payroll_lines_employeeId_fkey'
  ) THEN
    ALTER TABLE "special_payroll_lines"
      ADD CONSTRAINT "special_payroll_lines_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'special_payroll_payslips_runId_fkey'
  ) THEN
    ALTER TABLE "special_payroll_payslips"
      ADD CONSTRAINT "special_payroll_payslips_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "special_payroll_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'special_payroll_payslips_employeeId_fkey'
  ) THEN
    ALTER TABLE "special_payroll_payslips"
      ADD CONSTRAINT "special_payroll_payslips_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
