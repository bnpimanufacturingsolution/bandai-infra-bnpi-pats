-- Benefit attendance eligibility (mode + disqualify flags) on enrollments and type defaults.
-- Safe additive migration. Existing rows keep ENROLLED_ALWAYS (no pay-behavior change).
-- Idempotent for re-apply on partially upgraded environments.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BenefitEligibilityMode') THEN
    CREATE TYPE "BenefitEligibilityMode" AS ENUM (
      'ENROLLED_ALWAYS',
      'ATTENDANCE_QUALIFIED'
    );
  END IF;
END $$;

ALTER TABLE "employee_benefits"
  ADD COLUMN IF NOT EXISTS "eligibilityMode" "BenefitEligibilityMode" NOT NULL DEFAULT 'ENROLLED_ALWAYS',
  ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnAbsent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnLate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnUndertime" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnLeave" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "benefit_types"
  ADD COLUMN IF NOT EXISTS "defaultEligibilityMode" "BenefitEligibilityMode",
  ADD COLUMN IF NOT EXISTS "defaultEligibilityDisqualifyOnAbsent" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "defaultEligibilityDisqualifyOnLate" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "defaultEligibilityDisqualifyOnUndertime" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "defaultEligibilityDisqualifyOnLeave" BOOLEAN;
