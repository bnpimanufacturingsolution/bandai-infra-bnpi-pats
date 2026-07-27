import assert from "node:assert/strict";
import type { Request, Response } from "express";
import * as xlsx from "xlsx";
import { controller } from "../app/employeeBenefit/employeeBenefit.controller";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-446655440${suffix}`;

function buildWorkbookBuffer(rows: Record<string, unknown>[]) {
	const sheet = xlsx.utils.json_to_sheet(rows);
	const workbook = xlsx.utils.book_new();
	xlsx.utils.book_append_sheet(workbook, sheet, "Enrollments");
	return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("employee benefit import controller", () => {
	let prisma: any;
	let createdPayloads: Array<Record<string, unknown>>;
	let responseStatus: number;
	let responseBody: any;

	const makeResponse = (): Response =>
		({
			status: (status: number) => {
				responseStatus = status;
				return makeResponse();
			},
			json: (body: unknown) => {
				responseBody = body;
				return makeResponse();
			},
		}) as Response;

	beforeEach(() => {
		createdPayloads = [];
		responseStatus = 200;
		responseBody = undefined;
		prisma = {
			employee: {
				findFirst: async ({ where }: any) => {
					if (String(where.employeeId) === "01466") {
						return { id: id("001"), organizationId: id("000") };
					}
					return null;
				},
			},
			benefitType: {
				findMany: async () => [
					{ id: id("002"), name: "Line Leader Allowance", code: "LLA" },
					{ id: id("003"), name: "De Minimis Allowance", code: "DMA" },
				],
				findFirst: async ({ where }: any) => {
					const types = [
						{
							id: id("002"),
							name: "Line Leader Allowance",
							code: "LLA",
							defaultEligibilityMode: "ENROLLED_ALWAYS",
							defaultEligibilityDisqualifyOnAbsent: true,
							defaultEligibilityDisqualifyOnLate: false,
							defaultEligibilityDisqualifyOnUndertime: false,
							defaultEligibilityDisqualifyOnLeave: false,
						},
						{
							id: id("003"),
							name: "De Minimis Allowance",
							code: "DMA",
							defaultEligibilityMode: "ENROLLED_ALWAYS",
							defaultEligibilityDisqualifyOnAbsent: true,
							defaultEligibilityDisqualifyOnLate: false,
							defaultEligibilityDisqualifyOnUndertime: false,
							defaultEligibilityDisqualifyOnLeave: false,
						},
					];
					return types.find((t) => t.id === where?.id) || null;
				},
			},
			employeeBenefit: {
				findFirst: async () => null,
				create: async ({ data }: { data: Record<string, unknown> }) => {
					createdPayloads.push(data);
					return { id: id("099"), ...data };
				},
			},
			employeeBenefitInstallment: {
				create: async ({ data }: any) => data,
			},
			payrollPeriod: {
				findMany: async () => [],
			},
		};
	});

	it("creates RECURRING enrollments from sample COMCODE columns", async () => {
		const buffer = buildWorkbookBuffer([
			{
				COMCODE: "LLA",
				Amount: 250,
				EmployeeID: "01466",
				EmployeeName: "Leyesa, Ma. Angelica N.",
				StartPayDate: "26/06/2026",
			},
		]);

		const request = {
			file: { buffer, originalname: "enroll.xlsx", size: buffer.length },
			user: { id: "user-1", organizationId: id("000") },
			originalUrl: "/api/employeeBenefit/import",
			get: () => "",
		} as unknown as Request;

		await controller(prisma).importBenefits(request, makeResponse(), () => undefined);

		assert.equal(responseStatus, 200);
		assert.equal(responseBody?.data?.success, 1);
		assert.equal(responseBody?.data?.failed, 0);
		assert.equal(createdPayloads.length, 1);
		assert.equal(createdPayloads[0].scheduleMode, "RECURRING");
		assert.equal(createdPayloads[0].recurrenceFrequency, "EVERY_CUTOFF");
		assert.equal(createdPayloads[0].status, "ACTIVE");
		assert.equal(createdPayloads[0].totalAmount, 250);
		assert.equal(createdPayloads[0].name, "Line Leader Allowance");
		assert.equal(createdPayloads[0].benefitTypeId, id("002"));
		assert.equal(createdPayloads[0].employeeId, id("001"));
	});

	it("fails the row when enrollment already exists for employee + benefit type", async () => {
		prisma.employeeBenefit.findFirst = async () => ({ id: id("050") });

		const buffer = buildWorkbookBuffer([
			{
				COMCODE: "LLA",
				Amount: 250,
				EmployeeID: "01466",
				StartPayDate: "26/06/2026",
			},
		]);

		const request = {
			file: { buffer, originalname: "enroll.xlsx", size: buffer.length },
			user: { id: "user-1", organizationId: id("000") },
			originalUrl: "/api/employeeBenefit/import",
			get: () => "",
		} as unknown as Request;

		await controller(prisma).importBenefits(request, makeResponse(), () => undefined);

		assert.equal(responseStatus, 400);
		assert.equal(createdPayloads.length, 0);
		assert.equal(responseBody?.data?.failed, 1);
		assert.match(String(responseBody?.data?.errors?.[0]?.error || ""), /already enrolled/i);
	});

	it("fails unknown employee and unknown benefit code", async () => {
		const buffer = buildWorkbookBuffer([
			{
				COMCODE: "ZZZ",
				Amount: 100,
				EmployeeID: "99999",
				StartPayDate: "01/01/2026",
			},
		]);

		const request = {
			file: { buffer, originalname: "enroll.xlsx", size: buffer.length },
			user: { id: "user-1", organizationId: id("000") },
			originalUrl: "/api/employeeBenefit/import",
			get: () => "",
		} as unknown as Request;

		await controller(prisma).importBenefits(request, makeResponse(), () => undefined);

		assert.equal(responseStatus, 400);
		assert.equal(responseBody?.data?.failed, 1);
		assert.match(String(responseBody?.data?.errors?.[0]?.error || ""), /Employee not found/i);
	});

	it("supports legacy BENEFIT_TYPE name column", async () => {
		const buffer = buildWorkbookBuffer([
			{
				EMPLOYEE_NUMBER: "01466",
				BENEFIT_TYPE: "Line Leader Allowance",
				AMOUNT: 100,
				START_DATE: "2026-06-26",
			},
		]);

		const request = {
			file: { buffer, originalname: "legacy.xlsx", size: buffer.length },
			user: { id: "user-1", organizationId: id("000") },
			originalUrl: "/api/employeeBenefit/import",
			get: () => "",
		} as unknown as Request;

		await controller(prisma).importBenefits(request, makeResponse(), () => undefined);

		assert.equal(responseStatus, 200);
		assert.equal(responseBody?.data?.success, 1);
		assert.equal(createdPayloads[0].benefitTypeId, id("002"));
	});
});
