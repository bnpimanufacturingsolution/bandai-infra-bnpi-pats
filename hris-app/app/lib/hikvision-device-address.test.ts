import { describe, expect, it } from "vitest";
import {
	getConfiguredHikvisionAddresses,
	hikvisionObservedAddressMatchesDevice,
} from "./hikvision-device-address";

describe("hikvision device address matching", () => {
	it("treats runtime loopback addresses as valid configured matches", () => {
		const device = {
			address: "192.168.254.189",
			config: {
				hikvisionRuntimeAddress: "127.0.0.1",
				hikvisionSdkRuntimeAddress: "127.0.0.1",
			},
		};

		expect(getConfiguredHikvisionAddresses(device)).toEqual(["192.168.254.189", "127.0.0.1", "127.0.0.1"]);
		expect(hikvisionObservedAddressMatchesDevice("127.0.0.1", device)).toBe(true);
		expect(hikvisionObservedAddressMatchesDevice("192.168.254.189", device)).toBe(true);
		expect(hikvisionObservedAddressMatchesDevice("192.168.254.194", device)).toBe(false);
	});
});
