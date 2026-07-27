-- Employee payroll publish / payslip release columns.
-- Required by EmployeePayroll Prisma model and payroll generation upsert.
-- Safe additive migration; existing rows get defaults.
-- Idempotent for re-apply.

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "publishedBy" TEXT;

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "payslipGeneratedAt" TIMESTAMP(3);

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "payslipReleasedAt" TIMESTAMP(3);

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "payslipReleasedBy" TEXT;

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "hasPaymentIssue" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "paymentIssueAt" TIMESTAMP(3);

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "paymentIssueBy" TEXT;

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "paymentIssueNote" TEXT;

CREATE INDEX IF NOT EXISTS "employee_payrolls_organizationId_payrollPeriodId_isPublished_isDeleted_idx"
  ON "employee_payrolls"("organizationId", "payrollPeriodId", "isPublished", "isDeleted");
