import { expect } from "chai";
import { buildHikvisionConfig } from "../config/hikvision.endpoint";
import { buildHikvisionDeviceBaseUrl } from "../lib/hikvision-client";

describe("Hikvision endpoint config", () => {
	it("does not default to a device address or credentials", async () => {
		const config = buildHikvisionConfig({});

		expect(config.baseUrl).to.equal("");
		expect(config.username).to.equal("");
		expect(config.password).to.equal("");
		expect(config.protocol).to.equal("https");
	});

	it("uses explicit runtime environment values when provided", async () => {
		const config = buildHikvisionConfig({
			HIKVISION_BASE_URL: "http://192.0.2.10",
			HIKVISION_USERNAME: "operator",
			HIKVISION_PASSWORD: "provided-password",
			HIKVISION_PROTOCOL: "http",
		});

		expect(config.baseUrl).to.equal("http://192.0.2.10");
		expect(config.username).to.equal("operator");
		expect(config.password).to.equal("provided-password");
		expect(config.protocol).to.equal("http");
	});

	it("can dial a runtime proxy while preserving the physical display address", async () => {
		const baseUrl = buildHikvisionDeviceBaseUrl({
			address: "10.184.37.139",
			port: 80,
			protocol: "http",
			config: {
				hikvisionRuntimeBaseUrl: "http://10.184.37.250:10080",
			},
		});

		expect(baseUrl).to.equal("http://10.184.37.250:10080");
	});
});
