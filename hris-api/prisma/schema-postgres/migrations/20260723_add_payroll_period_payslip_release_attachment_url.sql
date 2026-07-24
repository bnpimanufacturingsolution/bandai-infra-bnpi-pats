-- Payslip release memo attachment URL on payroll periods.
-- Required by PayrollPeriod Prisma model / payslip release workflow.
-- Safe additive migration; existing rows remain NULL.
-- Idempotent for re-apply.

ALTER TABLE "payroll_periods"
  ADD COLUMN IF NOT EXISTS "payslipReleaseAttachmentUrl" TEXT;
