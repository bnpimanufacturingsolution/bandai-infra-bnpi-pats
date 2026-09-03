DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceEventAction') THEN
		ALTER TYPE "DeviceEventAction" ADD VALUE IF NOT EXISTS 'SYNC_SIGNAL';
	END IF;
END $$;
