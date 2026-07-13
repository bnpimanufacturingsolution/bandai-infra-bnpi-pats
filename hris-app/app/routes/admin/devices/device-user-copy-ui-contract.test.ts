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
	});
});
