import { describe, expect, it } from "vitest";
import { getCompensatoryLeaveCredit } from "./TimesheetViewModal";
import type { Timesheet } from "~/services/timesheet.service";

const baseCredit = {
	source: "APPROVED_OVERTIME_TIMESHEETLINES" as const,
	leaveType: "COMPENSATORY" as const,
	totalMinutes: 120,
	totalDays: 0.25,
	deltaMinutes: 120,
	deltaDays: 0.25,
	lineCount: 1,
	creditedAt: "2026-06-25T00:00:00.000Z",
	creditedByEmployeeId: "hr-1",
	approvedOvertimeDays: [],
};

const withCredit = (credit: Record<string, unknown>): Timesheet =>
	({
		metadata: { compensatoryLeaveCredit: credit },
	}) as unknown as Timesheet;

describe("getCompensatoryLeaveCredit", () => {
	it("returns the credit summary when the credit was actually applied", () => {
		const result = getCompensatoryLeaveCredit(withCredit({ ...baseCredit, creditApplied: true }));

		expect(result).toEqual({
			totalMinutes: 120,
			totalDays: 0.25,
			lineCount: 1,
			creditedAt: "2026-06-25T00:00:00.000Z",
			creditApplied: true,
			skipReason: undefined,
		});
	});

	it("treats legacy records without a creditApplied flag as applied (backward compatible)", () => {
		const result = getCompensatoryLeaveCredit(withCredit(baseCredit));

		expect(result).not.toBeNull();
		expect(result?.totalMinutes).toBe(120);
	});

	it("returns the skipped state instead of null when the backend explicitly skipped crediting", () => {
		const result = getCompensatoryLeaveCredit(
			withCredit({ ...baseCredit, creditApplied: false, skipReason: "NO_COMPENSATORY_LEAVE_POLICY" }),
		);

		expect(result).not.toBeNull();
		expect(result?.creditApplied).toBe(false);
		expect(result?.skipReason).toBe("NO_COMPENSATORY_LEAVE_POLICY");
	});

	it("returns null when there is no compensatory leave credit metadata at all", () => {
		expect(getCompensatoryLeaveCredit({ metadata: {} } as unknown as Timesheet)).toBeNull();
		expect(getCompensatoryLeaveCredit(null)).toBeNull();
	});

	it("returns null when there is no overtime (totalMinutes is 0), avoiding empty banners on regular timesheets", () => {
		const result = getCompensatoryLeaveCredit(
			withCredit({ ...baseCredit, totalMinutes: 0, lineCount: 0, creditApplied: false }),
		);
		expect(result).toBeNull();
	});
});
