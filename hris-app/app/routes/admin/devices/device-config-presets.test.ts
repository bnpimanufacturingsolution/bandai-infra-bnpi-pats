import { describe, expect, it } from "vitest";

import {
	buildDeviceConfigPreset,
	normalizeDeviceConfigForSubmit,
} from "./device-config-presets";

describe("device config presets", () => {
	it("builds Hikvision runtime defaults for manual add/edit", () => {
		expect(buildDeviceConfigPreset("Hikvision")).toMatchObject({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			sdkPort: 8000,
			sdkProtocol: "tcp",
			webhookPath: "/api/hikvision/callback",
			employeeKioskLoginEnabled: false,
		});
	});

	it("builds ZKTeco runtime defaults for manual add/edit", () => {
		expect(buildDeviceConfigPreset("ZKTeco")).toMatchObject({
			vendor: "ZKTeco",
			source: "vendor/zkteco-linux",
			sdkPort: 4370,
			sdkProtocol: "tcp",
			webhookPath: "/api/zkteco/events",
			employeeKioskLoginEnabled: false,
		});
	});

	it("keeps vendor runtime fields aligned on submit even when form config is sparse", () => {
		expect(normalizeDeviceConfigForSubmit({ vendor: "Hikvision" })).toMatchObject({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			sdkPort: 8000,
			sdkProtocol: "tcp",
			webhookPath: "/api/hikvision/callback",
		});
	});

	it("preserves operator-controlled kiosk flags while restoring vendor runtime defaults", () => {
		expect(
			normalizeDeviceConfigForSubmit(
				{
					vendor: "ZKTeco",
					employeeKioskLoginEnabled: true,
					employeeKioskLoginWindowSeconds: 30,
				},
				{ employeeKioskLoginAudience: "legacy-audience" },
			),
		).toMatchObject({
			vendor: "ZKTeco",
			source: "vendor/zkteco-linux",
			sdkPort: 4370,
			sdkProtocol: "tcp",
			webhookPath: "/api/zkteco/events",
			employeeKioskLoginEnabled: true,
			employeeKioskLoginWindowSeconds: 30,
			employeeKioskLoginAudience: "legacy-audience",
		});
	});
});
