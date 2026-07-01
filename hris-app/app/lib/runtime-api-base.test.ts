import { describe, expect, it } from "vitest";
import { resolveRuntimeApiBase } from "./runtime-api-base";

const locationFor = (url: string): Pick<Location, "protocol" | "hostname" | "port"> => {
	const parsed = new URL(url);
	return {
		protocol: parsed.protocol,
		hostname: parsed.hostname,
		port: parsed.port,
	};
};

describe("runtime API base resolver", () => {
	it("keeps prod, dev, and UAT LAN app ports isolated from each other", () => {
		expect(resolveRuntimeApiBase(locationFor("http://192.168.100.79:3000"))).toBe(
			"http://192.168.100.79:3001",
		);
		expect(resolveRuntimeApiBase(locationFor("http://192.168.100.79:3100"))).toBe(
			"http://192.168.100.79:3101",
		);
		expect(resolveRuntimeApiBase(locationFor("http://192.168.100.79:3200"))).toBe(
			"http://192.168.100.79:3201",
		);
	});

	it("keeps localhost prod, dev, and UAT app ports isolated from each other", () => {
		expect(resolveRuntimeApiBase(locationFor("http://localhost:3000"))).toBe(
			"http://localhost:3001",
		);
		expect(resolveRuntimeApiBase(locationFor("http://localhost:3100"))).toBe(
			"http://localhost:3101",
		);
		expect(resolveRuntimeApiBase(locationFor("http://localhost:3200"))).toBe(
			"http://localhost:3201",
		);
	});

	it("honors an explicit non-local API base", () => {
		expect(
			resolveRuntimeApiBase(
				locationFor("http://192.168.100.79:3100"),
				"https://api.example.test",
			),
		).toBe("https://api.example.test");
	});

	it("ignores relative configured bases for LAN browser sessions", () => {
		expect(resolveRuntimeApiBase(locationFor("http://10.184.38.61:3000"), "/api")).toBe(
			"http://10.184.38.61:3001",
		);
	});

	it("uses same-host API routing for production bnpi Cloudflare tunnel hosts", () => {
		expect(resolveRuntimeApiBase(locationFor("https://bnpi-hris.tech/auth/login"))).toBe(
			"/api",
		);
		expect(resolveRuntimeApiBase(locationFor("https://www.bnpi-hris.tech/auth/login"))).toBe(
			"/api",
		);
		expect(resolveRuntimeApiBase(locationFor("https://app.bnpi-hris.tech/auth/login"))).toBe(
			"/api",
		);
	});

	it("uses same-host API routing for dev and UAT public app hosts", () => {
		expect(resolveRuntimeApiBase(locationFor("https://dev.bnpi-hris.tech/auth/login"))).toBe(
			"/api",
		);
		expect(resolveRuntimeApiBase(locationFor("https://uat.bnpi-hris.tech/auth/login"))).toBe(
			"/api",
		);
	});
});
