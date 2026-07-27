import { describe, expect, it } from "vitest";

import {
	resolveLeavePrefillDates,
	shouldApplyAdvanceNoticeRestrictions,
} from "./leave-request-policy";

describe("leave-request-policy", () => {
	it("does not apply advance notice restrictions to sick leave", () => {
		expect(shouldApplyAdvanceNoticeRestrictions("SICK")).toBe(false);
		expect(shouldApplyAdvanceNoticeRestrictions("sick")).toBe(false);
	});

	it("applies advance notice restrictions to vacation and personal leave", () => {
		expect(shouldApplyAdvanceNoticeRestrictions("VACATION")).toBe(true);
		expect(shouldApplyAdvanceNoticeRestrictions("personal")).toBe(true);
	});

	it("skips advance notice restrictions for timesheet prefilled dates", () => {
		expect(
			shouldApplyAdvanceNoticeRestrictions("VACATION", {
				honorPrefilledDates: true,
			}),
		).toBe(false);
	});

	it("does not apply advance notice restrictions to other leave types by default", () => {
		expect(shouldApplyAdvanceNoticeRestrictions("BEREAVEMENT")).toBe(false);
	});

	it("resolves timesheet prefill dates from a single selected day", () => {
		expect(resolveLeavePrefillDates("2026-05-12")).toEqual({
			startDate: "2026-05-12",
			endDate: "2026-05-12",
		});
	});

	it("resolves explicit start and end dates when both are provided", () => {
		expect(resolveLeavePrefillDates("2026-05-12", "2026-05-14")).toEqual({
			startDate: "2026-05-12",
			endDate: "2026-05-14",
		});
	});

	it("returns null when no start date is provided", () => {
		expect(resolveLeavePrefillDates()).toBeNull();
		expect(resolveLeavePrefillDates("")).toBeNull();
		expect(resolveLeavePrefillDates("   ")).toBeNull();
	});
});