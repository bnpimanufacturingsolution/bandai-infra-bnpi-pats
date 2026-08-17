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
					const hit = or.some((clause: any) => {
						const deviceEmp =
							clause.deviceEmpId?.in ||
							(clause.deviceEmpId ? [clause.deviceEmpId] : []);
						const empId =
							clause.employeeId?.in ||
							(clause.employeeId ? [clause.employeeId] : []);
						return (
							deviceEmp.includes("14") ||
							deviceEmp.includes("00014") ||
							empId.includes("14") ||
							empId.includes("00014") ||
							empId.includes("BNPI-014")
						);
					});
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
				// Typed user-management (not major=3 SYNC_SIGNAL) so unit test does not
				// arm multipass logSearch timers. Fast path still runs via eventKind/actionCode.
				major: 0,
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

	const createSerialCollapsePrisma = () => {
		const createdEvents: any[] = [];
		const updatedEvents: any[] = [];
		const device = {
			id: "device-d",
			organizationId: "org-1",
			name: "Main Entrance Device D",
			address: "10.184.37.23",
			port: 80,
			protocol: "http",
			config: {},
		};
		let eventSeq = 0;
		const prisma = {
			device: {
				findFirst: async (input: any) => {
					if (input.where?.id === device.id) return device;
					if (input.where?.address === device.address) return device;
					return null;
				},
			},
			deviceEvent: {
				findFirst: async (input: any) => {
					const dedupeKey = input?.where?.dedupeKey;
					if (dedupeKey) {
						return (
							createdEvents.find(
								(event) =>
									event.organizationId === input.where.organizationId &&
									event.dedupeKey === dedupeKey,
							) || null
						);
					}
					return null;
				},
				findUnique: async (input: any) =>
					createdEvents.find((event) => event.id === input.where.id) || null,
				findMany: async (input: any) => {
					const start = input?.where?.eventTime?.gte
						? new Date(input.where.eventTime.gte).getTime()
						: null;
					const end = input?.where?.eventTime?.lte
						? new Date(input.where.eventTime.lte).getTime()
						: null;
					return createdEvents
						.filter((event) => {
							if (input?.where?.organizationId && event.organizationId !== input.where.organizationId) {
								return false;
							}
							if (input?.where?.deviceId && event.deviceId !== input.where.deviceId) {
								return false;
							}
							if (start !== null && new Date(event.eventTime).getTime() < start) {
								return false;
							}
							if (end !== null && new Date(event.eventTime).getTime() > end) {
								return false;
							}
							return true;
						})
						.sort(
							(left, right) =>
								new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime(),
						);
				},
				create: async (input: any) => {
					eventSeq += 1;
					const row = {
						id: `event-${eventSeq}`,
						receivedAt: new Date(`2026-08-17T08:11:0${eventSeq}.000Z`),
						createdAt: new Date("2026-08-17T08:11:00.000Z"),
						updatedAt: new Date("2026-08-17T08:11:00.000Z"),
						...input.data,
					};
					createdEvents.push(row);
					return row;
				},
				update: async (input: any) => {
					updatedEvents.push(input);
					const idx = createdEvents.findIndex((event) => event.id === input.where.id);
					const base = idx >= 0 ? createdEvents[idx] : createdEvents[0];
					const row = { ...base, ...input.data };
					if (idx >= 0) createdEvents[idx] = row;
					return row;
				},
			},
			deviceUser: { findFirst: async () => null },
			employee: { findFirst: async () => null },
		};
		return { prisma, device, createdEvents, updatedEvents };
	};

	const postSdkCallback = async (prisma: any, body: Record<string, any>) => {
		const response = createResponse();
		const request = {
			body: {
				source: "EN_HCNETSDK_ALARM",
				deviceId: "device-d",
				deviceIP: "10.184.37.23",
				time: "2026-08-17T16:11:00+08:00",
				major: 3,
				minor: 0,
				...body,
			},
			query: {},
			get: () => "application/json",
			io: null,
		} as any;
		await callbackController(prisma).handleCallback(
			request,
			response.res as any,
			(() => undefined) as any,
		);
		return response;
	};

	it("fills an empty same-serial callback in place instead of inserting a second DeviceEvent", async () => {
		const { prisma, createdEvents, updatedEvents } = createSerialCollapsePrisma();

		const emptyResponse = await postSdkCallback(prisma, {
			employeeNo: "",
			serialNo: "5560",
			eventKind: "acs_event",
		});
		const filledResponse = await postSdkCallback(prisma, {
			employeeNo: "1838",
			serialNo: "5560",
			identitySource: "identity_repost",
			eventKind: "acs_event",
		});

		expect(emptyResponse.statusCode).to.equal(200);
		expect(filledResponse.statusCode).to.equal(200);
		expect(filledResponse.body.data.duplicate).to.equal(true);
		expect(createdEvents).to.have.length(1);
		expect(createdEvents[0]).to.include({
			employeeNo: "1838",
			eventCategory: "RUNTIME",
			eventAction: "SYNC_SIGNAL",
		});
		expect(createdEvents[0].payload).to.include({
			serialNo: "5560",
			employeeNo: "1838",
			identitySource: "identity_repost",
			evidenceSource: "SDK_CALLBACK",
			directDeviceEvidence: true,
		});
		expect(
			updatedEvents.some((item) => item.data?.employeeNo === "1838"),
		).to.equal(true);
	});

	it("keeps the first filled employeeNo when a later identity_repost guesses a different person", async () => {
		const { prisma, createdEvents } = createSerialCollapsePrisma();

		await postSdkCallback(prisma, { employeeNo: "", serialNo: "5560" });
		await postSdkCallback(prisma, { employeeNo: "1838", serialNo: "5560" });
		const third = await postSdkCallback(prisma, {
			employeeNo: "320",
			serialNo: "5560",
			identitySource: "identity_repost",
		});

		expect(third.body.data.duplicate).to.equal(true);
		expect(createdEvents).to.have.length(1);
		expect(createdEvents[0].employeeNo).to.equal("1838");
		expect(createdEvents[0].payload.employeeNo).to.equal("320");
		expect(createdEvents[0].payload.evidenceSource).to.equal("SDK_CALLBACK");
	});

	it("still creates two DeviceEvent rows when ACS serials differ", async () => {
		const { prisma, createdEvents } = createSerialCollapsePrisma();

		await postSdkCallback(prisma, { employeeNo: "1838", serialNo: "5560" });
		await postSdkCallback(prisma, { employeeNo: "320", serialNo: "5561" });

		expect(createdEvents).to.have.length(2);
		expect(createdEvents.map((event) => event.employeeNo)).to.deep.equal([
			"1838",
			"320",
		]);
		expect(createdEvents[0].payload.serialNo).to.equal("5560");
		expect(createdEvents[1].payload.serialNo).to.equal("5561");
		expect(createdEvents[0].payload.directDeviceEvidence).to.equal(true);
		expect(createdEvents[1].payload.evidenceSource).to.equal("SDK_CALLBACK");
	});

	it("does not persist armed-device major=2 minor=38 empty-person ACS exceptions", async () => {
		const { prisma, createdEvents } = createSerialCollapsePrisma();
		const response = await postSdkCallback(prisma, {
			employeeNo: "",
			serialNo: "8550",
			major: 2,
			minor: 38,
			eventKind: "attendance_fingerprint_success",
			actionCode: "MINOR_FINGERPRINT_COMPARE_PASS",
		});

		expect(response.statusCode).to.equal(200);
		expect(response.body.data).to.include({
			received: true,
			persisted: false,
			reason: "acs_exception_not_punch",
		});
		expect(createdEvents).to.have.length(0);
	});
});
