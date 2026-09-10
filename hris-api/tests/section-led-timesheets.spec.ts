import { controller } from "../app/section/section.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

/**
 * Focused contract for GET /api/section/led-timesheets (leader-scoped read).
 * Covers: employee-context guard, not-a-leader empty result, full roster rows
 * with timesheet nulls, period resolution (explicit id/code + current),
 * and per-employee timesheet map alignment.
 */

describe("Section Controller - getLedTimesheets", () => {
	let sectionController: any;
	let req: Partial<Request> & { organizationId?: string; metadata?: any };
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;

	const mockOrganizationId = "507f1f77bcf86cd799439030";
	const mockEmployeeId = "a00f1f77bcf86cd799439001";
	const mockPeriod = {
		id: "b00f1f77bcf86cd799439002",
		code: "PP-20260811-20260826",
		name: "Period 1 Aug 2026",
		startDate: new Date("2026-08-11T00:00:00Z"),
		endDate: new Date("2026-08-26T00:00:00Z"),
		status: "OPEN",
	};

	const mockMembers = [
		{
			id: "c00f1f77bcf86cd799439101",
			employeeId: "00010",
			section: { id: "d00f1f77bcf86cd799439201", name: "Assembly", code: "ASY" },
			position: { title: "Technician" },
			person: { personalInfo: { firstName: "Zen", lastName: "Andrei" } },
		},
		{
			id: "c00f1f77bcf86cd799439102",
			employeeId: "00062",
			section: { id: "d00f1f77bcf86cd799439201", name: "Assembly", code: "ASY" },
			position: { title: "Operator" },
			person: { personalInfo: { firstName: "Danica", lastName: "Ebreo" } },
		},
	];

	const mockTimesheet = (employeeId: string, overrides: Record<string, any> = {}) => ({
		id: `e00f1f77bcf86cd7994393${employeeId.slice(-1).padStart(2, "0")}`,
		code: `TS-${employeeId}`,
		employeeId,
		payrollPeriodId: mockPeriod.id,
		status: "APPROVED",
		totalDays: 12,
		totalHoursWorked: "96:00",
		totalRegularHours: "88:00",
		totalOvertimeHours: "8:00",
		totalUndertimeHours: "0:00",
		totalLateHours: "2:00",
		totalEarlyOutHours: "0:00",
		submittedAt: new Date("2026-08-26T02:00:00Z"),
		approvedAt: new Date("2026-08-26T03:00:00Z"),
		approvalDate: new Date("2026-08-26T03:00:00Z"),
		updatedAt: new Date("2026-08-26T03:00:00Z"),
		...overrides,
	});

	beforeEach(() => {
		prisma = {
			sectionLineLeader: {
				findMany: async () => [{ sectionId: "d00f1f77bcf86cd799439201" }],
			},
			section: {
				findMany: async () => [
					{ id: "d00f1f77bcf86cd799439201", name: "Assembly", code: "ASY" },
				],
			},
			employee: {
				findMany: async () => mockMembers,
			},
			payrollPeriod: {
				findFirst: async () => mockPeriod,
			},
			timesheet: {
				findFirst: async () => null,
				findMany: async () => [
					mockTimesheet(mockMembers[0].id),
				],
			},
		};

		sectionController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			organizationId: mockOrganizationId,
			metadata: { employee: { id: mockEmployeeId } },
			get: (header: string) => {
				if (header === "Content-Type") {
					return "application/json";
				}
				return undefined;
			},
			originalUrl: "/api/section/led-timesheets",
		} as any;
		res = {
			send: (data: any) => {
				sentData = data;
				return res;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
			end: () => res,
		} as unknown as Response;
		next = () => {};
	});

	it("requires employee context", async function () {
		this.timeout(TEST_TIMEOUT);
		req.metadata = undefined;
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(401);
		expect(sentData.status).to.equal("error");
	});

	it("returns empty payload when the actor leads no sections", async function () {
		this.timeout(TEST_TIMEOUT);
		prisma.sectionLineLeader.findMany = async () => [];
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(200);
		expect(sentData.status).to.equal("success");
		expect(sentData.data.sections).to.deep.equal([]);
		expect(sentData.data.period).to.equal(null);
		expect(sentData.data.members).to.deep.equal([]);
	});

	it("returns empty payload when led sections have no members", async function () {
		this.timeout(TEST_TIMEOUT);
		prisma.employee.findMany = async () => [];
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(200);
		expect(sentData.data.members).to.deep.equal([]);
		expect(sentData.data.period).to.equal(null);
	});

	it("returns full roster with null timesheet for members without one", async function () {
		this.timeout(TEST_TIMEOUT);
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(200);
		expect(sentData.status).to.equal("success");
		const rows = sentData.data.members;
		expect(rows).to.have.lengthOf(mockMembers.length);
		const zen = rows.find(
			(row: any) => row.member.employeeId === mockMembers[0].employeeId,
		);
		const danica = rows.find(
			(row: any) => row.member.employeeId === mockMembers[1].employeeId,
		);
		expect(zen.timesheet).to.not.equal(null);
		expect(zen.timesheet.status).to.equal("APPROVED");
		expect(zen.timesheet.totalOvertimeHours).to.equal("8:00");
		expect(danica.timesheet).to.equal(null);
		expect(sentData.data.period.code).to.equal(mockPeriod.code);
	});

	it("resolves period by explicit payrollPeriodId (code or id)", async function () {
		this.timeout(TEST_TIMEOUT);
		let capturedWhere: any = null;
		prisma.payrollPeriod.findFirst = async (args: any) => {
			capturedWhere = args?.where || null;
			return mockPeriod;
		};
		req.query = { payrollPeriodId: mockPeriod.code } as any;
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(200);
		expect(capturedWhere?.code).to.equal(mockPeriod.code);
		expect(sentData.data.period.id).to.equal(mockPeriod.id);
	});

	it("resolves period=current via the payrollPeriod current lookup", async function () {
		this.timeout(TEST_TIMEOUT);
		let currentLookupWhere: any = null;
		prisma.payrollPeriod.findFirst = async (args: any) => {
			currentLookupWhere = args?.where || null;
			return mockPeriod;
		};
		req.query = { period: "current" } as any;
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(200);
		expect(currentLookupWhere?.status).to.deep.equal({ in: ["OPEN", "PROCESSING"] });
		expect(sentData.data.period.id).to.equal(mockPeriod.id);
	});

	it("returns 404 when an explicit period id/code does not exist", async function () {
		this.timeout(TEST_TIMEOUT);
		prisma.payrollPeriod.findFirst = async () => null;
		req.query = { payrollPeriodId: "PP-DOES-NOT-EXIST" } as any;
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(404);
		expect(sentData.status).to.equal("error");
	});

	it("handles Prisma errors", async function () {
		this.timeout(TEST_TIMEOUT);
		prisma.sectionLineLeader.findMany = async () => {
			throw new Error("Database connection failed");
		};
		await sectionController.getLedTimesheets(req as Request, res, next);
		expect(statusCode).to.equal(500);
		expect(sentData.status).to.equal("error");
	});
});
