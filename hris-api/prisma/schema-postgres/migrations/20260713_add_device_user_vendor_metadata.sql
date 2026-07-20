ALTER TABLE "device_users"
ADD COLUMN IF NOT EXISTS "vendorMetadata" JSONB;
