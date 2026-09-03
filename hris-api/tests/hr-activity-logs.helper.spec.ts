import { expect } from "chai";
import { buildHrAuditFeed } from "../helper/hr-audit-logs.helper";

type SeedState = {
	auditLogs: any[];
};

const createPrismaMock = (seed: Partial<SeedState> = {}) => {
	const state: SeedState = {
		auditLogs: seed.auditLogs || [],
	};

	const prisma: any = {
		auditLogging: {
			findMany: async (args: any) => state.auditLogs,
		},
	};

	return { prisma };
};

describe("buildHrAuditFeed", () => {
	it("returns only CUD audit rows for sensitive HR resources", async () => {
		const { prisma } = createPrismaMock({
			auditLogs: [
				{
					id: "audit-1",
					employeeId: "emp-1",
					type: "CREATE",
					severity: "MEDIUM",
					entity: { type: "Attendance", id: "attendance-1" },
					description: "Created attendance record",
					payload: { resource: "attendance", originalEntityId: "attendance-1" },
					metadata: { path: "/api/attendance", method: "POST" },
					timestamp: new Date("2026-06-05T12:00:00.000Z"),
					employee: {
						person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
						role: "hris-hr-manager",
					},
				},
				{
					id: "audit-2",
					employeeId: "emp-1",
					type: "UPDATE",
					severity: "HIGH",
					entity: { type: "PayrollPeriod", id: "payroll-1" },
					description: "Updated payroll period",
					payload: { resource: "payrollperiod", originalEntityId: "payroll-1" },
					metadata: { path: "/api/payrollperiod/1", method: "PATCH" },
					timestamp: new Date("2026-06-06T12:00:00.000Z"),
				},
				{
					id: "audit-3",
					employeeId: "emp-2",
					type: "DELETE",
					severity: "CRITICAL",
					entity: { type: "Employee", id: "employee-1" },
					description: "Deleted employee record",
					payload: { resource: "employee", originalEntityId: "employee-1" },
					metadata: { path: "/api/employee/1", method: "DELETE" },
					timestamp: new Date("2026-06-07T12:00:00.000Z"),
				},
				{
					id: "audit-4",
					employeeId: "emp-3",
					type: "LOGIN",
					severity: "LOW",
					entity: { type: "User", id: "user-1" },
					description: "User logged in",
					payload: { resource: "auth", originalEntityId: "user-1" },
					metadata: { path: "/api/auth/login", method: "POST" },
					timestamp: new Date("2026-06-08T12:00:00.000Z"),
				},
				{
					id: "audit-5",
					employeeId: "emp-4",
					type: "CREATE",
					severity: "LOW",
					entity: { type: "Guide", id: "guide-1" },
					description: "Created guide",
					payload: { resource: "guide", originalEntityId: "guide-1" },
					metadata: { path: "/api/guide", method: "POST" },
					timestamp: new Date("2026-06-09T12:00:00.000Z"),
				},
			],
		});

		const result = await buildHrAuditFeed(prisma, {
			organizationId: "org-1",
			page: 1,
			limit: 10,
			sort: "timestamp",
			order: "desc",
		});

		expect(result.auditLoggings.length).to.equal(3);
		expect(result.total).to.equal(3);
		expect(result.auditLoggings.map((item) => item.type)).to.deep.equal([
			"DELETE",
			"UPDATE",
			"CREATE",
		]);
		expect(result.auditLoggings.every((item) => item.payload?.resource !== "guide")).to.equal(
			true,
		);
	});

	it("scopes audit logs through the employee relation instead of a direct organizationId column", async () => {
		let auditWhere: any;
		const prisma: any = {
			auditLogging: {
				findMany: async (args: any) => {
					auditWhere = args?.where;
					return [];
				},
			},
		};

		await buildHrAuditFeed(prisma, {
			organizationId: "org-1",
			page: 1,
			limit: 10,
		});

		expect(auditWhere).to.have.nested.property("employee.is.organizationId", "org-1");
		expect(auditWhere).to.not.have.property("organizationId");
	});

	it("filters by audit type and severity", async () => {
		const { prisma } = createPrismaMock({
			auditLogs: [
				{
					id: "audit-1",
					employeeId: "emp-1",
					type: "UPDATE",
					severity: "HIGH",
					entity: { type: "Timesheet", id: "timesheet-1" },
					description: "Updated timesheet",
					payload: { resource: "timesheet", originalEntityId: "timesheet-1" },
					timestamp: new Date("2026-06-05T12:00:00.000Z"),
				},
				{
					id: "audit-2",
					employeeId: "emp-1",
					type: "DELETE",
					severity: "LOW",
					entity: { type: "Timesheet", id: "timesheet-2" },
					description: "Deleted timesheet",
					payload: { resource: "timesheet", originalEntityId: "timesheet-2" },
					timestamp: new Date("2026-06-06T12:00:00.000Z"),
				},
			],
		});

		const result = await buildHrAuditFeed(prisma, {
			organizationId: "org-1",
			page: 1,
			limit: 10,
			type: "UPDATE",
			severity: "HIGH",
		});

		expect(result.auditLoggings.length).to.equal(1);
		expect(result.auditLoggings[0].type).to.equal("UPDATE");
		expect(result.auditLoggings[0].severity).to.equal("HIGH");
	});
});
