import { expect } from "chai";
import { DEVICE_DEFINITIONS, getDeviceDefinitions } from "../prisma/seeds/deviceSeeder";

describe("Hikvision device seed defaults", () => {
	it("keeps the DEV Main Entrance Device pointed at the current physical Hikvision LAN address", () => {
		const mainEntranceDevice = DEVICE_DEFINITIONS.find(
			(device) => device.name === "Main Entrance Device",
		);

		expect(mainEntranceDevice).to.deep.include({
			address: "10.184.37.139",
			port: 80,
			protocol: "http",
		});
		expect(mainEntranceDevice?.config).to.deep.include({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			sdkPort: 8000,
			webhookPath: "/api/hikvision/callback",
		});
	});

	it("keeps Hikvision HTTP and SDK ports distinct", () => {
		const mainEntranceDevice = DEVICE_DEFINITIONS.find(
			(device) => device.name === "Main Entrance Device",
		);

		expect(mainEntranceDevice?.port).to.equal(80);
		expect(mainEntranceDevice?.port).to.not.equal(800);
		expect(mainEntranceDevice?.config?.sdkPort).to.equal(8000);
	});

	it("supports multiple Hikvision seed devices without collapsing them into one default row", () => {
		const devices = getDeviceDefinitions({
			HIKVISION_SEED_DEVICES_JSON: JSON.stringify([
				{
					name: "Main Entrance Device A",
					address: "192.168.254.194",
					port: 443,
					protocol: "https",
					sdkPort: 8000,
					username: "admin",
					password: "secret-a",
				},
				{
					name: "Main Entrance Device B",
					address: "192.168.254.189",
					port: 443,
					protocol: "https",
					sdkPort: 8000,
					username: "admin",
					password: "secret-b",
				},
			]),
		});

		const hikvisionDevices = devices.filter((device) => device.config?.vendor === "Hikvision");
		expect(hikvisionDevices).to.have.length(2);
		expect(hikvisionDevices.map((device) => device.name)).to.deep.equal([
			"Main Entrance Device A",
			"Main Entrance Device B",
		]);
		expect(hikvisionDevices.map((device) => `${device.address}:${device.port}`)).to.deep.equal([
			"192.168.254.194:443",
			"192.168.254.189:443",
		]);
	});
});
