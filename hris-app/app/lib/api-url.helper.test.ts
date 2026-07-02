import { describe, expect, it } from "vitest";
import {
	normalizeApiBase,
	normalizeEndpointForBase,
	resolveApiUrl,
	resolveSocketBaseUrl,
} from "./api-url.helper";

describe("api-url helper", () => {
	it("adds /api to base URLs that do not already include it", () => {
		expect(normalizeApiBase("http://localhost:3001", "/api")).toBe(
			"http://localhost:3001/api",
		);
		expect(normalizeApiBase("http://localhost:3001/", "/api")).toBe(
			"http://localhost:3001/api",
		);
	});

	it("preserves API-suffixed base URLs and falls back for blank values", () => {
		expect(normalizeApiBase("https://example.test/api", "/api")).toBe(
			"https://example.test/api",
		);
		expect(normalizeApiBase("   ", "/api")).toBe("/api");
	});

	it("strips /api for socket base URLs", () => {
		expect(resolveSocketBaseUrl("https://example.test/api", "http://fallback")).toBe(
			"https://example.test",
		);
		expect(resolveSocketBaseUrl("/api", "http://127.0.0.1:3100")).toBe(
			"http://127.0.0.1:3100",
		);
		expect(resolveSocketBaseUrl("", "http://fallback")).toBe("http://fallback");
	});

	it("keeps public tunnel socket connections on the app host", () => {
		expect(
			resolveSocketBaseUrl(
				"https://dev-api.bnpi-hris.tech/api",
				"https://dev.bnpi-hris.tech",
			),
		).toBe("https://dev.bnpi-hris.tech");
		expect(
			resolveSocketBaseUrl(
				"https://uat-api.bnpi-hris.tech/api",
				"https://uat.bnpi-hris.tech",
			),
		).toBe("https://uat.bnpi-hris.tech");
		expect(
			resolveSocketBaseUrl(
				"https://api.bnpi-hris.tech/api",
				"https://bnpi-hris.tech",
			),
		).toBe("https://bnpi-hris.tech");
	});

	it("keeps LAN and localhost socket connections on the app host proxy", () => {
		expect(
			resolveSocketBaseUrl("http://10.184.38.138:3101/api", "http://10.184.38.138:3100"),
		).toBe("http://10.184.38.138:3100");
		expect(
			resolveSocketBaseUrl("http://localhost:3201/api", "http://localhost:3200"),
		).toBe("http://localhost:3200");
		expect(
			resolveSocketBaseUrl("http://10.184.38.138:3001/api", "http://10.184.38.144:3000"),
		).toBe("http://10.184.38.138:3001");
	});

	it("normalizes endpoints to avoid duplicate /api/api paths", () => {
		expect(normalizeEndpointForBase("http://localhost:3001/api", "/api/metrics")).toBe(
			"/metrics",
		);
		expect(normalizeEndpointForBase("http://localhost:3001/api", "metrics")).toBe(
			"/metrics",
		);
	});

	it("resolves full API URLs with a single API prefix", () => {
		expect(resolveApiUrl("http://localhost:3001/api", "/api/metrics")).toBe(
			"http://localhost:3001/api/metrics",
		);
		expect(resolveApiUrl("http://localhost:3001/api/", "auth/login")).toBe(
			"http://localhost:3001/api/auth/login",
		);
	});
});
