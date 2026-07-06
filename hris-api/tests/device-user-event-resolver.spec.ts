import { expect } from "chai";
import { controller as zktecoController } from "../app/zkteco/zkteco.controller";

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

const createZktecoRequest = () =>
	({
		body: {
			deviceId: "device-1",
			employeeNo: "1360",
			time: "2026-07-06T08:00:00+08:00",
			eventType: "AttendanceTransaction",
			serialNo: "resolver-test",
		},
		query: {},
	}) as any;

describe("DeviceEvent employee resolver", () => {
	it("prefers DeviceUser.employeeId over legacy Employee.deviceEmpId", async () => {
		const employeeFinds: any[] = [];
		const updates: any[] = [];
		const prisma = {
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "ZKTeco",
					address: "10.0.0.10",
					port: 4370,
					protocol: "tcp",
					config: { vendor: "ZKTeco" },
				}),
			},
			deviceUser: {
				findFirst: async () => ({
					id: "device-user-1",
					employeeId: "employee-linked",
					status: "ACTIVE",
				}),
			},
			deviceEvent: {
				findFirst: async () => null,
				create: async (input: any) => ({ id: "event-1", ...input.data }),
				update: async (input: any) => {
					updates.push(input);
					return { id: input.where.id, ...input.data };
				},
			},
			employee: {
				findFirst: async (input: any) => {
					employeeFinds.push(input);
					if (input.where.id === "employee-linked") {
						return { id: "employee-linked", organizationId: "org-1", deviceEmpId: "9999" };
					}
					return { id: "employee-legacy", organizationId: "org-1", deviceEmpId: "1360" };
				},
			},
		};
		const response = createResponse();

		await zktecoController(prisma as any).handleEvent(
			createZktecoRequest(),
			response.res as any,
			(() => undefined) as any,
		);

		expect(response.statusCode).to.equal(200);
		expect(employeeFinds[0].where.id).to.equal("employee-linked");
		expect(updates[0].data).to.include({
			status: "MATCHED",
			deviceUserId: "device-user-1",
			employeeId: "employee-linked",
		});
		expect(response.body.data.employeeId).to.equal("employee-linked");
	});

	it("keeps the legacy Employee.deviceEmpId fallback when no DeviceUser is linked", async () => {
		const updates: any[] = [];
		const prisma = {
			device: {
				findFirst: async () => ({
					id: "device-1",
					organizationId: "org-1",
					name: "ZKTeco",
					address: "10.0.0.10",
					port: 4370,
					protocol: "tcp",
					config: { vendor: "ZKTeco" },
				}),
			},
			deviceUser: {
				findFirst: async () => null,
			},
			deviceEvent: {
				findFirst: async () => null,
				create: async (input: any) => ({ id: "event-1", ...input.data }),
				update: async (input: any) => {
					updates.push(input);
					return { id: input.where.id, ...input.data };
				},
			},
			employee: {
				findFirst: async () => ({
					id: "employee-legacy",
					organizationId: "org-1",
					deviceEmpId: "1360",
				}),
			},
		};
		const response = createResponse();

		await zktecoController(prisma as any).handleEvent(
			createZktecoRequest(),
			response.res as any,
			(() => undefined) as any,
		);

		expect(response.statusCode).to.equal(200);
		expect(updates[0].data).to.include({
			status: "MATCHED",
			employeeId: "employee-legacy",
		});
		expect(updates[0].data.deviceUserId).to.equal(null);
		expect(response.body.data.employeeId).to.equal("employee-legacy");
	});
});
