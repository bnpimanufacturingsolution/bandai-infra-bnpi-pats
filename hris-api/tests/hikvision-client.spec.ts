import { expect } from "chai";
import {
	buildHikvisionDeviceBaseUrl,
	resolveHikvisionTunnelTarget,
	withHikvisionPrismaTransportRetry,
} from "../lib/hikvision-client";

describe("hikvision client endpoint resolution", () => {
	it("retries transient Prisma transport loss without retrying permanent errors", async () => {
		let attempts = 0;
		const value = await withHikvisionPrismaTransportRetry(async () => {
			attempts += 1;
			if (attempts < 3) throw new Error("Server has closed the connection.");
			return "ready";
		}, [0, 1, 1]);
		expect(value).to.equal("ready");
		expect(attempts).to.equal(3);

		let permanentAttempts = 0;
		try {
			await withHikvisionPrismaTransportRetry(async () => {
				permanentAttempts += 1;
				throw new Error("Device not found");
			}, [0, 1, 1]);
			expect.fail("expected permanent error");
		} catch (error: any) {
			expect(error.message).to.equal("Device not found");
		}
		expect(permanentAttempts).to.equal(1);
	});
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

	it("maps a physical device endpoint to a local SSH tunnel without changing the device row", () => {
		const previous = process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP;
		process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP =
			"10.184.37.20:443=127.0.0.1:10443,10.184.37.20:8000=127.0.0.1:18000," +
			"10.184.37.21:443=127.0.0.1:10444,10.184.37.21:8000=127.0.0.1:18001," +
			"10.184.37.22:443=127.0.0.1:10445,10.184.37.22:8000=127.0.0.1:18002," +
			"10.184.37.23:443=127.0.0.1:10446,10.184.37.23:8000=127.0.0.1:18003";
		try {
			const baseUrl = buildHikvisionDeviceBaseUrl({
				address: "10.184.37.21",
				port: 443,
				protocol: "https",
				config: {},
			});
			const sdkTarget = resolveHikvisionTunnelTarget("10.184.37.21", 8000);

			expect(baseUrl).to.equal("https://127.0.0.1:10444");
			expect(sdkTarget).to.deep.equal({
				host: "127.0.0.1",
				port: 18001,
				protocol: undefined,
				source: "env_tunnel_map",
			});
			expect(resolveHikvisionTunnelTarget("10.184.37.23", 443)).to.deep.equal({
				host: "127.0.0.1",
				port: 10446,
				protocol: undefined,
				source: "env_tunnel_map",
			});
		} finally {
			if (previous === undefined) delete process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP;
			else process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP = previous;
		}
	});
});
