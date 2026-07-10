-- Project Truth HRIS device event taxonomy hard cutover.
-- Safe migration notes:
-- - This migration preserves every existing device_events row and raw evidence field.
-- - Recommended pre-run backup:
--   CREATE TABLE IF NOT EXISTS device_events_backup_20260709 AS TABLE device_events;
-- - Rollback, if the generated client/API cutover must be reverted, is:
--   DROP INDEX IF EXISTS device_events_org_status_eventtime_idx;
--   DROP INDEX IF EXISTS device_events_org_source_eventtime_idx;
--   DROP INDEX IF EXISTS device_events_org_category_action_eventtime_idx;
--   ALTER TABLE device_events DROP COLUMN IF EXISTS "eventConfidence";
--   ALTER TABLE device_events DROP COLUMN IF EXISTS "eventLabel";
--   ALTER TABLE device_events DROP COLUMN IF EXISTS "eventAction";
--   ALTER TABLE device_events DROP COLUMN IF EXISTS "eventCategory";
--   DROP TYPE IF EXISTS "DeviceEventConfidence";
--   DROP TYPE IF EXISTS "DeviceEventAction";
--   DROP TYPE IF EXISTS "DeviceEventCategory";
--   Raw event data remains in source/status/eventType/major/minor/payload/errorMessage.

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceEventCategory') THEN
		CREATE TYPE "DeviceEventCategory" AS ENUM (
			'ATTENDANCE',
			'ENROLLMENT',
			'USER_MANAGEMENT',
			'ACCESS_CONTROL',
			'DEVICE_HEALTH',
			'RUNTIME',
			'UNKNOWN_VENDOR'
		);
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceEventAction') THEN
		CREATE TYPE "DeviceEventAction" AS ENUM (
			'TAP',
			'FINGERPRINT_ENROLLED',
			'FINGERPRINT_UPDATED',
			'FINGERPRINT_DELETED',
			'CARD_ENROLLED',
			'CARD_UPDATED',
			'CARD_DELETED',
			'USER_CREATED',
			'USER_UPDATED',
			'USER_DELETED',
			'TAP_REJECTED',
			'SYNC_IMPORTED',
			'LISTENER_RECEIVED',
			'UNKNOWN'
		);
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceEventConfidence') THEN
		CREATE TYPE "DeviceEventConfidence" AS ENUM (
			'PROVEN',
			'SUPPORTED',
			'INFERRED',
			'UNKNOWN'
		);
	END IF;
END $$;

ALTER TABLE device_events
	ADD COLUMN IF NOT EXISTS "eventCategory" "DeviceEventCategory" NOT NULL DEFAULT 'UNKNOWN_VENDOR',
	ADD COLUMN IF NOT EXISTS "eventAction" "DeviceEventAction" NOT NULL DEFAULT 'UNKNOWN',
	ADD COLUMN IF NOT EXISTS "eventLabel" TEXT NOT NULL DEFAULT 'Device event',
	ADD COLUMN IF NOT EXISTS "eventConfidence" "DeviceEventConfidence" NOT NULL DEFAULT 'UNKNOWN';

WITH event_evidence AS (
	SELECT
		id,
		source::text AS runtime_path,
		COALESCE("eventType", payload->>'eventType', '') AS event_type,
		COALESCE(payload->>'eventKind', payload #>> '{event,eventKind}', '') AS event_kind,
		COALESCE(
			payload->>'actionCode',
			payload->>'minorName',
			payload #>> '{rawAlarm,minorName}',
			payload #>> '{event,actionCode}',
			payload #>> '{event,minorName}',
			''
		) AS action_code,
		COALESCE(minor, payload->>'minor', payload #>> '{rawAlarm,minor}', '') AS minor_code,
		COALESCE("errorMessage", '') AS error_message,
		status::text AS processing_result
	FROM device_events
)
UPDATE device_events de
SET
	"eventCategory" = mapped.event_category::"DeviceEventCategory",
	"eventAction" = mapped.event_action::"DeviceEventAction",
	"eventLabel" = mapped.event_label,
	"eventConfidence" = mapped.event_confidence::"DeviceEventConfidence"
FROM (
	SELECT
		id,
		CASE
			WHEN runtime_path = 'ZKTECO_EVENT' OR event_type = 'AttendanceTransaction'
				THEN 'ATTENDANCE'
			WHEN action_code = 'MINOR_FINGERPRINT_COMPARE_PASS'
				OR event_kind = 'attendance_fingerprint_success'
				OR minor_code = '38'
				THEN 'ATTENDANCE'
			WHEN action_code = 'MINOR_CARD_FINGERPRINT_VERIFY_PASS'
				THEN 'ATTENDANCE'
			WHEN action_code IN (
				'MINOR_ADD_FINGER_BY_CARD',
				'MINOR_ADD_FINGER_BY_EMPLOYEE_NO',
				'MINOR_MOD_FINGER_BY_CARD',
				'MINOR_MOD_FINGER_BY_EMPLOYEE_NO',
				'MINOR_DEL_FINGER',
				'MINOR_ADD_CARD',
				'MINOR_ADD_CARD_INFO',
				'MINOR_MOD_CARD',
				'MINOR_MODIFY_CARD_INFO',
				'MINOR_DELETE_CARD_INFO'
			)
				THEN 'ENROLLMENT'
			WHEN action_code IN ('MINOR_ADD_USER_INFO', 'MINOR_MODIFY_USER_INFO', 'MINOR_CLR_USER_INFO')
				THEN 'USER_MANAGEMENT'
			WHEN action_code IN (
				'MINOR_FINGERPRINT_COMPARE_FAIL',
				'MINOR_CARD_FINGERPRINT_VERIFY_FAIL',
				'MINOR_FINGERPRINT_INEXISTENCE'
			)
				OR event_kind = 'attendance_fingerprint_failed'
				OR event_kind = 'acs_event'
				THEN 'ACCESS_CONTROL'
			ELSE 'UNKNOWN_VENDOR'
		END AS event_category,
		CASE
			WHEN runtime_path = 'ZKTECO_EVENT' OR event_type = 'AttendanceTransaction'
				THEN 'TAP'
			WHEN action_code = 'MINOR_FINGERPRINT_COMPARE_PASS'
				OR event_kind = 'attendance_fingerprint_success'
				OR minor_code = '38'
				THEN 'TAP'
			WHEN action_code = 'MINOR_CARD_FINGERPRINT_VERIFY_PASS'
				THEN 'TAP'
			WHEN action_code IN ('MINOR_FINGERPRINT_COMPARE_FAIL', 'MINOR_CARD_FINGERPRINT_VERIFY_FAIL', 'MINOR_FINGERPRINT_INEXISTENCE')
				OR event_kind = 'attendance_fingerprint_failed'
				THEN 'TAP_REJECTED'
			WHEN action_code IN ('MINOR_ADD_FINGER_BY_CARD', 'MINOR_ADD_FINGER_BY_EMPLOYEE_NO')
				THEN 'FINGERPRINT_ENROLLED'
			WHEN action_code IN ('MINOR_MOD_FINGER_BY_CARD', 'MINOR_MOD_FINGER_BY_EMPLOYEE_NO')
				THEN 'FINGERPRINT_UPDATED'
			WHEN action_code = 'MINOR_DEL_FINGER'
				THEN 'FINGERPRINT_DELETED'
			WHEN action_code IN ('MINOR_ADD_CARD', 'MINOR_ADD_CARD_INFO')
				THEN 'CARD_ENROLLED'
			WHEN action_code IN ('MINOR_MOD_CARD', 'MINOR_MODIFY_CARD_INFO')
				THEN 'CARD_UPDATED'
			WHEN action_code = 'MINOR_DELETE_CARD_INFO'
				THEN 'CARD_DELETED'
			WHEN action_code = 'MINOR_ADD_USER_INFO'
				THEN 'USER_CREATED'
			WHEN action_code = 'MINOR_MODIFY_USER_INFO'
				THEN 'USER_UPDATED'
			WHEN action_code = 'MINOR_CLR_USER_INFO'
				THEN 'USER_DELETED'
			WHEN event_kind = 'acs_event'
				THEN 'UNKNOWN'
			ELSE 'LISTENER_RECEIVED'
		END AS event_action,
		CASE
			WHEN runtime_path = 'ZKTECO_EVENT' OR event_type = 'AttendanceTransaction'
				THEN 'Attendance punch'
			WHEN action_code = 'MINOR_FINGERPRINT_COMPARE_PASS'
				OR event_kind = 'attendance_fingerprint_success'
				OR minor_code = '38'
				THEN 'Fingerprint attendance punch'
			WHEN action_code = 'MINOR_CARD_FINGERPRINT_VERIFY_PASS'
				THEN 'Card and fingerprint punch'
			WHEN action_code IN ('MINOR_FINGERPRINT_COMPARE_FAIL', 'MINOR_CARD_FINGERPRINT_VERIFY_FAIL', 'MINOR_FINGERPRINT_INEXISTENCE')
				OR event_kind = 'attendance_fingerprint_failed'
				THEN 'Rejected tap'
			WHEN action_code IN ('MINOR_ADD_FINGER_BY_CARD', 'MINOR_ADD_FINGER_BY_EMPLOYEE_NO')
				THEN 'Fingerprint enrolled'
			WHEN action_code IN ('MINOR_MOD_FINGER_BY_CARD', 'MINOR_MOD_FINGER_BY_EMPLOYEE_NO')
				THEN 'Fingerprint updated'
			WHEN action_code = 'MINOR_DEL_FINGER'
				THEN 'Fingerprint deleted'
			WHEN action_code IN ('MINOR_ADD_CARD', 'MINOR_ADD_CARD_INFO')
				THEN 'Card enrolled'
			WHEN action_code IN ('MINOR_MOD_CARD', 'MINOR_MODIFY_CARD_INFO')
				THEN 'Card updated'
			WHEN action_code = 'MINOR_DELETE_CARD_INFO'
				THEN 'Card deleted'
			WHEN action_code = 'MINOR_ADD_USER_INFO'
				THEN 'Device user created'
			WHEN action_code = 'MINOR_MODIFY_USER_INFO'
				THEN 'Device user updated'
			WHEN action_code = 'MINOR_CLR_USER_INFO'
				THEN 'Device user deleted'
			WHEN event_kind = 'acs_event' AND (error_message <> '' OR processing_result = 'FAILED')
				THEN 'Access controller event needs review'
			WHEN event_kind = 'acs_event'
				THEN 'Access controller event'
			WHEN error_message <> '' OR processing_result = 'FAILED'
				THEN 'Device event needs review'
			ELSE 'Device event'
		END AS event_label,
		CASE
			WHEN runtime_path = 'ZKTECO_EVENT' OR event_type = 'AttendanceTransaction'
				THEN 'PROVEN'
			WHEN action_code = 'MINOR_FINGERPRINT_COMPARE_PASS'
				OR event_kind = 'attendance_fingerprint_success'
				OR minor_code = '38'
				THEN 'PROVEN'
			WHEN action_code IN (
				'MINOR_CARD_FINGERPRINT_VERIFY_PASS',
				'MINOR_FINGERPRINT_COMPARE_FAIL',
				'MINOR_CARD_FINGERPRINT_VERIFY_FAIL',
				'MINOR_FINGERPRINT_INEXISTENCE',
				'MINOR_ADD_FINGER_BY_CARD',
				'MINOR_ADD_FINGER_BY_EMPLOYEE_NO',
				'MINOR_MOD_FINGER_BY_CARD',
				'MINOR_MOD_FINGER_BY_EMPLOYEE_NO',
				'MINOR_DEL_FINGER',
				'MINOR_ADD_CARD',
				'MINOR_ADD_CARD_INFO',
				'MINOR_MOD_CARD',
				'MINOR_MODIFY_CARD_INFO',
				'MINOR_DELETE_CARD_INFO',
				'MINOR_ADD_USER_INFO',
				'MINOR_MODIFY_USER_INFO',
				'MINOR_CLR_USER_INFO'
			)
				THEN 'SUPPORTED'
			ELSE 'UNKNOWN'
		END AS event_confidence
	FROM event_evidence
) mapped
WHERE mapped.id = de.id;

CREATE INDEX IF NOT EXISTS device_events_org_category_action_eventtime_idx
	ON device_events ("organizationId", "eventCategory", "eventAction", "eventTime");

CREATE INDEX IF NOT EXISTS device_events_org_source_eventtime_idx
	ON device_events ("organizationId", source, "eventTime");

CREATE INDEX IF NOT EXISTS device_events_org_status_eventtime_idx
	ON device_events ("organizationId", status, "eventTime");
