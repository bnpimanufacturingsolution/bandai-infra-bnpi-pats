import { expect } from "chai";
import { DEVICE_DEFINITIONS } from "../prisma/seeds/deviceSeeder";

describe("Hikvision device seed defaults", () => {
	it("keeps the DEV Main Entrance Device pointed at the current physical Hikvision LAN address", () => {
		const mainEntranceDevice = DEVICE_DEFINITIONS.find(
			(device) => device.name === "Main Entrance Device",
		);

		expect(mainEntranceDevice).to.deep.include({
			address: "10.184.38.215",
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
});
