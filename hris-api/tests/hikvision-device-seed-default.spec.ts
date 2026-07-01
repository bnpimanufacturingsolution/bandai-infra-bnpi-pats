import { expect } from "chai";
import { DEVICE_DEFINITIONS } from "../prisma/seeds/deviceSeeder";

describe("Hikvision device seed defaults", () => {
	it("keeps the DEV Main Entrance Device pointed at the physical Hikvision LAN address", () => {
		const mainEntranceDevice = DEVICE_DEFINITIONS.find(
			(device) => device.name === "Main Entrance Device",
		);

		expect(mainEntranceDevice).to.deep.include({
			address: "192.168.254.181",
			port: 80,
			protocol: "http",
		});
		expect(mainEntranceDevice?.config).to.deep.include({
			vendor: "Hikvision",
			source: "vendor/hikvision-linux",
			webhookPath: "/api/hikvision/callback",
		});
	});
});
