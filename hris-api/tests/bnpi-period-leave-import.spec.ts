import { expect } from "chai";
import * as XLSX from "xlsx";
import {
	aggregatePaidLeaveDaysByEmployee,
	computePeriodLeaveAmount,
	parsePeriodLeaveDate,
	parsePeriodLeaveWorkbook,
	resolvePeriodLeaveDailyBasis,
	PERIOD_LEAVE_BENEFIT_CODE,
	PERIOD_LEAVE_BNPI_ANNUAL_WORK_DAYS,
	type PeriodLeaveRawRow,
} from "../helper/bnpi-period-leave-import.helper";
import { importPeriodLeave } from "../app/migration/bnpi-period-leave-import.service";

function buildLeaveWorkbookBuffer(): Buffer {
	const sheet2 = XLSX.utils.aoa_to_sheet([
		[
			"EmployeeNumber",
			"EmployeeName",
			"Division",
			"DateOfLeave",
			"Day",
			"EvaluationYear",
			"Month_Year",
			"LeaveType",
			"Days",
			"PaidUnpaid",
			"Reason",
			"CurrentStatus",
			"AppliedDate",
			"Remarks",
		],
		["21", "Salud, Arvin", "Admin", "7/24/26", "Fri", "2026", "2026 07", "SL", "1", "Paid", "hp", "Closed", "7/27/26", ""],
		["24", "Libuit, Augusto", "PE2", "7/14/26", "Tue", "2026", "2026 07", "ACL", "0.5", "Paid", "wedding", "Closed", "7/13/26", ""],
		// Unpaid row inside window: must be skipped.
		["32", "Llarena, Ivy", "PP2", "7/15/26", "Wed", "2026", "2026 07", "VL", "1", "Unpaid", "trip", "Closed", "7/13/26", ""],
		// Paid but outside Jul 11-25 window.
		["21", "Salud, Arvin", "Admin", "7/3/26", "Fri", "2026", "2026 07", "SL", "1", "Paid", "flu", "Closed", "7/2/26", ""],
	]);
	const sheet1 = XLSX.utils.aoa_to_sheet([
		["EmployeeNumber", "EmployeeName", "DateOfLeave", "Days", "PaidUnpaid", "LeaveType"],
		["21", "Salud, Arvin", "7/24/26", "1", "Paid", "SL"],
	]);
	const workbook = XLSX.utils.book_new();
	// Client workbooks place the cutoff-authoritative view FIRST.
	XLSX.utils.book_append_sheet(workbook, sheet2, "Leave (2)");
	XLSX.utils.book_append_sheet(workbook, sheet1, "Leave (1)");
	return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function rawRow(overrides: Partial<PeriodLeaveRawRow>): PeriodLeaveRawRow {
	return {
		rowNumber: 2,
		code: "00021",
		name: "Salud, Arvin",
		date: new Date(Date.UTC(2026, 6, 24)),
		leaveType: "SL",
		days: 1,
		paid: true,
		status: "Closed",
		...overrides,
	};
}

describe("BNPI period leave import helpers", () => {
	it("parses M/D/YY and slash dates as UTC days", () => {
		expect(parsePeriodLeaveDate("7/24/26")?.toISOString().slice(0, 10)).to.equal("2026-07-24");
		expect(parsePeriodLeaveDate("12/31/2026")?.toISOString().slice(0, 10)).to.equal("2026-12-31");
		expect(parsePeriodLeaveDate(new Date(Date.UTC(2026, 6, 11)))?.getUTCMonth()).to.equal(6);
		expect(parsePeriodLeaveDate("")).to.equal(null);
	});

	it("normalizes LOCAL-midnight Date objects (SheetJS on UTC+8 host) to the same calendar day", () => {
		// Simulate SheetJS on a UTC+8 host: local midnight 2026-07-24 is
		// 2026-07-23T16:00Z in UTC — the ISO day must still be 2026-07-24.
		const localMidnight = new Date(2026, 6, 24, 0, 0, 0, 0);
		expect(parsePeriodLeaveDate(localMidnight)?.toISOString().slice(0, 10)).to.equal("2026-07-24");
		// Offset-carrying strings keep their instant, but calendar-day normalization
		// applies to plain datetime strings too.
		const shifted = parsePeriodLeaveDate("2026-07-24T16:00:00Z");
		expect(shifted?.toISOString().slice(0, 10)).to.equal("2026-07-24");
	});

	it("selects the first qualifying sheet and parses paid rows", () => {
		const parsed = parsePeriodLeaveWorkbook(buildLeaveWorkbookBuffer());
		expect(parsed.sheetNames).to.deep.equal(["Leave (2)", "Leave (1)"]);
		expect(parsed.qualifyingSheetNames).to.deep.equal(["Leave (2)", "Leave (1)"]);
		// First qualifying sheet is the authoritative cutoff view (Leave (2)).
		expect(parsed.sheetName).to.equal("Leave (2)");
		expect(parsed.rows).to.have.length(4);
		expect(parsed.rows[0].code).to.equal("00021");
		expect(parsed.rows[0].paid).to.equal(true);
		expect(parsed.rows[2].paid).to.equal(false);
	});

	it("honors an explicit sheet override", () => {
		const parsed = parsePeriodLeaveWorkbook(buildLeaveWorkbookBuffer(), {
			sheetName: "Leave (1)",
		});
		expect(parsed.sheetName).to.equal("Leave (1)");
		expect(parsed.rows).to.have.length(1);
	});

	it("aggregates only PAID rows inside the cutoff window", () => {
		const parsed = parsePeriodLeaveWorkbook(buildLeaveWorkbookBuffer());
		const aggregated = aggregatePaidLeaveDaysByEmployee(parsed.rows, {
			startDate: new Date(Date.UTC(2026, 6, 11)),
			endDate: new Date(Date.UTC(2026, 6, 25)),
		});
		expect(aggregated.totalRows).to.equal(4);
		expect(aggregated.byCode.get("00021")?.paidDays).to.equal(1);
		expect(aggregated.byCode.get("00024")?.paidDays).to.equal(0.5);
		// 7/3 row is outside the window; unpaid 7/15 row skipped entirely.
		expect(aggregated.skippedOutsideWindow).to.equal(1);
		expect(aggregated.skippedUnpaid).to.equal(1);
		expect(aggregated.byCode.has("00032")).to.equal(false);
		expect(aggregated.totalPaidDays).to.equal(1.5);
	});

	it("mirrors the computation-file dual daily basis", () => {
		const pathA = resolvePeriodLeaveDailyBasis({ dailyRate: 600, basicSalary: 20000 });
		expect(pathA.basis).to.equal("DAILY_RATE");
		expect(pathA.dailyRate).to.equal(600);

		const pathB = resolvePeriodLeaveDailyBasis({ dailyRate: 0, basicSalary: 4250 });
		expect(pathB.basis).to.equal("BNPI_313");
		expect(pathB.dailyRate).to.be.closeTo((4250 * 24) / PERIOD_LEAVE_BNPI_ANNUAL_WORK_DAYS, 1e-9);

		// Sheet2 sample 00032: monthly 30400 -> semi-monthly basic 15200 -> 1165.4952/day,
		// and the final peso amount (not the rate) rounds to 2913.74.
		const b32 = resolvePeriodLeaveDailyBasis({ dailyRate: 0, basicSalary: 15200 });
		expect(computePeriodLeaveAmount({ paidDays: 2.5, dailyRate: b32.dailyRate })).to.equal(2913.74);
	});
});

describe("BNPI period leave import service (dry-run + execute contract)", () => {
	const window = { startDate: new Date(Date.UTC(2026, 6, 11)), endDate: new Date(Date.UTC(2026, 6, 25)) };

	async function runImport(dryRun: boolean) {
		const buffer = buildLeaveWorkbookBuffer();
		let periodCandidates: any[] = [];
		const employeeBenefitCreates: any[] = [];
		const employeeBenefitUpdates: any[] = [];
		const importLogs: any[] = [];
		const prisma: any = {
			payrollPeriod: {
				findFirst: async () => null,
				// Month-wide leave files span two cutoffs; return both so the
				// dominant-paid-days selection is exercised.
				findMany: async () => periodCandidates,
			},
			employee: {
				findMany: async () => [
					{
						id: "emp-pk-a",
						employeeId: "00021",
						dailyRate: 600,
						basicSalary: 85000 / 2,
					},
					{
						id: "emp-pk-b",
						employeeId: "00024",
						dailyRate: 0,
						basicSalary: 15200,
					},
				],
			},
			benefitType: {
				findFirst: async () => ({ id: "btype-lvp", code: "LVP", name: "Leave Pay" }),
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
				create: async (args: any) => ({ id: "btype-new", ...args.data }),
			},
			employeeBenefit: {
				findMany: async () => [{ id: "existing-lvp-b", employeeId: "emp-pk-b" }],
				create: async (args: any) => {
					employeeBenefitCreates.push(args.data);
					return { id: `lvp-${employeeBenefitCreates.length}` };
				},
				update: async (args: any) => {
					employeeBenefitUpdates.push(args);
					return { id: args.where.id };
				},
			},
			massUploadImportLog: {
				create: async (args: any) => {
					importLogs.push(args.data);
					return { id: "log-1" };
				},
			},
		};

		periodCandidates = [
			{
				// Prior cut: holds only the 7/3 paid row (1 day) — must LOSE.
				id: "period-jun26",
				code: "PP-20260626-20260711",
				startDate: new Date(Date.UTC(2026, 5, 26)),
				endDate: new Date(Date.UTC(2026, 6, 10)),
			},
			{
				// Target cut: holds 1 + 0.5 paid days — must WIN on dominant paid days.
				id: "period-jul1125",
				code: "PP-20260711-20260726",
				startDate: window.startDate,
				endDate: window.endDate,
			},
		];

		const summary = await importPeriodLeave({
			prisma,
			organizationId: "org-1",
			buffer,
			sourceFilename: "Leave (July 1-31, 2026).xlsx",
			dryRun,
			persistLog: true,
		});
		return {
			summary,
			employeeBenefitCreates,
			employeeBenefitUpdates,
			importLogs,
		};
	}

	it(`previews without writes when dryRun is explicitly true (benefit code ${PERIOD_LEAVE_BENEFIT_CODE})`, async () => {
		const { summary, employeeBenefitCreates, employeeBenefitUpdates, importLogs } =
			await runImport(true);
		expect(summary.dryRun).to.equal(true);
		expect(summary.kind).to.equal("leave");
		expect(summary.sheetName).to.equal("Leave (2)");
		expect(summary.windowStart).to.equal("2026-07-11");
		expect(summary.windowEnd).to.equal("2026-07-25");
		expect(summary.employeesMatched).to.equal(2);
		expect(summary.totalPaidDays).to.equal(1.5);
		expect(employeeBenefitCreates).to.have.length(0);
		expect(employeeBenefitUpdates).to.have.length(0);
		expect(importLogs).to.have.length(0);
		// Plans show create for A (no existing row) and update for B (existing row).
		const planA = summary.results?.find((row) => row.employeeId === "00021");
		const planB = summary.results?.find((row) => row.employeeId === "00024");
		expect(planA?.action).to.equal("created");
		expect(planA?.amount).to.be.closeTo(600, 0.01);
		expect(planB?.action).to.equal("updated");
		expect(planB?.amount).to.be.closeTo(0.5 * ((15200 * 24) / 313), 0.05);
	});

	it("writes period-scoped LVP enrollments on execute and persists an import log", async () => {
		const { summary, employeeBenefitCreates, employeeBenefitUpdates, importLogs } =
			await runImport(false);
		expect(summary.dryRun).to.equal(false);
		expect(summary.created).to.equal(1);
		expect(summary.updated).to.equal(1);
		expect(summary.status).to.equal("completed");
		expect(summary.periodCodes).to.deep.equal(["PP-20260711-20260726"]);

		expect(employeeBenefitCreates).to.have.length(1);
		const created = employeeBenefitCreates[0];
		expect(created.employeeId).to.equal("emp-pk-a");
		expect(created.payrollPeriodId).to.equal("period-jul1125");
		expect(created.amount).to.be.closeTo(600, 0.01);
		expect(created.scheduleMode).to.equal("RECURRING");
		expect(created.isActive).to.equal(true);

		expect(employeeBenefitUpdates).to.have.length(1);
		expect(employeeBenefitUpdates[0].where.id).to.equal("existing-lvp-b");

		expect(importLogs).to.have.length(1);
		expect(importLogs[0].kind).to.equal("period-leave");
		expect(importLogs[0].summaryJson.massUploadKind).to.equal("leave");
	});

	it("executes by default when dryRun is not provided (upload = import, like other DM3 uploads)", async () => {
		const employeeBenefitCreates: any[] = [];
		const importLogs: any[] = [];
		const prisma: any = {
			payrollPeriod: {
				findFirst: async () => null,
				findMany: async () => [
					{
						id: "period-jul1125",
						code: "PP-20260711-20260726",
						startDate: window.startDate,
						endDate: window.endDate,
					},
				],
			},
			employee: {
				findMany: async () => [
					{ id: "emp-pk-a", employeeId: "00021", dailyRate: 600, basicSalary: 42500 },
				],
			},
			benefitType: {
				findFirst: async () => ({ id: "btype-lvp", code: "LVP", name: "Leave Pay" }),
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
			},
			employeeBenefit: {
				findMany: async () => [],
				create: async (args: any) => {
					employeeBenefitCreates.push(args.data);
					return { id: "lvp-1" };
				},
			},
			massUploadImportLog: {
				create: async (args: any) => {
					importLogs.push(args.data);
					return { id: "log-d" };
				},
			},
		};
		const summary = await importPeriodLeave({
			prisma,
			organizationId: "org-1",
			buffer: buildLeaveWorkbookBuffer(),
			sourceFilename: "Leave.xlsx",
			persistLog: true,
		});
		expect(summary.dryRun).to.equal(false);
		expect(employeeBenefitCreates).to.have.length(1);
		expect(summary.created).to.equal(1);
		expect(importLogs).to.have.length(1);
	});

	it("reports missing employees as failures instead of inventing money", async () => {
		const buffer = buildLeaveWorkbookBuffer();
		const prisma: any = {
			payrollPeriod: {
				findFirst: async () => null,
				findMany: async () => [
					{
						id: "p1",
						code: "PP-X",
						startDate: window.startDate,
						endDate: window.endDate,
					},
				],
			},
			employee: {
				findMany: async () => [],
			},
			benefitType: {
				findFirst: async () => null,
				create: async (args: any) => ({ id: "btype-new", ...args.data }),
				update: async (args: any) => ({ id: args.where.id, ...args.data }),
			},
			employeeBenefit: {
				findMany: async () => [],
				create: async () => ({ id: "lvp-x" }),
				update: async () => ({ id: "lvp-y" }),
			},
			massUploadImportLog: { create: async () => ({ id: "log-x" }) },
		};
		const summary = await importPeriodLeave({
			prisma,
			organizationId: "org-1",
			buffer,
			dryRun: false,
			persistLog: false,
		});
		expect(summary.created).to.equal(0);
		expect(summary.updated).to.equal(0);
		expect(summary.failed).to.be.greaterThan(0);
		expect(summary.errors[0]?.message).to.include("was not found");
	});
});
