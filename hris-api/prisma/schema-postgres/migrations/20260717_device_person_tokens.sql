-- Write-time opaque log person token ↔ plain employeeNo map for Sync logs.
-- Device operation logs expose opaque LogAddInfo.EmployeeNo; inventory uses plain ids.

CREATE TABLE IF NOT EXISTS device_person_tokens (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL REFERENCES "Device"(id) ON DELETE CASCADE,
  "opaqueToken" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "displayName" TEXT,
  source TEXT NOT NULL DEFAULT 'WRITE_TIME_CAPTURE',
  "captureMetaId" TEXT,
  "captureEventTime" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS device_person_tokens_org_device_opaque_key
  ON device_person_tokens ("organizationId", "deviceId", "opaqueToken");

CREATE INDEX IF NOT EXISTS device_person_tokens_org_device_employee_idx
  ON device_person_tokens ("organizationId", "deviceId", "employeeNo");

CREATE INDEX IF NOT EXISTS device_person_tokens_org_opaque_idx
  ON device_person_tokens ("organizationId", "opaqueToken");
