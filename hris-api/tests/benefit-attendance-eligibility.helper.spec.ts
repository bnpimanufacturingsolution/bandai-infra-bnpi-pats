import assert from "node:assert/strict";
import {
	countEligibilitySignalsFromBreakdown,
	evaluateBenefitAttendanceEligibility,
	normalizeBenefitEligibilityMode,
	parseBenefitDurationToMinutes,
	PFA_ELIGIBILITY_DEFAULTS,
} from "../helper/benefit-attendance-eligibility.helper";

describe("benefit-attendance-eligibility.helper", () => {
	it("normalizes eligibility mode", () => {
		assert.equal(normalizeBenefitEligibilityMode("ATTENDANCE_QUALIFIED"), "ATTENDANCE_QUALIFIED");
		assert.equal(normalizeBenefitEligibilityMode("attendance_qualified"), "ATTENDANCE_QUALIFIED");
		assert.equal(normalizeBenefitEligibilityMode(null), "ENROLLED_ALWAYS");
		assert.equal(normalizeBenefitEligibilityMode("ENROLLED_ALWAYS"), "ENROLLED_ALWAYS");
	});

	it("parses duration strings to minutes", () => {
		assert.equal(parseBenefitDurationToMinutes("0:00"), 0);
		assert.equal(parseBenefitDurationToMinutes("1:30"), 90);
		assert.equal(parseBenefitDurationToMinutes("0:15"), 15);
		assert.equal(parseBenefitDurationToMinutes(null), 0);
		assert.equal(parseBenefitDurationToMinutes("bad"), 0);
	});

	it("counts eligibility signals from breakdown", () => {
		const signals = countEligibilitySignalsFromBreakdown([
			{ status: "PRESENT", lateHours: "0:00", undertimeHours: "0:00" },
			{ status: "ABSENT", lateHours: "0:00", undertimeHours: "0:00" },
			{ status: "LEAVE", lateHours: "0:00", undertimeHours: "0:00" },
			{ status: "PRESENT", lateHours: "0:10", undertimeHours: "0:00" },
			{ status: "PRESENT", lateHours: "0:00", undertimeHours: "0:05" },
			{ status: "REST_DAY", lateHours: "1:00", undertimeHours: "1:00" },
		]);
		assert.deepEqual(signals, {
			scheduledWorkDays: 5,
			absentDays: 1,
			lateDays: 1,
			undertimeDays: 1,
			leaveDays: 1,
		});
	});

	it("ENROLLED_ALWAYS is always eligible", () => {
		const result = evaluateBenefitAttendanceEligibility({
			mode: "ENROLLED_ALWAYS",
			flags: {
				disqualifyOnAbsent: true,
				disqualifyOnLate: true,
			},
			signals: {
				scheduledWorkDays: 10,
				absentDays: 2,
				lateDays: 3,
				undertimeDays: 1,
				leaveDays: 1,
			},
		});
		assert.equal(result.eligible, true);
		assert.deepEqual(result.failReasons, []);
	});

	it("ATTENDANCE_QUALIFIED fails on absent by default", () => {
		const result = evaluateBenefitAttendanceEligibility({
			mode: "ATTENDANCE_QUALIFIED",
			flags: {},
			signals: {
				scheduledWorkDays: 10,
				absentDays: 1,
				lateDays: 0,
				undertimeDays: 0,
				leaveDays: 0,
			},
		});
		assert.equal(result.eligible, false);
		assert.deepEqual(result.failReasons, ["absent"]);
	});

	it("ATTENDANCE_QUALIFIED respects disabled absent flag", () => {
		const result = evaluateBenefitAttendanceEligibility({
			mode: "ATTENDANCE_QUALIFIED",
			flags: { disqualifyOnAbsent: false },
			signals: {
				scheduledWorkDays: 10,
				absentDays: 2,
				lateDays: 0,
				undertimeDays: 0,
				leaveDays: 0,
			},
		});
		assert.equal(result.eligible, true);
	});

	it("ATTENDANCE_QUALIFIED fails on late/undertime/leave when enabled", () => {
		const late = evaluateBenefitAttendanceEligibility({
			mode: "ATTENDANCE_QUALIFIED",
			flags: {
				disqualifyOnAbsent: false,
				disqualifyOnLate: true,
			},
			signals: {
				scheduledWorkDays: 5,
				absentDays: 0,
				lateDays: 1,
				undertimeDays: 0,
				leaveDays: 0,
			},
		});
		assert.equal(late.eligible, false);
		assert.ok(late.failReasons.includes("late"));

		const multi = evaluateBenefitAttendanceEligibility({
			mode: "ATTENDANCE_QUALIFIED",
			flags: {
				disqualifyOnAbsent: true,
				disqualifyOnLate: true,
				disqualifyOnUndertime: true,
				disqualifyOnLeave: true,
			},
			signals: {
				scheduledWorkDays: 5,
				absentDays: 1,
				lateDays: 1,
				undertimeDays: 1,
				leaveDays: 1,
			},
		});
		assert.equal(multi.eligible, false);
		assert.deepEqual(multi.failReasons, ["absent", "late", "undertime", "leave"]);
	});

	it("PFA defaults use full classic perfect attendance flags", () => {
		assert.equal(PFA_ELIGIBILITY_DEFAULTS.eligibilityMode, "ATTENDANCE_QUALIFIED");
		assert.equal(PFA_ELIGIBILITY_DEFAULTS.eligibilityDisqualifyOnAbsent, true);
		assert.equal(PFA_ELIGIBILITY_DEFAULTS.eligibilityDisqualifyOnLate, true);
		assert.equal(PFA_ELIGIBILITY_DEFAULTS.eligibilityDisqualifyOnUndertime, true);
		assert.equal(PFA_ELIGIBILITY_DEFAULTS.eligibilityDisqualifyOnLeave, true);
	});
});
