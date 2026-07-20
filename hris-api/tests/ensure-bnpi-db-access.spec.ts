import { expect } from "chai";

const { findReachableDevK8sForwardHost } = require("../scripts/ensure-bnpi-db-access.cjs");

describe("ensure-bnpi-db-access", () => {
	it("does not probe a LAN-bound alias when localhost is unavailable", async () => {
		const attempts: string[] = [];
		const host = await findReachableDevK8sForwardHost({
			port: 55435,
			connect: async (port: number, candidate: string) => {
				attempts.push(`${candidate}:${port}`);
				return false;
			},
		});

		expect(host).to.equal(null);
		expect(attempts).to.deep.equal(["127.0.0.1:55435"]);
	});

	it("prefers a dedicated localhost forward when one is already healthy", async () => {
		const attempts: string[] = [];
		const host = await findReachableDevK8sForwardHost({
			port: 55435,
			connect: async (port: number, candidate: string) => {
				attempts.push(`${candidate}:${port}`);
				return candidate === "127.0.0.1";
			},
		});

		expect(host).to.equal("127.0.0.1");
		expect(attempts).to.deep.equal(["127.0.0.1:55435"]);
	});
});
