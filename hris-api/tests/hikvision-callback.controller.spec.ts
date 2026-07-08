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
			address: "10.184.38.215",
			port: 80,
			protocol: "http",
			config: {},
		};
		const prisma = {
			device: {
				findFirst: async (input: any) => {
					if (input.where?.address === "10.184.38.215") return device;
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
					<ipAddress>10.184.38.215</ipAddress>
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
});
