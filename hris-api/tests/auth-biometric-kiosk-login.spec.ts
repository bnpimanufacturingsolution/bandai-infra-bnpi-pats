import { expect } from "chai";
import express from "express";
import request from "supertest";

import {
	buildEmployeeKioskLoginClaimKey,
	controller,
	isClaimableEmployeeKioskLoginEvent,
	normalizeEmployeeKioskLoginConfig,
} from "../app/auth/auth.controller";
import { redisClient } from "../config/redis";

describe("auth biometric kiosk login", () => {
	const originalRedisConnected = redisClient.isClientConnected.bind(redisClient);
	const originalRedisSet = redisClient.set.bind(redisClient);

	const buildApp = (prisma: any) => {
		const app = express();
		const authController = controller(prisma as any);
		app.use(express.json());
		app.post("/auth/biometric/kiosk-login/claim", (req, res, next) =>
			authController.claimBiometricKioskLogin(req as any, res, next),
		);
		return app;
	};

	afterEach(() => {
		(redisClient.isClientConnected as any) = originalRedisConnected;
		(redisClient.set as any) = originalRedisSet;
		delete process.env.JWT_SECRET;
	});

	it("normalizes employee kiosk config defaults from device config JSON", () => {
		expect(normalizeEmployeeKioskLoginConfig({})).to.deep.equal({
			enabled: false,
			windowSeconds: 12,
			appCode: "hris",
			audience: "employee-portal",
		});
	});

	it("identifies fresh matched attendance tap events as kiosk-claimable", () => {
		const now = new Date("2026-07-13T02:00:00.000Z");
		expect(
			isClaimableEmployeeKioskLoginEvent({
				now,
				windowSeconds: 12,
				event: {
					eventTime: new Date("2026-07-13T01:59:55.000Z"),
					eventCategory: "ATTENDANCE",
					eventAction: "TAP",
					status: "MATCHED",
					employeeId: "emp-1",
				},
			}),
		).to.equal(true);
	});

	it("claims a fresh enabled biometric kiosk tap and issues a normal auth session", async () => {
		process.env.JWT_SECRET = "test-secret";
		(redisClient.isClientConnected as any) = () => true;
		(redisClient.set as any) = async (key: string, value: string, options: any) => {
			expect(key).to.equal(buildEmployeeKioskLoginClaimKey("event-1"));
			expect(value).to.contain('"eventId":"event-1"');
			expect(options).to.deep.include({ nx: true });
			return "OK";
		};

		const app = buildApp({
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "Main Entrance Device",
					config: { employeeKioskLoginEnabled: true },
				}),
			},
			deviceEvent: {
				findMany: async () => [
					{
						id: "event-1",
						organizationId: "org-1",
						deviceId: "device-1",
						employeeId: "emp-1",
						eventTime: new Date(),
						eventCategory: "ATTENDANCE",
						eventAction: "TAP",
						status: "MATCHED",
						payload: {},
					},
				],
			},
			employee: {
				findFirst: async () => ({ id: "emp-1", userId: "user-1", organizationId: "org-1" }),
			},
			user: {
				findUnique: async () => ({
					id: "user-1",
					email: "employee@bandai.local",
					userName: "employee",
					status: "active",
					lastLogin: null,
					loginMethod: "email",
					createdAt: new Date(),
					updatedAt: new Date(),
					organizationId: "org-1",
					role: "hris-employee",
					metadata: {},
				}),
				findFirst: async (args: any) => {
					if (args?.where?.id === "user-1") {
						return {
							id: "user-1",
							email: "employee@bandai.local",
							password: null,
							status: "active",
							userName: "employee",
							role: "hris-employee",
							organizationId: "org-1",
							metadata: {},
						};
					}
					return {
						id: "user-1",
						email: "employee@bandai.local",
						userName: "employee",
						status: "active",
						lastLogin: null,
						loginMethod: "email",
						createdAt: new Date(),
						updatedAt: new Date(),
						organizationId: "org-1",
						role: "hris-employee",
						metadata: {},
					};
				},
				update: async () => ({ id: "user-1" }),
			},
			organization: {
				findUnique: async () => ({ id: "org-1", name: "Bandai", code: "BND", branding: {} }),
			},
			person: {
				findMany: async () => [],
			},
		});

		const response = await request(app)
			.post("/auth/biometric/kiosk-login/claim")
			.send({ deviceId: "device-1", appCode: "hris" })
			.expect(200);

		expect(response.body.status).to.equal("success");
		expect(response.body.message).to.equal("Biometric kiosk login successful");
		expect(response.body.data.email).to.equal("employee@bandai.local");
		expect(response.body.data.token).to.be.a("string");
		expect(response.headers["set-cookie"]).to.exist;
	});

	it("claims the latest fresh tap from enabled kiosk devices without a hardcoded device id", async () => {
		process.env.JWT_SECRET = "test-secret";
		(redisClient.isClientConnected as any) = () => true;
		(redisClient.set as any) = async (key: string) => {
			expect(key).to.equal(buildEmployeeKioskLoginClaimKey("event-enabled"));
			return "OK";
		};

		const app = buildApp({
			device: {
				findMany: async () => [
					{
						id: "device-disabled",
						organizationId: "org-1",
						name: "Main Entrance Device",
						config: { employeeKioskLoginEnabled: false },
						isDeleted: false,
					},
					{
						id: "device-enabled",
						organizationId: "org-1",
						name: "Login A",
						config: { employeeKioskLoginEnabled: true, employeeKioskLoginWindowSeconds: 12 },
						isDeleted: false,
					},
				],
			},
			deviceEvent: {
				findMany: async (args: any) => {
					expect(args.where.deviceId.in).to.deep.equal(["device-enabled"]);
					return [
						{
							id: "event-enabled",
							organizationId: "org-1",
							deviceId: "device-enabled",
							employeeId: "emp-1",
							eventTime: new Date(),
							eventCategory: "ATTENDANCE",
							eventAction: "TAP",
							status: "MATCHED",
							payload: {},
						},
					];
				},
			},
			employee: {
				findFirst: async () => ({ id: "emp-1", userId: "user-1", organizationId: "org-1" }),
			},
			user: {
				findUnique: async () => ({
					id: "user-1",
					email: "employee@bandai.local",
					userName: "employee",
					status: "active",
					lastLogin: null,
					loginMethod: "email",
					createdAt: new Date(),
					updatedAt: new Date(),
					organizationId: "org-1",
					role: "hris-employee",
					metadata: {},
				}),
				findFirst: async () => ({
					id: "user-1",
					email: "employee@bandai.local",
					password: null,
					status: "active",
					userName: "employee",
					role: "hris-employee",
					organizationId: "org-1",
					metadata: {},
				}),
				update: async () => ({ id: "user-1" }),
			},
			organization: {
				findUnique: async () => ({ id: "org-1", name: "Bandai", code: "BND", branding: {} }),
			},
			person: {
				findMany: async () => [],
			},
		});

		const response = await request(app)
			.post("/auth/biometric/kiosk-login/claim")
			.send({ appCode: "hris" })
			.expect(200);

		expect(response.body.status).to.equal("success");
		expect(response.body.data.email).to.equal("employee@bandai.local");
	});

	it("rejects biometric kiosk claim when the device is disabled", async () => {
		const app = buildApp({
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "Main Entrance Device",
					config: { employeeKioskLoginEnabled: false },
				}),
			},
		});

		const response = await request(app)
			.post("/auth/biometric/kiosk-login/claim")
			.send({ deviceId: "device-1", appCode: "hris" })
			.expect(403);

		expect(response.body.message).to.contain("disabled");
	});

	it("rejects stale biometric kiosk taps outside the device window", async () => {
		const app = buildApp({
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "Main Entrance Device",
					config: { employeeKioskLoginEnabled: true, employeeKioskLoginWindowSeconds: 12 },
				}),
			},
			deviceEvent: {
				findMany: async () => [
					{
						id: "event-1",
						organizationId: "org-1",
						deviceId: "device-1",
						employeeId: "emp-1",
						eventTime: new Date(Date.now() - 60_000),
						eventCategory: "ATTENDANCE",
						eventAction: "TAP",
						status: "MATCHED",
						payload: {},
					},
				],
			},
		});

		const response = await request(app)
			.post("/auth/biometric/kiosk-login/claim")
			.send({ deviceId: "device-1", appCode: "hris" })
			.expect(404);

		expect(response.body.message).to.contain("No fresh biometric kiosk login tap");
	});

	it("rejects duplicate biometric kiosk tap claims", async () => {
		(redisClient.isClientConnected as any) = () => true;
		(redisClient.set as any) = async () => "";

		const app = buildApp({
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "Main Entrance Device",
					config: { employeeKioskLoginEnabled: true },
				}),
			},
			deviceEvent: {
				findMany: async () => [
					{
						id: "event-1",
						organizationId: "org-1",
						deviceId: "device-1",
						employeeId: "emp-1",
						eventTime: new Date(),
						eventCategory: "ATTENDANCE",
						eventAction: "TAP",
						status: "MATCHED",
						payload: {},
					},
				],
			},
		});

		const response = await request(app)
			.post("/auth/biometric/kiosk-login/claim")
			.send({ deviceId: "device-1", appCode: "hris" })
			.expect(409);

		expect(response.body.message).to.contain("already been used");
	});
});
