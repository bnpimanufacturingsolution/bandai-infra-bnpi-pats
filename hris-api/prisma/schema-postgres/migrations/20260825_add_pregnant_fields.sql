-- Pregnant employees list (spec gap M3.3 / chain stage 8) — additive columns.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "pregnant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "expectedDueDate" TIMESTAMP(3);
