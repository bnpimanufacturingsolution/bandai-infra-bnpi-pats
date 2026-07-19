import { expect } from "chai";
import { controller as callbackController } from "../app/hikvision/controller/callback.controller";

const createResponse = () => {
	let statusCode = 0;
	let body: any = null;
	return {
		res: {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(payload: any) {
				body = payload;
				return this;
			},
		},
		get statusCode() {
			return statusCode;
		},
		get body() {
			return body;
		},
	};
};

describe("Hikvision callback controller", () => {
	it("saves HTTP host XML callbacks by observed ipAddress without requiring deviceId", async () => {
		const createdEvents: any[] = [];
		const updatedEvents: any[] = [];
		const device = {
			id: "device-1",
			organizationId: "org-1",
			name: "Main Entrance Device",
			address: "10.184.37.139",
			port: 80,
			protocol: "http",
			config: {},
		};
		const prisma = {
			device: {
				findFirst: async (input: any) => {
					if (input.where?.address === "10.184.37.139") return device;
					if (input.where?.id === "device-1") return device;
					return null;
				},
			},
			deviceEvent: {
				findFirst: async () => null,
				findUnique: async (input: any) =>
					createdEvents.find((event) => event.id === input.where.id) || null,
				findMany: async () => [],
				create: async (input: any) => {
					const row = {
						id: "event-1",
						receivedAt: new Date("2026-07-08T02:04:13.000Z"),
						createdAt: new Date("2026-07-08T02:04:13.000Z"),
						updatedAt: new Date("2026-07-08T02:04:13.000Z"),
						...input.data,
					};
					createdEvents.push(row);
					return row;
				},
				update: async (input: any) => {
					updatedEvents.push(input);
					const row = { ...createdEvents[0], ...input.data };
					createdEvents[0] = row;
					return row;
				},
			},
			deviceUser: {
				findFirst: async () => null,
			},
			employee: {
				findFirst: async () => null,
			},
		};
		const response = createResponse();
		const request = {
			body: `
				<EventNotificationAlert>
					<ipAddress>10.184.37.139</ipAddress>
					<dateTime>2026-07-08T10:04:12+08:00</dateTime>
					<AccessControllerEvent>
						<major>5</major>
						<minor>38</minor>
						<employeeNoString>1</employeeNoString>
						<currentVerifyMode>faceOrFpOrCardOrPw</currentVerifyMode>
						<serialNo>997</serialNo>
					</AccessControllerEvent>
				</EventNotificationAlert>
			`,
			query: {},
			get: () => "application/xml",
			io: null,
		} as any;

		await callbackController(prisma as any).handleCallback(
			request,
			response.res as any,
			(() => undefined) as any,
		);

		expect(response.statusCode).to.equal(200);
		expect(response.body.data).to.include({
			received: true,
			matched: false,
			employeeNo: "1",
			reason: "employee_not_found",
			eventId: "event-1",
		});
		expect(createdEvents[0]).to.include({
			organizationId: "org-1",
			deviceId: "device-1",
			employeeNo: "1",
			source: "HIKVISION_CALLBACK",
			status: "UNMATCHED",
		});
		expect(createdEvents[0].eventTime.toISOString()).to.equal("2026-07-08T02:04:12.000Z");
		expect(updatedEvents[0].data).to.include({
			status: "UNMATCHED",
			errorMessage: "employee_not_found",
		});
	});

	it("applies plain employeeNo on USER_CREATED SDK callback via enrollment fast path", async () => {
		const createdEvents: any[] = [];
		const updatedEvents: any[] = [];
		const createdUsers: any[] = [];
		const device = {
			id: "device-1",
			organizationId: "org-1",
			name: "TEST A",
			address: "192.168.254.102",
			port: 80,
			protocol: "http",
			config: {},
		};
		const prisma = {
			device: {
				findFirst: async (input: any) => {
					if (input.where?.id === "device-1") return device;
					if (input.where?.address === "192.168.254.102") return device;
					return null;
				},
			},
			deviceEvent: {
				findFirst: async () => null,
				findUnique: async (input: any) =>
					createdEvents.find((event) => event.id === input.where.id) || null,
				findMany: async () => [],
				create: async (input: any) => {
					const row = {
						id: "event-enroll-1",
						receivedAt: new Date("2026-07-19T02:04:13.000Z"),
						createdAt: new Date("2026-07-19T02:04:13.000Z"),
						updatedAt: new Date("2026-07-19T02:04:13.000Z"),
						...input.data,
					};
					createdEvents.push(row);
					return row;
				},
				update: async (input: any) => {
					updatedEvents.push(input);
					const idx = createdEvents.findIndex((e) => e.id === input.where.id);
					const base = idx >= 0 ? createdEvents[idx] : createdEvents[0];
					const row = {
						...base,
						...input.data,
						device: {
							id: device.id,
							name: device.name,
							address: device.address,
							port: device.port,
							protocol: device.protocol,
						},
						deviceUser: createdUsers[0] || null,
					};
					if (idx >= 0) createdEvents[idx] = row;
					else createdEvents[0] = row;
					return row;
				},
			},
			deviceUser: {
				findFirst: async () => null,
				create: async (input: any) => {
					const row = { id: "du-14", ...input.data };
					createdUsers.push(row);
					return row;
				},
			},
			devicePersonToken: {
				findFirst: async () => null,
			},
			employee: {
				findFirst: async (input: any) => {
					const or = input?.where?.OR || [];
					const hit = or.some(
						(clause: any) =>
							clause.deviceEmpId === "14" || clause.employeeId === "14",
					);
					if (!hit) return null;
					return {
						id: "emp-hris-14",
						employeeId: "BNPI-014",
						deviceEmpId: "14",
						person: { personalInfo: { firstName: "Panel", lastName: "User" } },
					};
				},
				findUnique: async (input: any) => {
					if (input.where?.id !== "emp-hris-14") return null;
					return {
						id: "emp-hris-14",
						employeeId: "BNPI-014",
						deviceEmpId: "14",
						person: { personalInfo: { firstName: "Panel", lastName: "User" } },
					};
				},
			},
		};
		const response = createResponse();
		const request = {
			body: {
				source: "EN_HCNETSDK_ALARM",
				deviceId: "device-1",
				deviceIP: "192.168.254.102",
				time: "2026-07-19T10:04:12+08:00",
				employeeNo: "14",
				employeeNoString: "14",
				major: 3,
				minor: 0,
				actionCode: "MINOR_ADD_USER_INFO",
				eventKind: "biometric_user_management",
				serialNo: "9001",
			},
			query: {},
			get: () => "application/json",
			io: {
				to: () => ({ emit: () => undefined }),
				emit: () => undefined,
			},
		} as any;

		await callbackController(prisma as any).handleCallback(
			request,
			response.res as any,
			(() => undefined) as any,
		);

		expect(response.statusCode).to.equal(200);
		expect(response.body.data).to.include({
			received: true,
			reason: "enrollment_identity_fast_path",
			employeeNo: "14",
			employeeId: "emp-hris-14",
			deviceUserId: "du-14",
			enrollmentIdentityPath: "plain_immediate",
		});
		expect(createdUsers[0]).to.include({
			vendorUserId: "14",
			employeeNo: "14",
			employeeId: "emp-hris-14",
		});
		const identityUpdate = updatedEvents.find(
			(item) => item.data?.employeeNo === "14" && item.data?.status === "MATCHED",
		);
		expect(identityUpdate).to.exist;
		expect(identityUpdate.data).to.include({
			employeeId: "emp-hris-14",
			deviceUserId: "du-14",
			status: "MATCHED",
		});
	});

	it("previews SDK alarm callback payloads without persisting a DeviceEvent", async () => {
		const createdEvents: any[] = [];
		const device = {
			id: "device-1",
			organizationId: "org-1",
			name: "Main Entrance Device",
			address: "10.184.37.139",
			port: 80,
			protocol: "http",
			config: {},
		};
		const prisma = {
			device: {
				findFirst: async (input: any) => {
					if (input.where?.id === "device-1") return device;
					if (input.where?.address === "10.184.37.139") return device;
					return null;
				},
			},
			deviceEvent: {
				findFirst: async () => null,
				findUnique: async () => null,
				findMany: async () => [],
				create: async (input: any) => {
					createdEvents.push(input.data);
					return { id: "event-1", ...input.data };
				},
				update: async () => {
					throw new Error("preview should not update");
				},
			},
			deviceUser: { findFirst: async () => null },
			employee: { findFirst: async () => null },
		};
		const response = createResponse();
		const request = {
			body: {
				source: "EN_HCNETSDK_ALARM",
				deviceId: "device-1",
				deviceIP: "10.184.37.139",
				time: "2026-07-09T10:04:12+08:00",
				employeeNo: "1",
				major: 5,
				minor: 75,
				serialNo: "1201",
				dryRun: true,
			},
			query: { preview: "true" },
			get: () => "application/json",
			io: null,
		} as any;

		await callbackController(prisma as any).handleCallback(
			request,
			response.res as any,
			(() => undefined) as any,
		);

		expect(response.statusCode).to.equal(200);
		expect(response.body.data).to.deep.include({
			received: true,
			preview: true,
			matched: true,
			wouldPersistDeviceEvent: true,
			wouldProcessAttendance: true,
			employeeNo: "1",
			source: "EN_HCNETSDK_ALARM",
		});
		expect(createdEvents).to.deep.equal([]);
	});
});
