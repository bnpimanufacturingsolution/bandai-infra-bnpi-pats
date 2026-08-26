-- FILE_DUAL OT: Path A uses register Daily Salary as Employee.dailyRate.
-- Path B (BNPI 313) when dailyRate IS NULL or <= 0.

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "dailyRate" DOUBLE PRECISION;

COMMENT ON COLUMN "Employee"."dailyRate" IS
  'Register Daily Salary for Path A OT (hourly = dailyRate/8). Null/0 = Path B BNPI 313.';
