-- LEAVE_CONVERSION request type (spec gap M3.1) — additive enum value.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
ALTER TYPE "RequestType" ADD VALUE IF NOT EXISTS 'LEAVE_CONVERSION';
