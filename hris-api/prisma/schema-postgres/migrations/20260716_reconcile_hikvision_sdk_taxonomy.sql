-- Reconcile saved SDK rows with the same numeric vendor mappings used for
-- direct ACS evidence. This changes taxonomy only; raw payloads, dedupe keys,
-- attendance links, and source evidence are preserved.

UPDATE device_events
SET
  "eventCategory" = 'ATTENDANCE'::"DeviceEventCategory",
  "eventAction" = 'TAP'::"DeviceEventAction",
  "eventLabel" = 'Attendance tap',
  "eventConfidence" = 'PROVEN'::"DeviceEventConfidence",
  "updatedAt" = NOW()
WHERE source = 'EN_HCNETSDK_ALARM'
  AND major = '5'
  AND minor IN ('38', '75', '104');

UPDATE device_events
SET
  "eventCategory" = 'ATTENDANCE'::"DeviceEventCategory",
  "eventAction" = 'TAP_REJECTED'::"DeviceEventAction",
  "eventLabel" = 'Rejected tap',
  "eventConfidence" = 'SUPPORTED'::"DeviceEventConfidence",
  "updatedAt" = NOW()
WHERE source = 'EN_HCNETSDK_ALARM'
  AND minor = '39';

UPDATE device_events
SET
  "eventCategory" = 'RUNTIME'::"DeviceEventCategory",
  "eventAction" = 'SYNC_SIGNAL'::"DeviceEventAction",
  "eventLabel" = 'Device user or biometric operation',
  "eventConfidence" = 'SUPPORTED'::"DeviceEventConfidence",
  "updatedAt" = NOW()
WHERE source = 'EN_HCNETSDK_ALARM'
  AND major = '3';
