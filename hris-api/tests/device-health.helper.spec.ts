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
});
