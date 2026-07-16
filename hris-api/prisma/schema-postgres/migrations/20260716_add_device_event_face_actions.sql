-- DeviceEvent remains the generic physical-device event ledger. Face lifecycle
-- actions are additive enum values; no existing rows are rewritten or removed.
ALTER TYPE "DeviceEventAction" ADD VALUE IF NOT EXISTS 'FACE_ENROLLED';
ALTER TYPE "DeviceEventAction" ADD VALUE IF NOT EXISTS 'FACE_UPDATED';
ALTER TYPE "DeviceEventAction" ADD VALUE IF NOT EXISTS 'FACE_DELETED';
