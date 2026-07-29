import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRuntimeApiBase } from "./runtime-api-base";

describe("getRuntimeApiBase", () => {
	const originalWindow = globalThis.window;

	beforeEach(() => {
		// Local .env sets VITE_API_BASE_URL; clear so host routing is tested.
		vi.stubEnv("VITE_API_BASE_URL", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		if (originalWindow) {
			// @ts-expect-error restore
			globalThis.window = originalWindow;
		}
	});

	const mockHost = (hostname: string, port = "", protocol = "https:") => {
		// @ts-expect-error test mock
		globalThis.window = {
			location: {
				hostname,
				host: port ? `${hostname}:${port}` : hostname,
				port,
				protocol,
				origin: port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`,
			},
		};
	};

	it("does not send bnpi-hris.dev browser traffic to Cloud Run", () => {
		mockHost("dev.bnpi-hris.tech");
		const base = getRuntimeApiBase();
		expect(base).not.toContain("run.app");
		expect(base).toBe("https://dev.bnpi-hris.tech");
	});

	it("maps uat.bnpi-hris.tech to same origin not Cloud Run", () => {
		mockHost("uat.bnpi-hris.tech");
		expect(getRuntimeApiBase()).toBe("https://uat.bnpi-hris.tech");
		expect(getRuntimeApiBase()).not.toContain("run.app");
	});

	it("maps app.bnpi-hris.tech to same origin not Cloud Run", () => {
		mockHost("app.bnpi-hris.tech");
		expect(getRuntimeApiBase()).toBe("https://app.bnpi-hris.tech");
		expect(getRuntimeApiBase()).not.toContain("run.app");
	});

	it("uses localhost:3001 for local dev", () => {
		mockHost("localhost", "5175", "http:");
		expect(getRuntimeApiBase()).toBe("http://localhost:3001");
	});

	it("honors VITE_API_BASE_URL override", () => {
		vi.stubEnv("VITE_API_BASE_URL", "https://custom.example/api");
		mockHost("dev.bnpi-hris.tech");
		expect(getRuntimeApiBase()).toBe("https://custom.example/api");
	});

	it("maps LAN DEV app port 3100 to API 3101", () => {
		mockHost("10.184.37.19", "3100", "http:");
		expect(getRuntimeApiBase()).toBe("http://10.184.37.19:3101");
	});

	it("keeps Firebase DEV host on legacy Cloud Run only", () => {
		mockHost("hris-workforce-dev-20260416-app.web.app");
		expect(getRuntimeApiBase()).toContain("run.app");
		expect(getRuntimeApiBase()).toContain("hris-api-dev");
	});
});
