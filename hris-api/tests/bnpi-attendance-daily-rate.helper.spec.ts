import { expect } from "chai";
import {
	BANDAI_DIRECT_ANNUAL_WORK_DAYS,
	resolveBnpiAttendanceDailyRate,
} from "../helper/payroll-period.helper";

describe("resolveBnpiAttendanceDailyRate (BNPI 313 attendance deductions)", () => {
	it("uses monthly × 12 / 313 when Bandai path is active (semi-monthly Alexa shape)", () => {
		const periodBasic = 7975;
		const estimatedMonthlyRate = 15950;
		const rate = resolveBnpiAttendanceDailyRate({
			periodBasic,
			estimatedMonthlyRate,
			totalWorkDays: 13,
			useBnpi313: true,
			scheduleWorkingHoursPerDay: 7.5,
		});
		expect(rate.method).to.equal("BNPI_DIRECT_313_ATTENDANCE");
		expect(rate.workingHoursPerDay).to.equal(8);
		// 15950 * 12 / 313 = 611.501597...
		expect(rate.dailyRate).to.be.closeTo((estimatedMonthlyRate * 12) / BANDAI_DIRECT_ANNUAL_WORK_DAYS, 1e-9);
		// 3 absent days → exact target Absent-Amt
		const absent3 = Math.round(3 * rate.dailyRate * 100) / 100;
		expect(absent3).to.equal(1834.5);
		// 330 late minutes → ~420.41
		const late330 = Math.round(330 * rate.minuteRate * 100) / 100;
		expect(late330).to.be.closeTo(420.41, 0.02);
	});

	it("keeps periodBasic / workdays when BNPI 313 is off", () => {
		const rate = resolveBnpiAttendanceDailyRate({
			periodBasic: 7975,
			estimatedMonthlyRate: 15950,
			totalWorkDays: 13,
			useBnpi313: false,
			scheduleWorkingHoursPerDay: 8,
		});
		expect(rate.method).to.equal("TIMESHEET_PERIOD_WORK_DAYS");
		expect(rate.dailyRate).to.be.closeTo(7975 / 13, 1e-9);
		const absent3 = Math.round(3 * rate.dailyRate * 100) / 100;
		expect(absent3).to.equal(1840.38);
	});

	it("does not use schedule 7.5 hours for BNPI minute rate", () => {
		const with313 = resolveBnpiAttendanceDailyRate({
			periodBasic: 7975,
			estimatedMonthlyRate: 15950,
			totalWorkDays: 13,
			useBnpi313: true,
			scheduleWorkingHoursPerDay: 7.5,
		});
		const without = resolveBnpiAttendanceDailyRate({
			periodBasic: 7975,
			estimatedMonthlyRate: 15950,
			totalWorkDays: 13,
			useBnpi313: false,
			scheduleWorkingHoursPerDay: 7.5,
		});
		expect(with313.workingHoursPerDay).to.equal(8);
		expect(without.workingHoursPerDay).to.equal(7.5);
	});
});
