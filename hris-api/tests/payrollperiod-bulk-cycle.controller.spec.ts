/// <reference types="mocha" />

import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { controller } from "../app/payrollperiod/payrollperiod.controller";

const TEST_TIMEOUT = 5000;

describe("Payrollperiod Controller bulk cycle operations", () => {
	let payrollperiodController: any;
	let req: Partial<Request>;
	let res: Response;
	let sentData: any;
	let statusCode: number;
	let prisma: any;
	let createdPeriods: any[];
	let updatedPeriods: Array<{ id: string; data: any }>;
	let existingPeriods: any[];

	const semiMonthlyCycleConfig = {
		id: "cycle-config-1",
		organizationId: "org-1",
		isDeleted: false,
		defaultPayFrequency: "SEMI_MONTHLY",
		payDateOffsetDays: 5,
		businessDayRule: "NONE",
		includeHolidaysInBusinessDayCheck: false,
		cycleRules: {
			SEMI_MONTHLY: { firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" },
		},
	};

	beforeEach(() => {
		createdPeriods = [];
		updatedPeriods = [];
		existingPeriods = [];

		prisma = {
			payrollCycleConfig: {
				findFirst: async () => semiMonthlyCycleConfig,
			},
			calendarItem: {
				findMany: async () => [],
			},
			calculator: {
				findFirst: async () => null,
			},
			payrollPeriod: {
				findFirst: async (args: any) =>
					existingPeriods.find(
						(period) =>
							period.startDate.getTime() === args.where.startDate.getTime() &&
							period.endDate.getTime() === args.where.endDate.getTime(),
					) || null,
				findMany: async () => existingPeriods,
				create: async (args: any) => {
					createdPeriods.push(args.data);
					return { id: `created-${createdPeriods.length}`, ...args.data };
				},
				update: async (args: any) => {
					updatedPeriods.push({ id: args.where.id, data: args.data });
					return { id: args.where.id, ...args.data };
				},
			},
		};

		payrollperiodController = controller(prisma);
		sentData = undefined;
		statusCode = 200;
		req = {
			organizationId: "org-1",
			role: "hris-hr-manager",
			query: {},
			params: {},
			body: {},
		} as any;
		res = {
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
		} as Response;
	});

	describe(".bulkGenerate()", () => {
		it("creates the expected semi-monthly periods for a one-month range", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				frequency: "SEMI_MONTHLY",
				rangeStart: "2026-02-01",
				rangeEnd: "2026-02-28",
			};

			await payrollperiodController.bulkGenerate(req as Request, res, () => {});

			assert.equal(statusCode, 200);
			assert.equal(sentData.data.created, 2);
			assert.equal(sentData.data.skipped, 0);
			assert.equal(createdPeriods.length, 2);
			assert.equal(createdPeriods[0].endDate.toISOString().slice(0, 10), "2026-02-15");
			assert.equal(createdPeriods[1].endDate.toISOString().slice(0, 10), "2026-02-28");
		});

		it("does not write any records in dry-run mode", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				frequency: "SEMI_MONTHLY",
				rangeStart: "2026-02-01",
				rangeEnd: "2026-02-28",
				dryRun: true,
			};

			await payrollperiodController.bulkGenerate(req as Request, res, () => {});

			assert.equal(statusCode, 200);
			assert.equal(sentData.data.created, 2);
			assert.equal(createdPeriods.length, 0);
		});

		it("skips periods that already exist with a protected COMPLETED status", async function () {
			this.timeout(TEST_TIMEOUT);
			existingPeriods = [
				{
					id: "existing-1",
					status: "COMPLETED",
					startDate: new Date("2026-02-01T00:00:00.000Z"),
					endDate: new Date("2026-02-15T23:59:59.999Z"),
				},
			];
			req.body = {
				frequency: "SEMI_MONTHLY",
				rangeStart: "2026-02-01",
				rangeEnd: "2026-02-28",
			};

			await payrollperiodController.bulkGenerate(req as Request, res, () => {});

			assert.equal(statusCode, 200);
			assert.equal(sentData.data.skipped, 1);
			assert.equal(sentData.data.created, 1);
			assert.equal(
				sentData.data.items.find((item: any) => item.action === "skipped").reason,
				"Protected status: COMPLETED",
			);
		});

		it("rejects when a non-policy-manager role attempts to generate periods", async function () {
			this.timeout(TEST_TIMEOUT);
			req.role = "hris-employee";
			req.body = {
				frequency: "SEMI_MONTHLY",
				rangeStart: "2026-02-01",
				rangeEnd: "2026-02-28",
			};

			await payrollperiodController.bulkGenerate(req as Request, res, () => {});

			assert.equal(statusCode, 403);
			assert.equal(createdPeriods.length, 0);
		});

		it("rejects an invalid payload before touching the database", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { frequency: "SEMI_MONTHLY" };

			await payrollperiodController.bulkGenerate(req as Request, res, () => {});

			assert.equal(statusCode, 400);
			assert.equal(createdPeriods.length, 0);
		});
	});

	describe(".bulkAdjust()", () => {
		it("recomputes a semi-monthly period's boundaries onto the current cycle rule", async function () {
			this.timeout(TEST_TIMEOUT);
			existingPeriods = [
				{
					id: "period-1",
					code: "old-code",
					status: "DRAFT",
					payFrequency: "SEMI_MONTHLY",
					periodNumber: 1,
					startDate: new Date("2026-02-01T00:00:00.000Z"),
					endDate: new Date("2026-02-14T23:59:59.999Z"),
					cutoffDay: 14,
					name: "Old Period 1",
					notes: "old notes",
				},
			];
			req.body = { frequency: "SEMI_MONTHLY" };

			await payrollperiodController.bulkAdjust(req as Request, res, () => {});

			assert.equal(statusCode, 200);
			assert.equal(sentData.data.updated, 1);
			assert.equal(updatedPeriods.length, 1);
			assert.equal(
				updatedPeriods[0].data.endDate.toISOString().slice(0, 10),
				"2026-02-15",
			);
		});

		it("skips a protected COMPLETED period unless forceRetroactive is set", async function () {
			this.timeout(TEST_TIMEOUT);
			existingPeriods = [
				{
					id: "period-1",
					code: "locked-code",
					status: "COMPLETED",
					payFrequency: "SEMI_MONTHLY",
					periodNumber: 1,
					startDate: new Date("2026-02-01T00:00:00.000Z"),
					endDate: new Date("2026-02-14T23:59:59.999Z"),
				},
			];
			req.body = { frequency: "SEMI_MONTHLY" };

			await payrollperiodController.bulkAdjust(req as Request, res, () => {});

			assert.equal(sentData.data.skipped, 1);
			assert.equal(updatedPeriods.length, 0);
		});

		it("does not write any records in dry-run mode", async function () {
			this.timeout(TEST_TIMEOUT);
			existingPeriods = [
				{
					id: "period-1",
					code: "old-code",
					status: "DRAFT",
					payFrequency: "SEMI_MONTHLY",
					periodNumber: 1,
					startDate: new Date("2026-02-01T00:00:00.000Z"),
					endDate: new Date("2026-02-14T23:59:59.999Z"),
				},
			];
			req.body = { frequency: "SEMI_MONTHLY", dryRun: true };

			await payrollperiodController.bulkAdjust(req as Request, res, () => {});

			assert.equal(sentData.data.updated, 1);
			assert.equal(sentData.data.dryRunApplied, true);
			assert.equal(updatedPeriods.length, 0);
		});

		it("returns an empty summary instead of an error when no periods match the filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { frequency: "WEEKLY" };

			await payrollperiodController.bulkAdjust(req as Request, res, () => {});

			assert.equal(statusCode, 200);
			assert.equal(sentData.data.total, 0);
		});
	});
});
