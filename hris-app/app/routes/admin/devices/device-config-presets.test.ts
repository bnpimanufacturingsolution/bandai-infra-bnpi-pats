import { describe, expect, it } from "vitest";

import {
	buildHikvisionRuntimeConfig,
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

	it("derives TEST A local Hikvision reverse-bridge fields on submit", () => {
		expect(
			normalizeDeviceConfigForSubmit(
				{ vendor: "Hikvision" },
				undefined,
				{ name: "TEST A", address: "192.168.254.109", protocol: "https" },
			),
		).toMatchObject({
			vendor: "Hikvision",
			hikvisionRuntimeAddress: "127.0.0.1",
			hikvisionRuntimePort: 59443,
			hikvisionRuntimeProtocol: "https",
			hikvisionSdkRuntimeAddress: "127.0.0.1",
			hikvisionSdkRuntimePort: 59000,
			hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
			hikvisionReverseBridgeIndex: 0,
		});
	});

	it("derives TEST B local Hikvision reverse-bridge fields on submit", () => {
		expect(
			normalizeDeviceConfigForSubmit(
				{ vendor: "Hikvision" },
				undefined,
				{ name: "TEST B", address: "192.168.254.110", protocol: "https" },
			),
		).toMatchObject({
			vendor: "Hikvision",
			hikvisionRuntimeAddress: "127.0.0.1",
			hikvisionRuntimePort: 59543,
			hikvisionRuntimeProtocol: "https",
			hikvisionSdkRuntimeAddress: "127.0.0.1",
			hikvisionSdkRuntimePort: 59100,
			hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
			hikvisionReverseBridgeIndex: 1,
		});
	});

	it("previews the same TEST B runtime values shown in the form", () => {
		expect(
			buildHikvisionRuntimeConfig(
				{ vendor: "Hikvision" },
				{ name: "TEST B", address: "192.168.254.110", protocol: "https" },
			),
		).toMatchObject({
			hikvisionRuntimePort: 59543,
			hikvisionSdkRuntimePort: 59100,
			hikvisionReverseBridgeIndex: 1,
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
