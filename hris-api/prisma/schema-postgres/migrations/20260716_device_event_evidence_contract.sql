-- Add the evidence contract to retained DeviceEvent rows without discarding or
-- rewriting their original payload keys. The separately previewed cleanup
-- removes only proven current-state lifecycle fabrications after backup.

UPDATE device_events
SET
  "eventCategory" = CASE
    WHEN "eventAction" = 'TAP_REJECTED' THEN 'ATTENDANCE'::"DeviceEventCategory"
    WHEN "eventAction" = 'SYNC_SIGNAL' THEN 'RUNTIME'::"DeviceEventCategory"
    WHEN "eventAction" = 'UNKNOWN' THEN 'UNKNOWN_VENDOR'::"DeviceEventCategory"
    ELSE "eventCategory"
  END,
  "eventConfidence" = CASE
    WHEN "eventAction" = 'SYNC_SIGNAL' AND source = 'EN_HCNETSDK_ALARM'
      THEN 'SUPPORTED'::"DeviceEventConfidence"
    ELSE "eventConfidence"
  END,
  payload = COALESCE(payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'evidenceContractVersion', 1,
    'evidenceSource', COALESCE(
      NULLIF(payload->>'evidenceSource', ''),
      CASE
        WHEN "eventType" = 'DeviceSyncRun' THEN 'RUNTIME_PROCESS'
        WHEN "eventType" = 'ISAPI_LOGSEARCH' THEN 'ISAPI_LOGSEARCH'
        WHEN source IN ('EN_HCNETSDK_ALARM', 'HIKVISION_CALLBACK') THEN 'SDK_CALLBACK'
        WHEN source = 'ZKTECO_EVENT' THEN 'ZKTECO_CALLBACK'
        ELSE 'UNKNOWN'
      END
    ),
    'directDeviceEvidence', CASE
      WHEN payload ? 'directDeviceEvidence' THEN payload->'directDeviceEvidence'
      WHEN "eventType" IN ('DeviceSyncRun', 'BiometricStateBackfill') THEN 'false'::jsonb
      WHEN source IN ('EN_HCNETSDK_ALARM', 'HIKVISION_CALLBACK', 'ZKTECO_EVENT') THEN 'true'::jsonb
      ELSE 'false'::jsonb
    END,
    'vendorAction', COALESCE(
      NULLIF(payload->>'vendorAction', ''),
      NULLIF(payload->>'actionCode', ''),
      NULLIF(minor, ''),
      NULLIF("eventType", '')
    ),
    'vendorCode', COALESCE(NULLIF(payload->>'vendorCode', ''), NULLIF(payload->>'actionCode', ''), NULLIF(minor, '')),
    'rawDeviceTime', COALESCE(NULLIF(payload->>'rawDeviceTime', ''), NULLIF(payload->>'time', ''), NULLIF(payload->>'dateTime', '')),
    'operator', COALESCE(NULLIF(payload->>'operator', ''), NULLIF(payload->>'userName', '')),
    'remoteHost', COALESCE(
      NULLIF(payload->>'remoteHost', ''),
      NULLIF(payload#>>'{rawAlarm,remoteHost}', ''),
      NULLIF(payload#>>'{rawAlarm,deviceIp}', ''),
      NULLIF(payload->>'deviceIP', ''),
      NULLIF(payload->>'ipAddress', '')
    ),
    'employeeNo', COALESCE(NULLIF(payload->>'employeeNo', ''), NULLIF("employeeNo", '')),
    'correlationId', COALESCE(
      NULLIF(payload->>'correlationId', ''),
      NULLIF(payload->>'runId', ''),
      NULLIF(payload->>'jobId', '')
    )
  )),
  "updatedAt" = NOW()
WHERE
  NOT (payload ? 'evidenceContractVersion')
  OR NOT (payload ? 'evidenceSource')
  OR NOT (payload ? 'directDeviceEvidence')
  OR "eventAction" IN ('TAP_REJECTED', 'SYNC_SIGNAL', 'UNKNOWN');

