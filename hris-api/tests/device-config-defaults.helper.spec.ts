import { expect } from "chai";
import {
	buildDeviceRuntimeConfig,
	resolveDeviceRuntimeVendor,
} from "../helper/device-config-defaults.helper";

describe("device runtime config defaults", () => {
	it("derives Hikvision runtime fields from a clean UI vendor payload", () => {
		const config = buildDeviceRuntimeConfig({
			config: { vendor: "Hikvision" },
			name: "Main Entrance Device",
			protocol: "http",
			port: 80,
		});

		expect(config).to.deep.include({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			sdkPort: 8000,
			sdkProtocol: "tcp",
			webhookPath: "/api/hikvision/callback",
			employeeKioskLoginEnabled: false,
			employeeKioskLoginWindowSeconds: 12,
			employeeKioskLoginAppCode: "hris",
			employeeKioskLoginAudience: "employee-portal",
		});
	});

	it("derives ZKTeco runtime fields from vendor and TCP 4370", () => {
		const config = buildDeviceRuntimeConfig({
			config: { vendor: "ZKTeco" },
			name: "Warehouse Terminal",
			protocol: "tcp",
			port: 4370,
		});

		expect(config).to.deep.include({
			vendor: "ZKTeco",
			source: "vendor/zkteco-linux",
			sdkPort: 4370,
			sdkProtocol: "tcp",
			webhookPath: "/api/zkteco/events",
			employeeKioskLoginEnabled: false,
			employeeKioskLoginWindowSeconds: 12,
			employeeKioskLoginAppCode: "hris",
			employeeKioskLoginAudience: "employee-portal",
		});
	});

	it("keeps internal routing backend-owned over stale client values", () => {
		const config = buildDeviceRuntimeConfig({
			config: {
				vendor: "Hikvision",
				source: "wrong-adapter",
				sdkPort: 1234,
				webhookPath: "/wrong",
			},
			name: "Main Entrance Device",
			protocol: "http",
			port: 80,
		});

		expect(config).to.deep.include({
			source: "vendor/hikvision-linux",
			sdkPort: 8000,
			webhookPath: "/api/hikvision/callback",
			employeeKioskLoginEnabled: false,
		});
	});

	it("adds local reverse-bridge runtime fields for TEST A Hikvision payloads", () => {
		const config = buildDeviceRuntimeConfig({
			config: { vendor: "Hikvision" },
			name: "TEST A",
			address: "192.168.254.109",
			protocol: "https",
			port: 443,
		});

		expect(config).to.deep.include({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			hikvisionRuntimeAddress: "127.0.0.1",
			hikvisionRuntimePort: 59443,
			hikvisionRuntimeProtocol: "https",
			hikvisionSdkRuntimeAddress: "127.0.0.1",
			hikvisionSdkRuntimePort: 59000,
			hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
			hikvisionReverseBridgeIndex: 0,
		});
	});

	it("offsets local reverse-bridge runtime fields for TEST B Hikvision payloads", () => {
		const config = buildDeviceRuntimeConfig({
			config: { vendor: "Hikvision" },
			name: "TEST B",
			address: "192.168.254.110",
			protocol: "https",
			port: 443,
		});

		expect(config).to.deep.include({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			hikvisionRuntimeAddress: "127.0.0.1",
			hikvisionRuntimePort: 59543,
			hikvisionRuntimeProtocol: "https",
			hikvisionSdkRuntimeAddress: "127.0.0.1",
			hikvisionSdkRuntimePort: 59100,
			hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
			hikvisionReverseBridgeIndex: 1,
		});
	});

	it("does not force host reverse-bridge fields onto non-local Hikvision devices", () => {
		const config = buildDeviceRuntimeConfig({
			config: { vendor: "Hikvision" },
			name: "Office Door",
			address: "10.184.37.20",
			protocol: "https",
			port: 443,
		});

		expect(config).not.to.have.property("hikvisionRuntimeAddress");
		expect(config).not.to.have.property("hikvisionSdkRuntimeAddress");
		expect(config).to.deep.include({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			sdkPort: 8000,
		});
	});

	it("preserves existing non-routing metadata when the UI submits only vendor", () => {
		const config = buildDeviceRuntimeConfig({
			existingConfig: {
				vendor: "Hikvision",
				model: "DS-K1T341CMFW",
				hikvisionClockSkewSeconds: 2,
			},
			config: { vendor: "Hikvision" },
			name: "Main Entrance Device",
			protocol: "http",
			port: 80,
		});

		expect(config).to.deep.include({
			model: "DS-K1T341CMFW",
			hikvisionClockSkewSeconds: 2,
			source: "vendor/hikvision-linux",
		});
	});

	it("preserves explicit kiosk login settings while keeping default shape", () => {
		const config = buildDeviceRuntimeConfig({
			config: {
				vendor: "Hikvision",
				employeeKioskLoginEnabled: true,
				employeeKioskLoginWindowSeconds: 18,
			},
			name: "Main Entrance Device",
			protocol: "http",
			port: 80,
		});

		expect(config).to.deep.include({
			employeeKioskLoginEnabled: true,
			employeeKioskLoginWindowSeconds: 18,
			employeeKioskLoginAppCode: "hris",
			employeeKioskLoginAudience: "employee-portal",
		});
	});

	it("can infer ZKTeco from protocol and port when the vendor hint is missing", () => {
		expect(
			resolveDeviceRuntimeVendor({
				config: {},
				name: "Terminal",
				protocol: "tcp",
				port: 4370,
			}),
		).to.equal("ZKTeco");
	});
});
