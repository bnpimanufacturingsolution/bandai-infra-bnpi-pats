-- Align employee_benefits with Prisma schema (scheduleMode / recurrence / attendance-based).
-- Safe additive migration: optional columns + enums. Null scheduleMode preserves legacy rows.
-- Idempotent for re-apply on partially upgraded environments.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BenefitScheduleMode') THEN
    CREATE TYPE "BenefitScheduleMode" AS ENUM (
      'TIME_BOUND',
      'FIXED_INSTALLMENTS',
      'RECURRING'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BenefitRecurrenceFrequency') THEN
    CREATE TYPE "BenefitRecurrenceFrequency" AS ENUM (
      'EVERY_CUTOFF',
      'MONTHLY',
      'YEARLY'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BenefitAttendanceAmountBasis') THEN
    CREATE TYPE "BenefitAttendanceAmountBasis" AS ENUM (
      'PER_DAY',
      'PER_CUTOFF'
    );
  END IF;
END $$;

ALTER TABLE "employee_benefits"
  ADD COLUMN IF NOT EXISTS "scheduleMode" "BenefitScheduleMode",
  ADD COLUMN IF NOT EXISTS "recurrenceFrequency" "BenefitRecurrenceFrequency",
  ADD COLUMN IF NOT EXISTS "attendanceBased" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attendanceAmountBasis" "BenefitAttendanceAmountBasis";
