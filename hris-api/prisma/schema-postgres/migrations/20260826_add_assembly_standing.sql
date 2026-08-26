-- Assembly Standing Allowance (spec gap M1.2, operator-approved code ASA,
-- taxable like Line Leader Allowance) — additive register column.
ALTER TABLE "employee_payrolls" ADD COLUMN IF NOT EXISTS "assemblyStanding" DOUBLE PRECISION NOT NULL DEFAULT 0;
