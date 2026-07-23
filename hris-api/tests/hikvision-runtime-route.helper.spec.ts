import { expect } from "chai";
import { resolveHikvisionRuntimeRoute } from "../helper/hikvision-runtime-route.helper";

describe("Hikvision runtime route", () => {
	it("routes a Windows-host API through the VM reverse API and permits the documented alias fallback", () => {
		const route = resolveHikvisionRuntimeRoute({
			env: {},
			platform: "win32",
			isContainer: false,
		});

		expect(route).to.deep.include({
			location: "windows-host",
			commandTransport: "ssh",
			apiBase: "http://127.0.0.1:53001",
			allowCloudflareSshFallback: true,
		});
	});

	it("runs directly with no SSH when the built API runs on the native VM host", () => {
		const route = resolveHikvisionRuntimeRoute({
			env: { PORT: "3301" },
			platform: "linux",
			isContainer: false,
		});

		expect(route).to.deep.include({
			location: "vm-host",
			commandTransport: "local",
			apiBase: "http://127.0.0.1:3301",
			allowCloudflareSshFallback: false,
		});
	});

	it("keeps K3s DEV control inside the VM and never falls back through Cloudflare", () => {
		const route = resolveHikvisionRuntimeRoute({
			env: {
				APP_ENV: "dev",
				KUBERNETES_SERVICE_HOST: "10.43.0.1",
			},
			platform: "linux",
			isContainer: true,
		});

		expect(route).to.deep.include({
			location: "vm-container",
			commandTransport: "ssh",
			apiBase: "http://127.0.0.1:3101",
			allowCloudflareSshFallback: false,
		});
	});

	it("maps VM-container API bases per environment", () => {
		for (const [appEnv, apiBase] of [
			["prod", "http://127.0.0.1:3001"],
			["uat", "http://127.0.0.1:3201"],
		] as const) {
			const route = resolveHikvisionRuntimeRoute({
				env: { APP_ENV: appEnv },
				platform: "linux",
				isContainer: true,
			});
			expect(route.apiBase).to.equal(apiBase);
		}
	});

	it("falls back to the environment port when a configured container port is invalid", () => {
		const route = resolveHikvisionRuntimeRoute({
			env: {
				APP_ENV: "dev",
				PROJECT_TRUTH_HIKVISION_VM_API_PORT: "not-a-port",
			},
			platform: "linux",
			isContainer: true,
		});
		expect(route.apiBase).to.equal("http://127.0.0.1:3101");
	});

	it("honors an explicit location and API base without trailing slash", () => {
		const route = resolveHikvisionRuntimeRoute({
			env: {
				PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION: "vm-host",
				PROJECT_TRUTH_HIKVISION_VM_API_BASE: "http://127.0.0.1:4101/",
			},
			platform: "linux",
			isContainer: true,
		});

		expect(route.location).to.equal("vm-host");
		expect(route.commandTransport).to.equal("local");
		expect(route.apiBase).to.equal("http://127.0.0.1:4101");
	});

	it("fails closed for an unknown explicit runtime location", () => {
		expect(() =>
			resolveHikvisionRuntimeRoute({
				env: { PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION: "somewhere" },
				platform: "linux",
				isContainer: false,
			}),
		).to.throw("Invalid PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION");
	});
});
