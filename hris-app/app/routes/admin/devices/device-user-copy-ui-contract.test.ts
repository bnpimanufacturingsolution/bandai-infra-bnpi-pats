import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("device user copy UI contract", () => {
	it("reads synthetic peer-copy overlays from the backend response contract", () => {
		const enroll = readFileSync(
			join(process.cwd(), "app/routes/admin/devices/enroll.tsx"),
			"utf8",
		);

		expect(enroll).toContain("syntheticCredentialOverlayApplied");
		expect(enroll).not.toContain("syntheticFingerprintOverlayApplied?.fingerprintCount");
		expect(enroll).toContain("dev-only synthetic biometric tallies for verification");
		expect(enroll).toContain("failedTargets");
		expect(enroll).toContain("Retry failed devices");
		expect(enroll).toContain("The target device is not reachable right now");
		expect(enroll).toContain("Successful copies are kept");
	});

	it("shows potential-operation recovery, physical retention, heartbeat, and reread deltas", () => {
		const enroll = readFileSync(
			join(process.cwd(), "app/routes/admin/devices/enroll.tsx"),
			"utf8",
		);
		const service = readFileSync(
			join(process.cwd(), "app/services/devices.service.ts"),
			"utf8",
		);

		for (const label of [
			"Potential operations",
			"Fingerprint retained",
			"Face retained",
			"Card retained",
			"Backend heartbeat",
			"Starting gaps",
			"Ending gaps",
			"Physically closed delta",
			"Closed delta by physical target",
		]) {
			expect(enroll).toContain(label);
		}
		for (const stage of [
			"queued_source_custody_recovery",
			"exporting_source_credential",
			"comparing_sources",
			"resolving_richest_source",
			"probing_target_capability",
			"preparing_writer",
			"ready_to_write",
			"writing",
			"rereading_target",
			"physically_retained",
			"retrying_recoverable_failure",
			"physical_identity_action_required",
			"physical_reenrollment_required",
			"device_firmware_unsupported",
		]) {
			expect(enroll).toContain(stage);
		}
		expect(service).toContain("DeviceUserCredentialOperationTelemetry");
		expect(service).toContain("startingGapSummary");
		expect(service).toContain("endingGapSummary");
		expect(service).toContain("gapDelta");
	});
});
