import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

describe("Device event taxonomy migration", () => {
	const migrationSql = fs.readFileSync(
		path.resolve(
			__dirname,
			"../prisma/schema-postgres/migrations/20260709_device_event_taxonomy_hardcutover.sql",
		),
		"utf8",
	);

	it("adds non-null persisted taxonomy fields without dropping device event rows", () => {
		expect(migrationSql).to.contain('ADD COLUMN IF NOT EXISTS "eventCategory"');
		expect(migrationSql).to.contain('ADD COLUMN IF NOT EXISTS "eventAction"');
		expect(migrationSql).to.contain('ADD COLUMN IF NOT EXISTS "eventLabel"');
		expect(migrationSql).to.contain('ADD COLUMN IF NOT EXISTS "eventConfidence"');
		expect(migrationSql).to.contain("NOT NULL DEFAULT 'UNKNOWN_VENDOR'");
		expect(migrationSql).to.contain("NOT NULL DEFAULT 'UNKNOWN'");
		expect(migrationSql).to.contain("NOT NULL DEFAULT 'Device event'");
		expect(migrationSql).not.to.match(/DROP\s+TABLE\s+device_events/i);
		expect(migrationSql).not.to.match(/TRUNCATE\s+device_events/i);
	});

	it("backfills proven vendor attendance events and unknown ACS rows deterministically", () => {
		expect(migrationSql).to.contain("runtime_path = 'ZKTECO_EVENT'");
		expect(migrationSql).to.contain("event_type = 'AttendanceTransaction'");
		expect(migrationSql).to.contain("action_code = 'MINOR_FINGERPRINT_COMPARE_PASS'");
		expect(migrationSql).to.contain("minor_code = '38'");
		expect(migrationSql).to.contain("THEN 'Fingerprint attendance punch'");
		expect(migrationSql).to.contain("THEN 'Attendance punch'");
		expect(migrationSql).to.contain("WHEN event_kind = 'acs_event'");
		expect(migrationSql).to.contain("THEN 'UNKNOWN'");
		expect(migrationSql).not.to.contain("UNKNOWN_MINOR'\n\t\t\t\tTHEN 'TAP'");
	});

	it("creates the new event-first indexes and preserves raw compatibility indexes", () => {
		expect(migrationSql).to.contain("device_events_org_category_action_eventtime_idx");
		expect(migrationSql).to.contain("device_events_org_source_eventtime_idx");
		expect(migrationSql).to.contain("device_events_org_status_eventtime_idx");
	});
});
