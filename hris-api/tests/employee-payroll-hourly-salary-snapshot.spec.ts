import { expect } from "chai";
import { roundToCentavo } from "../helper/tax-calculator.helper";
import {
	BANDAI_DIRECT_ANNUAL_WORK_DAYS,
	BANDAI_WORKING_HOURS_PER_DAY,
	computeEmployeePayrollHourlySalarySnapshot,
	resolveBnpiAttendanceDailyRate,
} from "../helper/payroll-period.helper";

describe("computeEmployeePayrollHourlySalarySnapshot", () => {
	it("313 path: monthly 15950 daily / 8, snapshot matches rounded centavo", () => {
		const estimatedMonthlyRate = 15950;
		const rate = resolveBnpiAttendanceDailyRate({
			periodBasic: 7975,
			estimatedMonthlyRate,
			totalWorkDays: 13,
			useBnpi313: true,
			scheduleWorkingHoursPerDay: 8,
		});
		const expectedDaily = (estimatedMonthlyRate * 12) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
		expect(rate.dailyRate).to.be.closeTo(expectedDaily, 1e-9);
		const expectedHourly = roundToCentavo(expectedDaily / BANDAI_WORKING_HOURS_PER_DAY);
		const snapshot = computeEmployeePayrollHourlySalarySnapshot({
			dailyRate: rate.dailyRate,
			hourlyRate: rate.hourlyRate,
			workingHoursPerDay: rate.workingHoursPerDay,
		});
		expect(snapshot).to.equal(expectedHourly);
		expect(snapshot).to.equal(roundToCentavo(rate.hourlyRate));
	});

	it("cutoff path: 7975/13 daily, hourly = daily/8", () => {
		const periodBasic = 7975;
		const totalWorkDays = 13;
		const rate = resolveBnpiAttendanceDailyRate({
			periodBasic,
			estimatedMonthlyRate: 15950,
			totalWorkDays,
			useBnpi313: false,
			scheduleWorkingHoursPerDay: 8,
		});
		const expectedDaily = periodBasic / totalWorkDays;
		expect(rate.dailyRate).to.be.closeTo(expectedDaily, 1e-9);
		const expectedHourly = roundToCentavo(expectedDaily / BANDAI_WORKING_HOURS_PER_DAY);
		const snapshot = computeEmployeePayrollHourlySalarySnapshot({
			dailyRate: rate.dailyRate,
			hourlyRate: rate.hourlyRate,
			workingHoursPerDay: rate.workingHoursPerDay,
		});
		expect(snapshot).to.equal(expectedHourly);
	});

	it("daily 0 → hourly 0", () => {
		expect(
			computeEmployeePayrollHourlySalarySnapshot({
				dailyRate: 0,
			}),
		).to.equal(0);
		expect(
			computeEmployeePayrollHourlySalarySnapshot({
				dailyRate: 0,
				hourlyRate: 0,
			}),
		).to.equal(0);
	});

	it("uses explicit hourlyRate when provided", () => {
		const snapshot = computeEmployeePayrollHourlySalarySnapshot({
			dailyRate: 800,
			hourlyRate: 99.123,
			workingHoursPerDay: 8,
		});
		expect(snapshot).to.equal(roundToCentavo(99.123));
	});

	it("derives daily/hours when explicit hourlyRate is 0 and daily exists", () => {
		const snapshot = computeEmployeePayrollHourlySalarySnapshot({
			dailyRate: 800,
			hourlyRate: 0,
			workingHoursPerDay: 8,
		});
		expect(snapshot).to.equal(roundToCentavo(800 / 8));
	});
});
