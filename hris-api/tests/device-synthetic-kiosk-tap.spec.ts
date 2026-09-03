import { expect } from "chai";
import express from "express";
import request from "supertest";

import { controller } from "../app/device/device.controller";

describe("device synthetic kiosk login tap", () => {
	const buildApp = (prisma: any, extras?: { io?: any; role?: string; organizationId?: string }) => {
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as any).organizationId = extras?.organizationId || "org-1";
			(req as any).role = extras?.role || "hris-admin";
			(req as any).io = extras?.io || null;
			next();
		});
		const deviceController = controller(prisma as any);
		app.post("/device/kiosk/synthetic-tap", (req, res, next) =>
			deviceController.createSyntheticKioskLoginTap(req, res, next),
		);
		return app;
	};

	it("rejects non-admin callers", async () => {
		const app = buildApp({}, { role: "hris-employee" });
		const response = await request(app)
			.post("/device/kiosk/synthetic-tap")
			.send({ deviceId: "device-1" })
			.expect(403);
		expect(response.body.message).to.match(/admin/i);
	});

	it("creates a labeled claimable synthetic kiosk tap and emits realtime", async () => {
		let created: any = null;
		const emitted: any[] = [];
		const io = {
			to() {
				return this;
			},
			emit(event: string, payload: any) {
				emitted.push({ event, payload });
			},
		};

		const app = buildApp({
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "Login A",
					address: "10.184.38.167",
					port: 80,
					protocol: "http",
					config: {
						employeeKioskLoginEnabled: true,
						employeeKioskLoginWindowSeconds: 30,
					},
				}),
			},
			employee: {
				findFirst: async () => ({
					id: "emp-1",
					userId: "user-1",
					employeeId: "EMP001",
					deviceEmpId: "1",
					organizationId: "org-1",
				}),
			},
			deviceEvent: {
				create: async ({ data }: any) => {
					created = {
						id: "event-synthetic-1",
						...data,
					};
					return created;
				},
			},
			deviceUser: {
				findFirst: async () => null,
			},
		}, { io });

		const response = await request(app)
			.post("/device/kiosk/synthetic-tap")
			.send({
				deviceId: "device-1",
				employeeId: "emp-1",
				note: "offline playwright inject",
			})
			.expect(201);

		expect(response.body.status).to.equal("success");
		expect(response.body.data.synthetic).to.equal(true);
		expect(response.body.data.physicalDeviceTruth).to.equal(false);
		expect(response.body.data.source).to.equal("EN_SYNTHETIC_KIOSK_TAP");
		expect(response.body.data.persistedSource).to.equal("EN_HCNETSDK_ALARM");
		expect(response.body.data.eventId).to.equal("event-synthetic-1");
		expect(response.body.data.employeeId).to.equal("emp-1");
		expect(response.body.data.userId).to.equal("user-1");
		expect(response.body.data.kioskWindowSeconds).to.equal(30);
		expect(response.body.data.realtimeEmitted).to.equal(true);

		expect(created).to.exist;
		// DB enum currently stores a real DeviceEventSource; synthetic is in payload.
		expect(created.source).to.equal("EN_HCNETSDK_ALARM");
		expect(created.status).to.equal("MATCHED");
		expect(created.eventCategory).to.equal("ATTENDANCE");
		expect(created.eventAction).to.equal("TAP");
		expect(created.payload.synthetic).to.equal(true);
		expect(created.payload.syntheticSource).to.equal("EN_SYNTHETIC_KIOSK_TAP");
		expect(created.payload.physicalDeviceTruth).to.equal(false);

		expect(emitted.length).to.equal(1);
		expect(emitted[0].event).to.equal("device-event:saved");
		expect(emitted[0].payload.eventId).to.equal("event-synthetic-1");
	});

	it("refuses synthetic tap when kiosk login is disabled on the device", async () => {
		const app = buildApp({
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "Main Entrance Device",
					address: "10.184.38.176",
					port: 443,
					protocol: "https",
					config: { employeeKioskLoginEnabled: false },
				}),
			},
		});

		const response = await request(app)
			.post("/device/kiosk/synthetic-tap")
			.send({ deviceId: "device-1", employeeId: "emp-1" })
			.expect(400);

		expect(response.body.message).to.match(/employeeKioskLoginEnabled/i);
	});
});
