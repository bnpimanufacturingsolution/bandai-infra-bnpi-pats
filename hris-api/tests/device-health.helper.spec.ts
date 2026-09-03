import { expect } from "chai";
import { resolveHikvisionDeviceHealthNetworkTarget } from "../helper/device-health.helper";

describe("device health helper", () => {
	it("uses the resolved Hikvision runtime endpoint for network reachability when present", () => {
		const target = resolveHikvisionDeviceHealthNetworkTarget({
			address: "192.168.18.42",
			port: 443,
			protocol: "https",
			config: {
				hikvisionRuntimeBaseUrl: "https://10.184.38.176:443",
			},
		});

		expect(target).to.deep.equal({
			host: "10.184.38.176",
			port: 443,
			endpoint: "https://10.184.38.176:443",
			source: "resolved_runtime_endpoint",
		});
	});

	it("falls back to the physical device address when no Hikvision runtime endpoint override exists", () => {
		const target = resolveHikvisionDeviceHealthNetworkTarget({
			address: "192.168.18.42",
			port: 443,
			protocol: "https",
			config: {
				vendor: "Hikvision",
			},
		});

		expect(target).to.deep.equal({
			host: "192.168.18.42",
			port: 443,
			endpoint: "https://192.168.18.42:443",
			source: "resolved_runtime_endpoint",
		});
	});

	it("uses the local SSH tunnel map for health probes while preserving the saved device address", () => {
		const previous = process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP;
		process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP =
			"10.184.37.20:443=127.0.0.1:10443,10.184.37.21:443=127.0.0.1:10444,10.184.37.22:443=127.0.0.1:10445";
		try {
			const target = resolveHikvisionDeviceHealthNetworkTarget({
				address: "10.184.37.21",
				port: 443,
				protocol: "https",
				config: {
					vendor: "Hikvision",
				},
			});

			expect(target).to.deep.equal({
				host: "127.0.0.1",
				port: 10444,
				endpoint: "https://127.0.0.1:10444",
				source: "env_tunnel_map",
			});
		} finally {
			if (previous === undefined) delete process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP;
			else process.env.PROJECT_TRUTH_HIKVISION_TUNNEL_MAP = previous;
		}
	});
});
