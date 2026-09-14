import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { controller } from "../app/employeeBenefit/employeeBenefit.controller";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-446655440${suffix}`;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const timeBoundPayload = (overrides: Record<string, unknown> = {}) => ({
	organizationId: id("000"),
	employeeId: id("001"),
	benefitTypeId: id("002"),
	totalAmount: 100,
	installmentAmount: 100,
	remainingBalance: 100,
	scheduleMode: "TIME_BOUND",
	startDate: "2026-01-01",
	endDate: "2026-01-31",
	status: "ACTIVE",
	...overrides,
});

const payrollPeriods = [
	{ id: "period-1", startDate: date("2026-01-01"), endDate: date("2026-01-15") },
	{ id: "period-2", startDate: date("2026-01-16"), endDate: date("2026-01-31") },
];

describe("employee benefit schedule controller", () => {
	let prisma: any;
	let request: Request;
	let response: Response;
	let responseStatus: number;
	let createdInstallments: Array<Record<string, unknown>>;
	let payrollPeriodQueries: Array<Record<string, unknown>>;
	let createdPayloads: Array<Record<string, unknown>>;
	let updatedPayloads: Array<Record<string, unknown>>;
	let responseBody: unknown;

	beforeEach(() => {
		createdInstallments = [];
		payrollPeriodQueries = [];
		createdPayloads = [];
		updatedPayloads = [];
		responseBody = undefined;
		prisma = {
			employeeBenefit: {
				create: async ({ data }: { data: Record<string, unknown> }) => {
					createdPayloads.push(data);
					return { id: "benefit-1", ...data };
				},
				findFirst: async () => ({ id: "benefit-1", ...timeBoundPayload() }),
				update: async ({ data }: { data: Record<string, unknown> }) => {
					updatedPayloads.push(data);
					return {
						id: "benefit-1",
						...timeBoundPayload(),
						...data,
					};
				},
			},
			employeeBenefitInstallment: {
				count: async () => 0,
				create: async ({ data }: { data: Record<string, unknown> }) => {
					createdInstallments.push(data);
					return data;
				},
			},
			payrollPeriod: {
				findFirst: async () => null,
				findMany: async ({ where }: { where: Record<string, unknown> }) => {
					payrollPeriodQueries.push(where);
					return payrollPeriods;
				},
			},
			benefitType: {
				findFirst: async () => null,
			},
		};
		request = {
			body: timeBoundPayload(),
			params: {},
			get: () => "application/json",
			originalUrl: "/api/employee-benefits",
		} as Request;
		responseStatus = 200;
		response = {
			status: (status: number) => {
				responseStatus = status;
				return response;
			},
			json: (body: unknown) => {
				responseBody = body;
				return response;
			},
		} as Response;
	});

	it("passes organization-scoped overlapping payroll periods when creating an active time-bound benefit", async () => {
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.deepEqual(payrollPeriodQueries, [{
			organizationId: id("000"),
			isDeleted: false,
			startDate: { lte: date("2026-01-31") },
			endDate: { gte: date("2026-01-01") },
		}]);
		assert.deepEqual(createdInstallments.map((row) => row.scheduledDate), [
			date("2026-01-01"),
			date("2026-01-16"),
		]);
	});

	it("passes organization-scoped overlapping payroll periods when updating an active time-bound benefit", async () => {
		request.params = { id: "benefit-1" };
		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 200);
		assert.equal(payrollPeriodQueries.length, 1);
		assert.equal(createdInstallments.length, 2);
		assert.equal(updatedPayloads[0].totalInstallments, 2);
	});

	it("does not create installments or query payroll periods for a pending benefit", async () => {
		request.body = timeBoundPayload({ status: "PENDING" });
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.deepEqual(createdInstallments, []);
	});

	it("persists zero installments for an inactive explicit time-bound create", async () => {
		request.body = timeBoundPayload({ status: "PENDING" });
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads[0].totalInstallments, 0);
	});

	it("does not create installments or query payroll periods for a cancelled benefit", async () => {
		request.body = timeBoundPayload({ status: "CANCELLED" });
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.deepEqual(createdInstallments, []);
	});

	it("does not create installments or query payroll periods when an update remains pending", async () => {
		request.params = { id: "benefit-1" };
		request.body = { status: "PENDING" };
		prisma.employeeBenefit.findFirst = async () => ({
			id: "benefit-1",
			...timeBoundPayload({ status: "PENDING" }),
		});
		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 200);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.deepEqual(createdInstallments, []);
	});

	it("persists zero installments for an inactive explicit time-bound update", async () => {
		request.params = { id: "benefit-1" };
		request.body = { status: "PENDING" };
		prisma.employeeBenefit.findFirst = async () => ({
			id: "benefit-1",
			...timeBoundPayload({ status: "PENDING" }),
		});
		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 200);
		assert.equal(updatedPayloads[0].totalInstallments, 0);
	});

	it("does not duplicate installments when an active update already has a schedule", async () => {
		request.params = { id: "benefit-1" };
		prisma.employeeBenefitInstallment.count = async () => 2;
		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 200);
		assert.deepEqual(createdInstallments, []);
	});

	it("returns a validation error response for an invalid time-bound benefit date range", async () => {
		request.body = timeBoundPayload({
			startDate: "2026-02-01",
			endDate: "2026-01-31",
		});
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 400);
		assert.equal((responseBody as { status?: string }).status, "error");
		assert.equal((responseBody as { code?: number }).code, 400);
		assert.ok(
			(responseBody as { errors?: Array<{ field?: string }> }).errors?.some(
				(error) => error.field === "endDate",
			),
		);
	});

	it("rejects a partial time-bound end-date update that reverses the persisted range", async () => {
		request.params = { id: "benefit-1" };
		request.body = { endDate: "2025-12-31" };

		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 400);
		assert.equal(updatedPayloads.length, 0);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.deepEqual(createdInstallments, []);
		assert.ok(
			(responseBody as { errors?: Array<{ field?: string }> }).errors?.some(
				(error) => error.field === "endDate",
			),
		);
	});

	it("rejects a partial time-bound start-date update that reverses the persisted range", async () => {
		request.params = { id: "benefit-1" };
		request.body = { startDate: "2026-02-01" };

		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 400);
		assert.equal(updatedPayloads.length, 0);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.deepEqual(createdInstallments, []);
		assert.ok(
			(responseBody as { errors?: Array<{ field?: string }> }).errors?.some(
				(error) => error.field === "endDate",
			),
		);
	});

	it("preserves a valid partial time-bound end-date update", async () => {
		request.params = { id: "benefit-1" };
		request.body = { endDate: "2026-02-15" };

		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 200);
		assert.equal(updatedPayloads.length, 1);
		assert.deepEqual(updatedPayloads[0].endDate, date("2026-02-15"));
	});

	it("persists the selected payroll-period count through an explicit time-bound create", async () => {
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(createdPayloads[0].totalInstallments, 2);
	});

	it("persists zero installments when no valid payroll period overlaps a time-bound benefit", async () => {
		prisma.payrollPeriod.findMany = async () => [];
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads[0].totalInstallments, 0);
		assert.deepEqual(createdInstallments, []);
	});

	it("excludes reversed payroll periods from the persisted time-bound count", async () => {
		prisma.payrollPeriod.findMany = async () => [
			...payrollPeriods,
			{ id: "reversed", startDate: date("2026-01-31"), endDate: date("2026-01-01") },
		];
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads[0].totalInstallments, 2);
		assert.equal(createdInstallments.length, 2);
	});

	it("keeps a fixed schedule's requested installment count without querying payroll periods", async () => {
		request.body = timeBoundPayload({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 3,
		});
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads[0].totalInstallments, 3);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.equal(createdInstallments.length, 3);
	});

	it("filters malformed payroll periods before persisting time-bound installments", async () => {
		prisma.payrollPeriod.findMany = async () => [
			...payrollPeriods,
			{ id: "bad", startDate: new Date("invalid"), endDate: date("2026-01-31") },
		];
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdInstallments.length, 2);
	});

	it("creates a recurring benefit without bulk installments or payroll-period queries", async () => {
		request.body = timeBoundPayload({
			scheduleMode: "RECURRING",
			endDate: undefined,
			totalInstallments: undefined,
			totalAmount: 500,
			installmentAmount: 500,
			amount: 500,
		});
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads[0].scheduleMode, "RECURRING");
		assert.equal(createdPayloads[0].totalInstallments, 0);
		assert.deepEqual(payrollPeriodQueries, []);
		assert.deepEqual(createdInstallments, []);
	});

	it("creates a recurring benefit with an optional end date and still skips bulk installments", async () => {
		request.body = timeBoundPayload({
			scheduleMode: "RECURRING",
			endDate: "2026-12-31",
			totalAmount: 500,
			installmentAmount: 500,
			amount: 500,
		});
		await controller(prisma).create(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads[0].scheduleMode, "RECURRING");
		assert.deepEqual(createdPayloads[0].endDate, date("2026-12-31"));
		assert.deepEqual(createdInstallments, []);
	});

	it("does not bulk-create installments when updating an active recurring benefit with zero rows", async () => {
		request.params = { id: "benefit-1" };
		request.body = { amount: 750 };
		prisma.employeeBenefit.findFirst = async () => ({
			id: "benefit-1",
			...timeBoundPayload({
				scheduleMode: "RECURRING",
				endDate: undefined,
				totalInstallments: 0,
				totalAmount: 500,
				installmentAmount: 500,
				amount: 500,
			}),
		});
		prisma.employeeBenefitInstallment.count = async () => 0;
		await controller(prisma).update(request, response, () => undefined);

		assert.equal(responseStatus, 200);
		assert.equal(updatedPayloads[0].scheduleMode, "RECURRING");
		assert.equal(updatedPayloads[0].totalInstallments, 0);
		assert.deepEqual(createdInstallments, []);
	});

	it("bulk creates one benefit per employee id", async () => {
		let createCount = 0;
		prisma.employeeBenefit.create = async ({ data }: { data: Record<string, unknown> }) => {
			createCount += 1;
			createdPayloads.push(data);
			return { id: `benefit-${createCount}`, ...data };
		};
		request.body = {
			...timeBoundPayload(),
			employeeId: undefined,
			employeeIds: [id("001"), id("003")],
		};
		delete (request.body as any).employeeId;

		await controller(prisma).bulkCreate(request, response, () => undefined);

		assert.equal(responseStatus, 201);
		assert.equal(createdPayloads.length, 2);
		assert.equal(createdPayloads[0].employeeId, id("001"));
		assert.equal(createdPayloads[1].employeeId, id("003"));
		const body = responseBody as any;
		assert.equal(body?.data?.created?.length, 2);
		assert.equal(body?.data?.failed?.length, 0);
	});

	it("rejects bulk create when employeeIds is empty", async () => {
		request.body = {
			...timeBoundPayload(),
			employeeIds: [],
		};
		delete (request.body as any).employeeId;

		await controller(prisma).bulkCreate(request, response, () => undefined);

		assert.equal(responseStatus, 400);
		assert.equal(createdPayloads.length, 0);
	});
});
