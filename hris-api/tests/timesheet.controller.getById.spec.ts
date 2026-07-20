import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { controller } from "../app/timesheet/timesheet.controller";
import { redisClient } from "../config/redis";

const TEST_TIMEOUT = 5000;

const controllerSource = readFileSync(
	path.join(process.cwd(), "app/timesheet/timesheet.controller.ts"),
	"utf8",
);

describe("Timesheet controller getById selective timesheetline reads", () => {
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let sentData: any;
	let statusCode = 0;
	let capturedFindFirstArgs: any[] = [];

	const supersededLine = {
		id: "line-old",
		date: new Date("2026-06-15T00:00:00.000Z"),
		timeIn: new Date("2026-06-15T00:30:00.000Z"),
		timeOut: new Date("2026-06-15T08:00:00.000Z"),
		status: "PRESENT",
		hoursWorked: "7:30",
		regularHours: "7:30",
		overtimeHours: "0:00",
		undertimeHours: "0:30",
		lateHours: "0:30",
		earlyOutHours: "0:00",
		employeeNotes: "Original line",
		approverNotes: null,
		notes: null,
		metadata: { businessDate: "2026-06-15" },
		breakMinutes: 60,
		isDeleted: false,
		isEffective: false,
		revisionNo: 1,
		createdAt: new Date("2026-06-16T00:00:00.000Z"),
	};

	const effectiveEditedLine = {
		id: "line-new",
		date: new Date("2026-06-15T00:00:00.000Z"),
		timeIn: new Date("2026-06-15T01:00:00.000Z"),
		timeOut: new Date("2026-06-15T09:00:00.000Z"),
		status: "PRESENT",
		hoursWorked: "8:00",
		regularHours: "8:00",
		overtimeHours: "0:00",
		undertimeHours: "0:00",
		lateHours: "0:00",
		earlyOutHours: "0:00",
		employeeNotes: "Edited line",
		approverNotes: null,
		notes: null,
		metadata: { businessDate: "2026-06-15" },
		breakMinutes: 60,
		isDeleted: false,
		isEffective: true,
		revisionNo: 2,
		createdAt: new Date("2026-06-17T00:00:00.000Z"),
	};

	const buildSelectedTimesheet = (params: any) => {
		const relationArgs = params.select?.timesheetlines || {};
		const lineWhere = relationArgs.where || {};
		const orderBy = Array.isArray(relationArgs.orderBy)
			? relationArgs.orderBy
			: relationArgs.orderBy
				? [relationArgs.orderBy]
				: [];
		const selectedTimesheetlines = [supersededLine, effectiveEditedLine]
			.filter((line) => {
				if (lineWhere.isDeleted !== undefined && line.isDeleted !== lineWhere.isDeleted) {
					return false;
				}
				if (
					lineWhere.isEffective !== undefined &&
					line.isEffective !== lineWhere.isEffective
				) {
					return false;
				}
				return true;
			})
			.sort((a, b) => {
				for (const entry of orderBy) {
					const [field, direction] = Object.entries(entry)[0] as [string, "asc" | "desc"];
					const left = (a as any)[field];
					const right = (b as any)[field];
					const leftValue =
						left instanceof Date ? left.getTime() : typeof left === "number" ? left : String(left);
					const rightValue =
						right instanceof Date
							? right.getTime()
							: typeof right === "number"
								? right
								: String(right);
					if (leftValue === rightValue) continue;
					const diff = leftValue > rightValue ? 1 : -1;
					return direction === "asc" ? diff : -diff;
				}
				return 0;
			});

		return {
			id: "ts-1",
			code: "TS-001",
			organizationId: "org-1",
			employeeId: "emp-1",
			payrollPeriodId: "period-1",
			status: "SUBMITTED",
			metadata: null,
			timesheetlines: selectedTimesheetlines,
		};
	};

	beforeEach(() => {
		capturedFindFirstArgs = [];
		statusCode = 0;
		sentData = null;

		(redisClient as any).isClientConnected = () => false;

		req = {
			params: { id: "ts-1" },
			query: {
				fields: [
					"id",
					"organizationId",
					"employeeId",
					"payrollPeriodId",
					"status",
					"metadata",
					"timesheetlines.id",
					"timesheetlines.date",
					"timesheetlines.timeIn",
					"timesheetlines.timeOut",
					"timesheetlines.status",
					"timesheetlines.hoursWorked",
					"timesheetlines.regularHours",
					"timesheetlines.overtimeHours",
					"timesheetlines.undertimeHours",
					"timesheetlines.lateHours",
					"timesheetlines.earlyOutHours",
					"timesheetlines.employeeNotes",
					"timesheetlines.approverNotes",
					"timesheetlines.notes",
					"timesheetlines.metadata",
					"timesheetlines.breakMinutes",
					"timesheetlines.isDeleted",
					"timesheetlines.isEffective",
				].join(","),
			},
		};

		res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(payload: any) {
				sentData = payload;
				return this;
			},
		} as Response;

		next = (() => undefined) as NextFunction;
	});

	it("filters selective timesheetline reads to effective rows before rebuilding breakdown", async function () {
		this.timeout(TEST_TIMEOUT);

		const prisma: any = {
			timesheet: {
				findFirst: async (params: any) => {
					capturedFindFirstArgs.push(params);
					return buildSelectedTimesheet(params);
				},
			},
			timesheetline: {
				findMany: async () => [],
			},
			request: {
				findMany: async () => [],
			},
			calendarItem: {
				findMany: async () => [],
			},
			scheduleOverride: {
				findFirst: async () => null,
			},
			employee: {
				findFirst: async () => null,
			},
			shiftType: {
				findMany: async () => [],
			},
			attendanceObligation: {
				findMany: async () => [],
			},
		};

		const timesheetController = controller(prisma);
		await timesheetController.getById(req as Request, res, next);

		expect(statusCode).to.equal(200);
		expect(capturedFindFirstArgs).to.have.length(1);
		expect(capturedFindFirstArgs[0].select.timesheetlines.where).to.deep.equal({
			isDeleted: false,
			isEffective: true,
		});
		expect(capturedFindFirstArgs[0].select.timesheetlines.orderBy).to.deep.equal([
			{ date: "asc" },
			{ revisionNo: "asc" },
			{ createdAt: "asc" },
			{ id: "asc" },
		]);

		expect(sentData?.status).to.equal("success");
		expect(sentData?.data?.timesheetlines).to.have.length(1);
		expect(sentData.data.timesheetlines[0].id).to.equal("line-new");
		expect(sentData.data.breakdown).to.have.length(1);
		expect(sentData.data.breakdown[0].hoursWorked).to.equal("8:00");
		expect(new Date(sentData.data.breakdown[0].timeIn).toISOString()).to.equal(
			effectiveEditedLine.timeIn.toISOString(),
		);
		expect(new Date(sentData.data.breakdown[0].timeOut).toISOString()).to.equal(
			effectiveEditedLine.timeOut.toISOString(),
		);
	});

	it("applies the selective timesheetline read helper in both initial and refetch getById selects", () => {
		const getByIdStart = controllerSource.indexOf("const getById = async");
		const getByIdEnd = controllerSource.indexOf("const update = async");
		const getByIdBlock = controllerSource.slice(getByIdStart, getByIdEnd);

		expect(getByIdBlock).to.include("applySelectiveTimesheetlineReadContract(selectFields);");
		expect(getByIdBlock).to.include(
			"applySelectiveTimesheetlineReadContract(refetchSelectFields);",
		);
	});
});
