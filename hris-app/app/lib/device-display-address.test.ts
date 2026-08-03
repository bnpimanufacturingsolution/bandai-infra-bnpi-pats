import { describe, expect, it } from "vitest";
import {
	extractIpv4FromDeviceName,
	formatDeviceDisplayAddressLine,
	resolveDeviceDisplayAddress,
} from "./device-display-address";

describe("device-display-address", () => {
	it("extracts parenthesized LAN IP from Import Target style names", () => {
		expect(extractIpv4FromDeviceName("Import Target A CSV (192.168.18.35)")).toEqual({
			host: "192.168.18.35",
			port: null,
		});
		expect(extractIpv4FromDeviceName("Panel (10.0.0.5:80)")).toEqual({
			host: "10.0.0.5",
			port: 80,
		});
	});

	it("prefers config.physicalAddress as primary Device IP over tunnel publish address", () => {
		const resolved = resolveDeviceDisplayAddress({
			name: "Import Target A CSV (192.168.18.35)",
			address: "10.184.37.19",
			port: 58380,
			config: {
				physicalAddress: "192.168.18.35",
				physicalPort: 80,
				vendor: "Hikvision",
			},
		});

		expect(resolved.primarySource).toBe("config.physicalAddress");
		expect(resolved.primaryEndpoint).toBe("192.168.18.35:80");
		expect(resolved.usesReverseTunnelDisplay).toBe(true);
		expect(resolved.tunnelLabel).toBe("via reverse tunnel 10.184.37.19:58380");
		expect(resolved.runtimeEndpoint).toBe("10.184.37.19:58380");
		// Stored connectivity fields are preserved as runtime, not swapped into primary.
		expect(resolved.runtimeHost).toBe("10.184.37.19");
		expect(resolved.runtimePort).toBe(58380);
	});

	it("falls back to name-embedded IP when config.physicalAddress is missing", () => {
		const resolved = resolveDeviceDisplayAddress({
			name: "Import Target A CSV (192.168.18.35)",
			id: "cmsckkt5a03i9im01ex9jpu72",
			address: "10.184.37.19",
			port: 58380,
			config: { vendor: "Hikvision" },
		} as any);

		expect(resolved.primarySource).toBe("name");
		expect(resolved.primaryEndpoint).toBe("192.168.18.35");
		expect(resolved.tunnelLabel).toBe("via reverse tunnel 10.184.37.19:58380");
	});

	it("falls back to stored address when physical config and name IP are absent", () => {
		const resolved = resolveDeviceDisplayAddress({
			name: "Main Entrance Device A",
			address: "192.168.254.109",
			port: 80,
			config: { vendor: "Hikvision" },
		});

		expect(resolved.primarySource).toBe("address");
		expect(resolved.primaryEndpoint).toBe("192.168.254.109:80");
		expect(resolved.usesReverseTunnelDisplay).toBe(false);
		expect(resolved.tunnelLabel).toBeNull();
	});

	it("shows configured loopback reverse-forward as secondary when address is physical", () => {
		const resolved = resolveDeviceDisplayAddress({
			name: "TEST A",
			address: "192.168.254.109",
			port: 80,
			config: {
				vendor: "Hikvision",
				hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
				hikvisionRuntimeAddress: "127.0.0.1",
				hikvisionRuntimePort: 59443,
				hikvisionSdkRuntimeAddress: "127.0.0.1",
				hikvisionSdkRuntimePort: 59000,
			},
		});

		expect(resolved.primaryEndpoint).toBe("192.168.254.109:80");
		expect(resolved.usesReverseTunnelDisplay).toBe(true);
		expect(resolved.tunnelLabel).toBe("via reverse tunnel 127.0.0.1:59443");
	});

	it("formats a compact line for enroll subtitles", () => {
		expect(
			formatDeviceDisplayAddressLine({
				name: "Import Target A CSV (192.168.18.35)",
				address: "10.184.37.19",
				port: 58380,
				config: { physicalAddress: "192.168.18.35", physicalPort: 80 },
			}),
		).toBe("192.168.18.35:80 · via reverse tunnel 10.184.37.19:58380");

		expect(
			formatDeviceDisplayAddressLine(
				{
					name: "Import Target A CSV (192.168.18.35)",
					address: "10.184.37.19",
					port: 58380,
				},
				{ includeTunnel: false },
			),
		).toBe("192.168.18.35");
	});
});
