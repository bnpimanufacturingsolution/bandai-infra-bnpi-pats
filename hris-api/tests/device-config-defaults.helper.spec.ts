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

