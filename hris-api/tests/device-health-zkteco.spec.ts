import { expect } from "chai";
import { controller } from "../app/device/device.controller";

describe("device health ZKTeco Linux bridge", () => {
	const originalFetch = global.fetch;
	const originalBridgeStatusUrl = process.env.ZKTECO_BRIDGE_STATUS_URL;

	afterEach(() => {
		global.fetch = originalFetch;
		if (originalBridgeStatusUrl === undefined) {
			delete process.env.ZKTECO_BRIDGE_STATUS_URL;
		} else {
			process.env.ZKTECO_BRIDGE_STATUS_URL = originalBridgeStatusUrl;
		}
	});

	it("uses the configured ZKTeco Linux bridge status and never returns Hikvision listener state for ZKTeco devices", async () => {
		process.env.ZKTECO_BRIDGE_STATUS_URL = "http://127.0.0.1:4371/status";
		global.fetch = (async () =>
			({
				ok: true,
				status: 200,
				json: async () => ({
					service: "project-truth-zkteco-linux-pyzk-bridge",
					runtime: "project-truth-zkteco-linux-pyzk",
					status: "online",
					configuredDevices: 1,
				 connectedDevices: 1,
					lastEventAt: "2026-06-26T00:00:00.000Z",
					devices: [
						{
							ip: "127.0.0.1",
							port: 9,
							connected: true,
							lastEventAt: "2026-06-26T00:00:00.000Z",
						},
					],
				}),
			}) as any) as any;

		const prisma = {
			device: {
				findFirst: async () => ({
					id: "device-zkteco",
					name: "ZKTeco Device 127.0.0.1",
					address: "127.0.0.1",
					port: 9,
					protocol: "tcp",
					config: { vendor: "ZKTeco" },
					access: {},
					updatedAt: new Date("2026-06-26T00:00:00.000Z"),
				}),
			},
			deviceEvent: {
				findFirst: async () => ({
					id: "event-1",
					status: "MATCHED",
					eventTime: new Date("2026-06-26T00:00:00.000Z"),
					receivedAt: new Date("2026-06-26T00:00:01.000Z"),
					employeeNo: "1",
					errorMessage: null,
				}),
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			params: { id: "device-zkteco" },
			organizationId: "org-1",
		};
		let statusCode = 0;
		let body: any = null;
		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(payload: any) {
				body = payload;
				return this;
			},
		};

		await deviceController.getDeviceHealth(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.checks).to.have.property("zktecoBridge");
		expect(body.data.checks.zktecoBridge.runtime).to.equal("project-truth-zkteco-linux-pyzk");
		expect(body.data.checks.zktecoBridge.connectedDevices).to.equal(1);
		expect(body.data.checks.lastZktecoEvent.status).to.equal("MATCHED");
		const retiredRuntimeLabel = `Project Truth ZKTeco ${"br" + "idge"}`;
		expect(JSON.stringify(body)).to.not.include(retiredRuntimeLabel);
		expect(body.data.checks).to.not.have.property("alarmDemo");
		expect(body.data.checks).to.not.have.property("hikvisionListener");
	});

	it("does not report a ZKTeco device online when the Linux bridge is up but that device is disconnected", async () => {
		process.env.ZKTECO_BRIDGE_STATUS_URL = "http://127.0.0.1:4371/status";
		global.fetch = (async () =>
			({
				ok: true,
				status: 200,
				json: async () => ({
					status: "online",
					configuredDevices: 1,
					connectedDevices: 0,
					lastEventAt: null,
					devices: [
						{
							ip: "127.0.0.1",
							port: 9,
							connected: false,
							lastError: "connect ECONNREFUSED 127.0.0.1:9",
						},
					],
				}),
			}) as any) as any;

		const prisma = {
			device: {
				findFirst: async () => ({
					id: "device-zkteco",
					name: "ZKTeco Device 127.0.0.1",
					address: "127.0.0.1",
					port: 9,
					protocol: "tcp",
					config: { vendor: "ZKTeco" },
					access: {},
					updatedAt: new Date("2026-06-26T00:00:00.000Z"),
				}),
			},
			deviceEvent: {
				findFirst: async () => null,
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			params: { id: "device-zkteco" },
			organizationId: "org-1",
		};
		let statusCode = 0;
		let body: any = null;
		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(payload: any) {
				body = payload;
				return this;
			},
		};

		await deviceController.getDeviceHealth(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.summary.status).to.not.equal("online");
		expect(body.data.checks.zktecoBridge.device.connected).to.equal(false);
		expect(body.data.checks).to.not.have.property("alarmDemo");
		expect(body.data.checks).to.not.have.property("deviceApi");
	});

	it("filters saved device events by receivedAt when requested by the admin events page", async () => {
		const queries: string[] = [];
		const prisma = {
			$queryRaw: async (query: any) => {
				queries.push(Array.isArray(query?.strings) ? query.strings.join("") : String(query));
				if (queries.length === 1) return [];
				if (queries.length === 2) return [{ total: 0 }];
				return [];
			},
			device: { findFirst: async () => null },
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			query: {
				from: "2026-06-29",
				to: "2026-06-29",
				dateField: "receivedAt",
				source: "ZKTECO_EVENT",
			},
		};
		let statusCode = 0;
		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json() {
				return this;
			},
		};

		await deviceController.getEvents(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(queries.join("\n")).to.include('de."receivedAt"');
		expect(queries.join("\n")).to.not.include('de."eventTime" >=');
	});
});
