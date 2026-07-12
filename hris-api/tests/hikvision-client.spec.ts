import { expect } from "chai";
import { buildHikvisionDeviceBaseUrl } from "../lib/hikvision-client";

describe("hikvision client endpoint resolution", () => {
	it("prefers the physical device address on non-linux hosts when runtime address is loopback-only", () => {
		const baseUrl = buildHikvisionDeviceBaseUrl(
			{
				address: "192.168.254.189",
				port: 443,
				protocol: "https",
				config: {
					hikvisionRuntimeAddress: "127.0.0.1",
					hikvisionRuntimePort: 58180,
					hikvisionRuntimeProtocol: "https",
				},
			},
			{ runtimePlatform: "win32" },
		);

		expect(baseUrl).to.equal("https://192.168.254.189:443");
	});

	it("keeps loopback runtime endpoints available for linux-side listener workflows", () => {
		const baseUrl = buildHikvisionDeviceBaseUrl(
			{
				address: "192.168.254.189",
				port: 443,
				protocol: "https",
				config: {
					hikvisionRuntimeAddress: "127.0.0.1",
					hikvisionRuntimePort: 58180,
					hikvisionRuntimeProtocol: "https",
				},
			},
			{ runtimePlatform: "linux" },
		);

		expect(baseUrl).to.equal("https://127.0.0.1:58180");
	});
});
