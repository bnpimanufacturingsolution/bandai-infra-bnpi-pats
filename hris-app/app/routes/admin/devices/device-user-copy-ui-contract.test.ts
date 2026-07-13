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
});
