import { expect } from "chai";
import fs from "fs";
import path from "path";
import { controller } from "../app/device/device.controller";

describe("device health ZKTeco Linux bridge", () => {
	const originalFetch = global.fetch;
	const originalBridgeStatusUrl = process.env.ZKTECO_BRIDGE_STATUS_URL;
	const originalNodeHostIp = process.env.NODE_HOST_IP;

	afterEach(() => {
		global.fetch = originalFetch;
		if (originalBridgeStatusUrl === undefined) {
			delete process.env.ZKTECO_BRIDGE_STATUS_URL;
		} else {
			process.env.ZKTECO_BRIDGE_STATUS_URL = originalBridgeStatusUrl;
		}
		if (originalNodeHostIp === undefined) {
			delete process.env.NODE_HOST_IP;
		} else {
			process.env.NODE_HOST_IP = originalNodeHostIp;
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

	it("includes device runtime config in saved device events so admin drift checks can honor loopback runtime addresses", async () => {
		const queries: string[] = [];
		let body: any = null;
		const prisma = {
			$queryRaw: async (query: any) => {
				const sql = Array.isArray(query?.strings) ? query.strings.join("") : String(query);
				queries.push(sql);
				if (sql.includes("END AS device")) {
					return [
						{
							id: "event-1",
							organizationId: "org-1",
							deviceId: "device-1",
							deviceUserId: null,
							employeeId: null,
							attendanceId: null,
							eventTime: new Date("2026-07-12T14:08:00.000Z"),
							receivedAt: new Date("2026-07-12T14:08:01.000Z"),
							employeeNo: null,
							source: "EN_HCNETSDK_ALARM",
							status: "IGNORED",
							eventCategory: "USER_MANAGEMENT",
							eventAction: "SYNC_SIGNAL",
							eventLabel: "Device user or biometric operation",
							eventConfidence: "INFERRED",
							eventType: null,
							major: null,
							minor: null,
							doorNo: null,
							verifyMode: null,
							dedupeKey: "event-1",
							payload: { deviceIP: "127.0.0.1" },
							errorMessage: null,
							createdAt: new Date("2026-07-12T14:08:01.000Z"),
							updatedAt: new Date("2026-07-12T14:08:01.000Z"),
							device: {
								id: "device-1",
								name: "Main Entrance Device A",
								address: "192.168.254.189",
								port: 443,
								protocol: "https",
								config: {
									hikvisionRuntimeAddress: "127.0.0.1",
									hikvisionSdkRuntimeAddress: "127.0.0.1",
								},
							},
							deviceUser: null,
							employee: null,
						},
					];
				}
				if (sql.includes("COUNT(*)::bigint AS total")) return [{ total: 1 }];
				return [];
			},
			device: { findFirst: async () => null },
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			query: {
				source: "EN_HCNETSDK_ALARM",
				deviceId: "device-1",
			},
		};
		let statusCode = 0;
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

		await deviceController.getEvents(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(queries.join("\n")).to.include("'config', d.config");
		expect(body.data.events[0].device.config.hikvisionRuntimeAddress).to.equal("127.0.0.1");
		expect(body.data.events[0].device.config.hikvisionSdkRuntimeAddress).to.equal("127.0.0.1");
	});

	it("defaults saved device event sorting to punch eventTime", async () => {
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
		expect(queries[0]).to.include('ORDER BY de."eventTime"');
	});

	it("returns a per-device ZKTeco sync preview with saved, total, and needs-sync counts", async () => {
		process.env.ZKTECO_BRIDGE_STATUS_URL = "http://127.0.0.1:4371/status";
		global.fetch = (async (input: any) => {
			expect(String(input)).to.equal("http://127.0.0.1:4371/preview?deviceIp=10.184.38.9");
			return {
				ok: true,
				status: 200,
				json: async () => ({
					status: "online",
					devices: [
						{
							name: "ZKTeco Device A",
							ip: "10.184.38.9",
							port: 4370,
							connected: true,
							userCount: 14,
							totalEvents: 8410,
							selectedEvents: 1,
							lastSelectedAt: "2026-07-02T10:20:00",
						},
					],
				}),
			} as any;
		}) as any;

		const prisma = {
			device: {
				findMany: async () => [
					{
						id: "device-zkteco-a",
						name: "ZKTeco Device A",
						address: "10.184.38.9",
						port: 4370,
						protocol: "tcp",
						config: { vendor: "ZKTeco" },
					},
				],
			},
			deviceEvent: {
				groupBy: async () => [
					{
						deviceId: "device-zkteco-a",
						source: "ZKTECO_EVENT",
						_count: { _all: 8000 },
					},
				],
				create: async () => {
					throw new Error("sync preview must not create device events");
				},
				update: async () => {
					throw new Error("sync preview must not update device events");
				},
				upsert: async () => {
					throw new Error("sync preview must not upsert device events");
				},
				deleteMany: async () => {
					throw new Error("sync preview must not delete device events");
				},
			},
			attendance: {
				create: async () => {
					throw new Error("sync preview must not create attendance rows");
				},
				update: async () => {
					throw new Error("sync preview must not update attendance rows");
				},
				upsert: async () => {
					throw new Error("sync preview must not upsert attendance rows");
				},
			},
			deviceSyncRun: {
				findFirst: async () => {
					throw new Error("The table `public.device_sync_runs` does not exist in the current database.");
				},
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			query: { deviceId: "device-zkteco-a" },
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

		await deviceController.getDeviceSyncPreview(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.devices[0]).to.include({
			deviceId: "device-zkteco-a",
			vendor: "ZKTeco",
			source: "ZKTECO_EVENT",
			syncedEvents: 8000,
			totalEvents: 8410,
			needsSyncEvents: 410,
			hrisSavedCount: 8000,
			vendorEventCount: 8410,
			vendorUserCount: 14,
			knownSkippedEventCount: 0,
			missingEventCount: 410,
			canStartSync: true,
			syncAction: "zkteco-bridge-sync",
			status: "needs_sync",
		});
	});

	it("returns DB truth and a non-startable row when the ZKTeco bridge URL is not configured", async () => {
		delete process.env.ZKTECO_BRIDGE_STATUS_URL;
		delete process.env.NODE_HOST_IP;
		global.fetch = (async () => {
			throw new Error("preview should not call fetch without a bridge URL");
		}) as any;

		const prisma = {
			device: {
				findMany: async () => [
					{
						id: "device-zkteco-a",
						name: "ZKTeco Device A",
						address: "10.184.38.9",
						port: 4370,
						protocol: "tcp",
						config: { vendor: "ZKTeco" },
					},
				],
			},
			deviceEvent: {
				groupBy: async () => [
					{
						deviceId: "device-zkteco-a",
						source: "ZKTECO_EVENT",
						_count: { _all: 173614 },
					},
				],
				create: async () => {
					throw new Error("sync preview must not create device events");
				},
				update: async () => {
					throw new Error("sync preview must not update device events");
				},
				upsert: async () => {
					throw new Error("sync preview must not upsert device events");
				},
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			query: { source: "ZKTECO_EVENT" },
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

		await deviceController.getDeviceSyncPreview(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.bridge).to.include({
			ok: false,
			status: "not_configured",
			error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
		});
		expect(body.data.devices[0]).to.include({
			deviceId: "device-zkteco-a",
			hrisSavedCount: 173614,
			vendorEventCount: null,
			missingEventCount: null,
			canStartSync: false,
			syncAction: null,
			status: "source_unavailable",
			error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
		});
	});

	it("uses NODE_HOST_IP as the K3s bridge status URL fallback", async () => {
		delete process.env.ZKTECO_BRIDGE_STATUS_URL;
		process.env.NODE_HOST_IP = "10.184.38.144";
		global.fetch = (async (input: any) => {
			expect(String(input)).to.equal("http://10.184.38.144:4371/preview?deviceIp=10.184.38.9");
			return {
				ok: true,
				status: 200,
				json: async () => ({
					status: "degraded",
					runtime: "project-truth-zkteco-linux-pyzk",
					devices: [
						{
							ip: "10.184.38.9",
							port: 4370,
							totalEvents: 8410,
							selectedEvents: 2,
							userCount: 25,
						},
					],
				}),
			} as any;
		}) as any;

		const prisma = {
			device: {
				findMany: async () => [
					{
						id: "device-zkteco-a",
						name: "ZKTeco Device A",
						address: "10.184.38.9",
						port: 4370,
						protocol: "tcp",
						config: { vendor: "ZKTeco" },
					},
				],
			},
			deviceEvent: {
				groupBy: async () => [
					{
						deviceId: "device-zkteco-a",
						source: "ZKTECO_EVENT",
						_count: { _all: 8400 },
					},
				],
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			query: { deviceId: "device-zkteco-a" },
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

		await deviceController.getDeviceSyncPreview(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.bridge.statusUrl).to.equal("http://10.184.38.144:4371/preview?deviceIp=10.184.38.9");
		expect(body.data.devices[0]).to.include({
			vendorEventCount: 8410,
			vendorUserCount: 25,
			missingEventCount: 10,
			canStartSync: true,
		});
	});

	it("releases a soft-deleted endpoint collision before updating the active device", async () => {
		const updates: any[] = [];
		const prisma = {
			device: {
				findFirst: async (args: any) => {
					if (args.where.id === "device-active") {
						return {
							id: "device-active",
							organizationId: "org-1",
							name: "Lobby",
							address: "a",
							port: 80,
							protocol: "http",
							config: {},
							access: {},
							isDeleted: false,
						};
					}
					if (
						args.where.organizationId === "org-1" &&
						args.where.address === "192.168.8.195" &&
						args.where.port === 80
					) {
						return {
							id: "device-deleted",
							name: "Deleted old endpoint",
							address: "192.168.8.195",
							port: 80,
							isDeleted: true,
						};
					}
					return null;
				},
				update: async (args: any) => {
					updates.push(args);
					if (args.where.id === "device-deleted") {
						return { id: "device-deleted", ...args.data };
					}
					return {
						id: "device-active",
						organizationId: "org-1",
						name: args.data.name,
						address: args.data.address,
						port: args.data.port,
						protocol: args.data.protocol,
						config: args.data.config,
						access: args.data.access,
					};
				},
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			params: { id: "device-active" },
			organizationId: "org-1",
			body: {
				name: "Lobby",
				address: "192.168.8.195",
				port: 80,
				protocol: "http",
				config: { vendor: "Hikvision" },
				access: { username: "admin", password: "password" },
			},
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

		await deviceController.update(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(updates[0]).to.deep.equal({
			where: { id: "device-deleted" },
			data: { address: "deleted:device-deleted:192.168.8.195" },
		});
		expect(updates[1]).to.deep.include({
			where: { id: "device-active" },
		});
		expect(updates[1].data).to.include({
			name: "Lobby",
			address: "192.168.8.195",
			port: 80,
			protocol: "http",
		});
		expect(body.status).to.equal("success");
	});

	it("returns a conflict instead of a 500 when an active device already owns the endpoint", async () => {
		const prisma = {
			device: {
				findFirst: async (args: any) => {
					if (args.where.id === "device-active") {
						return {
							id: "device-active",
							organizationId: "org-1",
							name: "Lobby",
							address: "a",
							port: 80,
							protocol: "http",
							config: {},
							access: {},
							isDeleted: false,
						};
					}
					return {
						id: "device-other",
						name: "Other active endpoint",
						address: "192.168.8.195",
						port: 80,
						isDeleted: false,
					};
				},
				update: async () => {
					throw new Error("active duplicate must not update");
				},
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			params: { id: "device-active" },
			organizationId: "org-1",
			body: {
				name: "Lobby",
				address: "192.168.8.195",
				port: 80,
				protocol: "http",
				config: { vendor: "Hikvision" },
				access: { username: "admin", password: "password" },
			},
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

		await deviceController.update(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(409);
		expect(body.message).to.equal("Another device already uses this address and port.");
		expect(JSON.stringify(body)).to.include("address");
		expect(JSON.stringify(body)).to.include("port");
	});

	it("soft-deletes devices so historical device events remain queryable", async () => {
		const calls: any[] = [];
		const prisma = {
			device: {
				findFirst: async () => ({
					id: "device-with-events",
					organizationId: "org-1",
					address: "10.184.38.9",
					isDeleted: false,
				}),
				update: async (args: any) => {
					calls.push(args);
					return { id: "device-with-events", isDeleted: true };
				},
				delete: async () => {
					throw new Error("device delete must be a soft delete");
				},
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			params: { id: "device-with-events" },
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

		await deviceController.remove(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(calls[0]).to.deep.equal({
			where: { id: "device-with-events" },
			data: {
				isDeleted: true,
				address: "deleted:device-with-events:10.184.38.9",
			},
		});
		expect(body.status).to.equal("success");
	});

	it("previews saved device event reset scope without deleting records", async () => {
		let deleteCalled = false;
		const prisma = {
			deviceEvent: {
				findMany: async (args: any) => {
					expect(args.where).to.deep.include({
						organizationId: "org-1",
						deviceId: "device-hikvision",
						source: "HIKVISION_CALLBACK",
					});
					return [
						{
							id: "event-1",
							organizationId: "org-1",
							deviceId: "device-hikvision",
							attendanceId: "attendance-1",
						},
					];
				},
				deleteMany: async () => {
					deleteCalled = true;
					return { count: 1 };
				},
			},
			device: {
				findMany: async () => [{ id: "device-hikvision", name: "Main Entrance Device" }],
			},
			attendance: {
				findMany: async () => [{ id: "attendance-1" }],
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			role: "hris-admin",
			body: {
				deviceId: "device-hikvision",
				source: "HIKVISION_CALLBACK",
				from: "2026-06-23",
				to: "2026-06-23",
				execute: false,
			},
			query: {},
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

		await deviceController.resetDeviceEvents(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.mode).to.equal("preview");
		expect(body.data.counts).to.deep.include({
			devices: 1,
			deviceEvents: 1,
			linkedAttendance: 1,
		});
		expect(deleteCalled).to.equal(false);
	});

	it("rejects saved device event reset for non-admin roles", async () => {
		const prisma = {
			deviceEvent: {
				findMany: async () => {
					throw new Error("non-admin reset must not read scope");
				},
			},
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			role: "hris-hr-manager",
			body: { execute: false },
			query: {},
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

		await deviceController.resetDeviceEvents(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(403);
	});

	it("exports a backup before deleting scoped saved device events", async () => {
		const deleted: string[] = [];
		const runtimeRoot = path.resolve(process.cwd(), "..", ".runtime", "backups");
		const beforeDirs = fs.existsSync(runtimeRoot) ? new Set(fs.readdirSync(runtimeRoot)) : new Set<string>();
		const prisma = {
			deviceEvent: {
				findMany: async () => [
					{
						id: "event-1",
						organizationId: "org-1",
						deviceId: "device-hikvision",
						attendanceId: "attendance-1",
						source: "HIKVISION_CALLBACK",
					},
				],
				deleteMany: async (args: any) => {
					expect(args.where).to.deep.include({
						organizationId: "org-1",
						deviceId: "device-hikvision",
					});
					deleted.push("deviceEvent");
					return { count: 1 };
				},
				count: async () => 0,
			},
			device: {
				findMany: async () => [{ id: "device-hikvision", name: "Main Entrance Device" }],
			},
			attendance: {
				findMany: async () => [{ id: "attendance-1" }],
				deleteMany: async () => {
					deleted.push("attendance");
					return { count: 1 };
				},
				count: async () => 0,
			},
			$transaction: async (fn: any) => fn(prisma),
			employee: { findFirst: async () => null },
		};
		const deviceController = controller(prisma as any);
		const req = {
			organizationId: "org-1",
			role: "hris-admin",
			body: {
				deviceId: "device-hikvision",
				source: "HIKVISION_CALLBACK",
				includeLinkedAttendance: true,
				execute: true,
			},
			query: {},
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

		await deviceController.resetDeviceEvents(req as any, res as any, (() => undefined) as any);

		expect(statusCode).to.equal(200);
		expect(body.data.mode).to.equal("executed");
		expect(deleted).to.deep.equal(["attendance", "deviceEvent"]);
		expect(fs.existsSync(path.join(body.data.backupDir, "manifest.json"))).to.equal(true);
		expect(fs.existsSync(path.join(body.data.backupDir, "device-events.json"))).to.equal(true);
		expect(fs.existsSync(path.join(body.data.backupDir, "linked-attendance.json"))).to.equal(true);
		const afterDirs = fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot) : [];
		const created = afterDirs.filter((name) => !beforeDirs.has(name) && name.startsWith("device-events-reset-"));
		expect(created.length).to.be.greaterThan(0);
	});
});
