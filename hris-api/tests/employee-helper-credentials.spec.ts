import { expect } from "chai";
import { createEmployeeHelpers } from "../helper/employee.helper";

describe("createEmployeeHelpers.generateUserCredentials", () => {
	const loggerStub = {
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
		debug: () => undefined,
	} as any;

	it("uses canonical default password format with surname spaces removed", () => {
		const helpers = createEmployeeHelpers({} as any, loggerStub);
		const currentYear = new Date().getFullYear();
		const result = helpers.generateUserCredentials(
			{
				organizationId: "org-1",
				contactInfo: { email: "maria.lopez7480@example.com" },
				personalInfo: { firstName: "Maria", lastName: "Dela Cruz" },
			},
			{ employeeId: "EMP3004" },
		);

		expect(result.password).to.equal(`delacruzEMP3004!${currentYear}`);
	});

	it("marks linked user device metadata enrolled when employee has a biometric user id", async () => {
		let updatedUserPayload: any = null;
		const prismaStub = {
			employee: {
				findUnique: async () => ({
					id: "emp-db-1",
					employeeId: "EMP3004",
					deviceEmpId: "BIO3004",
					userId: "user-1",
					role: "hris-employee",
					isManager: false,
					isHrManager: false,
					workforceSource: "DIRECT",
					department: { id: "dept-1", name: "Operations", code: "OPS", managerId: null },
					section: null,
					position: { id: "pos-1", title: "Staff", code: "STF" },
					level: null,
					_count: { directReports: 0 },
					reportTo: null,
					person: { personalInfo: { firstName: "Maria", lastName: "Lopez" } },
					agency: null,
				}),
			},
			user: {
				findUnique: async () => ({
					metadata: {
						device: {
							access: {
								deviceId: "device-1",
								status: "unenrolled",
							},
						},
					},
				}),
				update: async (payload: any) => {
					updatedUserPayload = payload;
				},
			},
		};
		const helpers = createEmployeeHelpers(prismaStub as any, loggerStub);

		await helpers.syncUserMetadataFromEmployee("user-1", "emp-db-1", {} as any);

		expect(updatedUserPayload.data.metadata.device.access).to.deep.include({
			deviceId: "device-1",
			empId: "BIO3004",
			status: "enrolled",
		});
	});
});
