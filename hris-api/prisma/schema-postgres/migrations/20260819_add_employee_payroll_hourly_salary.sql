-- Employee payroll generate-time hourly snapshot.
-- Derived hourly (dailySalary / workingHoursPerDay) persisted on EmployeePayroll only.
-- Not an Employee input. Not a Sheet2 register column.
-- Safe additive migration; existing rows stay 0 until regenerate.
-- Idempotent for re-apply.

ALTER TABLE "employee_payrolls"
  ADD COLUMN IF NOT EXISTS "hourlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0;
