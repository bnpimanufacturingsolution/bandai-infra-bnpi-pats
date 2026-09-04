import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUTO_APPROVE_SYSTEM_ACTOR } from "../helper/timesheet-config.helper";
import {
	isTimesheetAttendanceRefreshAllowed,
	isTimesheetSystemAutoApproved,
	isTimesheetSystemRefreshAllowed,
	resolveTimesheetAutoApproveEnsureAction,
} from "../helper/timesheet.helper";

describe("resolveTimesheetAutoApproveEnsureAction", () => {
	it("creates when no timesheet exists", () => {
		expect(resolveTimesheetAutoApproveEnsureAction(null)).to.equal("create");
	});

	it("skips locked and payroll-consumed sheets", () => {
		expect(
			resolveTimesheetAutoApproveEnsureAction({ status: "DRAFT", lockedAt: new Date() }),
		).to.equal("skip");
		expect(
			resolveTimesheetAutoApproveEnsureAction({
				status: "APPROVED",
				lockedEmployeePayrollId: "payroll-1",
			}),
		).to.equal("skip");
	});

	it("refreshes system auto-approved sheets", () => {
		expect(
			resolveTimesheetAutoApproveEnsureAction({
				status: "APPROVED",
				metadata: { autoApproved: true },
			}),
		).to.equal("refresh");
		expect(
			resolveTimesheetAutoApproveEnsureAction({
				status: "APPROVED",
				approvedBy: AUTO_APPROVE_SYSTEM_ACTOR,
			}),
		).to.equal("refresh");
	});

	it("preserves manual manager-approved sheets", () => {
		expect(
			resolveTimesheetAutoApproveEnsureAction({
				status: "APPROVED",
				approvedBy: "manager-1",
				metadata: {},
			}),
		).to.equal("preserve");
	});

	it("upgrades legacy workflow sheets for auto-approval", () => {
		for (const status of ["DRAFT", "SUBMITTED", "REVISED", "REJECTED"]) {
			expect(resolveTimesheetAutoApproveEnsureAction({ status })).to.equal("upgrade");
		}
	});

	it("skips unknown statuses", () => {
		expect(resolveTimesheetAutoApproveEnsureAction({ status: "ARCHIVED" })).to.equal("skip");
	});
});

describe("isTimesheetSystemRefreshAllowed", () => {
	it("keeps editable drafts refreshable", () => {
		expect(isTimesheetSystemRefreshAllowed({ status: "DRAFT" })).to.equal(true);
		expect(isTimesheetSystemRefreshAllowed({ status: "REVISED" })).to.equal(true);
	});

	it("keeps manually submitted sheets frozen", () => {
		expect(isTimesheetSystemRefreshAllowed({ status: "SUBMITTED" })).to.equal(false);
	});

	it("keeps auto-approved sheets live until payroll locks them", () => {
		expect(
			isTimesheetSystemRefreshAllowed({
				status: "APPROVED",
				metadata: { autoApproved: true },
			}),
		).to.equal(true);
		expect(
			isTimesheetSystemRefreshAllowed({
				status: "APPROVED",
				metadata: { autoApproved: true },
				lockedAt: new Date(),
			}),
		).to.equal(false);
	});

	it("keeps manual manager approvals frozen", () => {
		expect(
			isTimesheetSystemRefreshAllowed({ status: "APPROVED", approvedBy: "manager-1" }),
		).to.equal(false);
	});
});

describe("isTimesheetSystemAutoApproved", () => {
	it("detects metadata and actor provenance", () => {
		expect(isTimesheetSystemAutoApproved({ metadata: { autoApproved: true } })).to.equal(true);
		expect(
			isTimesheetSystemAutoApproved({ approvedBy: AUTO_APPROVE_SYSTEM_ACTOR }),
		).to.equal(true);
		expect(isTimesheetSystemAutoApproved({ approvedBy: "manager-1" })).to.equal(false);
		expect(isTimesheetSystemAutoApproved(null)).to.equal(false);
	});
});

describe("legacy attendance-refresh predicate (unchanged contract)", () => {
	it("still gates SUBMITTED and APPROVED behind the system lane", () => {
		expect(isTimesheetAttendanceRefreshAllowed("DRAFT")).to.equal(true);
		expect(isTimesheetAttendanceRefreshAllowed("SUBMITTED")).to.equal(false);
		expect(isTimesheetAttendanceRefreshAllowed("APPROVED")).to.equal(false);
	});
});

describe("payroll-time auto-approve wiring contract", () => {
	const helperSource = readFileSync(
		resolve(__dirname, "../helper/timesheet.helper.ts"),
		"utf8",
	);
	const payrollSource = readFileSync(
		resolve(__dirname, "../helper/payroll-period.helper.ts"),
		"utf8",
	);
	const controllerSource = readFileSync(
		resolve(__dirname, "../app/timesheet/timesheet.controller.ts"),
		"utf8",
	);
	const routerSource = readFileSync(
		resolve(__dirname, "../app/timesheet/timesheet.router.ts"),
		"utf8",
	);
	const obligationSource = readFileSync(
		resolve(__dirname, "../helper/attendance-obligation.helper.ts"),
		"utf8",
	);

	it("exposes the payroll ensure helper with paid/locked guards", () => {
		expect(helperSource).to.include("ensurePayrollPeriodTimesheetsAutoApproved");
		expect(helperSource).to.include("skippedPaid");
		expect(helperSource).to.include("skippedLocked");
		expect(helperSource).to.include("preservedManual");
		expect(helperSource).to.include("buildTimesheetAutoApprovalPatch");
		expect(helperSource).to.include("forceRefreshLines");
	});

	it("rebuilds obligations only when missing (heavy recompute guard)", () => {
		expect(helperSource).to.include("ensureObligationsIfMissing");
		expect(helperSource).to.include("skipEnsureAttendanceObligations: true");
	});

	it("fast-paths employees with no attendance signal", () => {
		expect(helperSource).to.include("attendanceSignalEmployeeIds");
		expect(helperSource).to.include("No-signal fast path");
	});

	it("budgets creates/upgrades before repeatable refresh work", () => {
		expect(helperSource).to.include("stateChangingItems");
		expect(helperSource).to.include("budgetedRefresh");
		expect(helperSource).to.include("remainingToPrepare tracks finite create/upgrade work only");
	});

	it("adopts concurrently created sheets instead of failing", () => {
		expect(helperSource).to.include("Idempotency for overlapping ensure runs");
		expect(helperSource).to.include("Unique constraint failed");
	});

	it("materialize supports force refresh for auto-approved snapshots", () => {
		expect(obligationSource).to.include("forceRefreshLines");
	});

	it("payroll generation ensures auto-approved timesheets before candidate load", () => {
		const generateAt = payrollSource.indexOf("export async function generatePayrollFromTimesheets");
		expect(generateAt).to.be.greaterThan(-1);
		const body = payrollSource.slice(generateAt);
		const ensureAt = body.indexOf("ensurePayrollPeriodTimesheetsAutoApproved");
		const candidatesAt = body.indexOf("await findPayrollTimesheetCandidateIds");
		expect(ensureAt).to.be.greaterThan(-1);
		expect(candidatesAt).to.be.greaterThan(ensureAt);
	});

	it("payroll generation skips perpetual refresh inside ensure", () => {
		expect(helperSource).to.include("skipRefresh");
		expect(helperSource).to.include("skippedRefresh");
		const generateAt = payrollSource.indexOf("export async function generatePayrollFromTimesheets");
		const body = payrollSource.slice(generateAt);
		expect(body).to.include("skipRefresh: true");
	});

	it("registers POST /ensure-auto-approved for HR policy managers", () => {
		expect(routerSource).to.include('"/ensure-auto-approved"');
		expect(routerSource).to.include("controller.ensureAutoApprovedTimesheets");
		const start = controllerSource.indexOf("const ensureAutoApprovedTimesheets");
		expect(start).to.be.greaterThan(-1);
		const fn = controllerSource.slice(start, start + 4000);
		expect(fn).to.include("isTimesheetPolicyManager");
		expect(fn).to.include("ensurePayrollPeriodTimesheetsAutoApproved");
		expect(fn).to.include("autoApproved");
	});
});
