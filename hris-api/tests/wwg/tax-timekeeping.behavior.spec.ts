import { expect } from "chai";
import {
	WITHHOLDING_TAX_TABLE,
	calculateWithholdingTax,
	calculateSSSContribution,
	calculatePhilHealthContribution,
	calculatePagIbigContribution,
	calculateTotalContributions,
	calculatePayroll,
	getTaxBracket,
	formatPHP,
	roundToCentavo,
	roundUpToPeso,
	calculateYTDWithholdingTax,
	getContributionBreakdown,
	calculateProratedPayroll,
	SSS_CONFIG,
	PHILHEALTH_CONFIG,
	PAGIBIG_CONFIG,
} from "../../helper/tax-calculator.helper";
import {
	determineAttendanceStatus,
	timeToMinutes,
	minutesToHours,
	formatMinutesAsTime,
	calculateTotalMinutes,
	computeNightShiftForDay,
	generateTimesheetSummary,
} from "../../helper/timekeeping.helper";

describe("calculateWithholdingTax", () => {
	it("returns 0 when no rates", () => expect(calculateWithholdingTax(10000)).to.equal(0));
	it("returns 0 for first bracket", () =>
		expect(calculateWithholdingTax(10000, WITHHOLDING_TAX_TABLE)).to.equal(0));
	it("calculates second bracket tax", () =>
		expect(calculateWithholdingTax(25000, WITHHOLDING_TAX_TABLE)).to.be.greaterThan(0));
	it("supports semi-monthly mode", () =>
		expect(calculateWithholdingTax(20000, WITHHOLDING_TAX_TABLE, true)).to.be.a("number"));
	it("returns numeric value for high income", () =>
		expect(calculateWithholdingTax(500000, WITHHOLDING_TAX_TABLE)).to.be.a("number"));
});

describe("calculateSSSContribution", () => {
	it("returns 0 without config", () => expect(calculateSSSContribution(20000)).to.equal(0));
	it("applies configured contribution", () =>
		expect(calculateSSSContribution(20000, SSS_CONFIG)).to.be.greaterThan(0));
	it("applies minimum floor", () =>
		expect(calculateSSSContribution(100, SSS_CONFIG)).to.be.greaterThan(0));
	it("applies maximum cap", () =>
		expect(calculateSSSContribution(200000, SSS_CONFIG)).to.be.at.most(SSS_CONFIG.maximumCeiling));
	it("returns rounded value", () =>
		expect(calculateSSSContribution(20333, SSS_CONFIG) * 100).to.be.closeTo(
			Math.round(calculateSSSContribution(20333, SSS_CONFIG) * 100),
			1e-9,
		));
});

describe("calculatePhilHealthContribution", () => {
	it("returns 0 without config", () => expect(calculatePhilHealthContribution(20000)).to.equal(0));
	it("returns 0 below minimum base", () =>
		expect(calculatePhilHealthContribution(100, PHILHEALTH_CONFIG)).to.equal(0));
	it("computes contribution within range", () =>
		expect(calculatePhilHealthContribution(20000, PHILHEALTH_CONFIG)).to.be.greaterThan(0));
	it("caps at maximum ceiling", () =>
		expect(calculatePhilHealthContribution(999999, PHILHEALTH_CONFIG)).to.equal(
			PHILHEALTH_CONFIG.maximumCeiling,
		));
	it("returns rounded two-decimal value", () =>
		expect(calculatePhilHealthContribution(12345, PHILHEALTH_CONFIG) * 100).to.be.closeTo(
			Math.round(calculatePhilHealthContribution(12345, PHILHEALTH_CONFIG) * 100),
			1e-9,
		));
});

describe("calculatePagIbigContribution", () => {
	it("returns 0 without config", () => expect(calculatePagIbigContribution(20000)).to.equal(0));
	it("uses low-income rate below threshold", () =>
		expect(calculatePagIbigContribution(1000, PAGIBIG_CONFIG)).to.equal(10));
	it("uses high-income rate above threshold", () =>
		expect(calculatePagIbigContribution(2000, PAGIBIG_CONFIG)).to.equal(40));
	it("caps at configured maximum", () =>
		expect(calculatePagIbigContribution(100000, PAGIBIG_CONFIG)).to.equal(PAGIBIG_CONFIG.maximumCeiling));
	it("returns rounded output", () =>
		expect(calculatePagIbigContribution(1999, PAGIBIG_CONFIG) * 100).to.be.closeTo(
			Math.round(calculatePagIbigContribution(1999, PAGIBIG_CONFIG) * 100),
			1e-9,
		));
});

describe("calculateTotalContributions", () => {
	it("returns all zeros without configs", () =>
		expect(calculateTotalContributions(20000)).to.deep.equal({
			sss: 0,
			philHealth: 0,
			pagIbig: 0,
			total: 0,
		}));
	it("sums configured contributions", () => {
		const out = calculateTotalContributions(20000, SSS_CONFIG, PHILHEALTH_CONFIG, PAGIBIG_CONFIG);
		expect(out.total).to.equal(roundToCentavo(out.sss + out.philHealth + out.pagIbig));
	});
	it("returns rounded fields", () => {
		const out = calculateTotalContributions(20333, SSS_CONFIG, PHILHEALTH_CONFIG, PAGIBIG_CONFIG);
		expect(out.total * 100).to.be.closeTo(Math.round(out.total * 100), 1e-9);
	});
	it("handles low income", () =>
		expect(calculateTotalContributions(1000, SSS_CONFIG, PHILHEALTH_CONFIG, PAGIBIG_CONFIG).total).to.be
			.greaterThan(0));
	it("handles high income with caps", () =>
		expect(calculateTotalContributions(500000, SSS_CONFIG, PHILHEALTH_CONFIG, PAGIBIG_CONFIG).total).to.be
			.greaterThan(0));
});

describe("calculatePayroll", () => {
	it("returns full payroll shape", () => {
		const out = calculatePayroll(
			35000,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);
		expect(out).to.have.keys([
			"grossIncome",
			"contributions",
			"taxableIncome",
			"withholdingTax",
			"totalDeductions",
			"netPay",
		]);
	});
	it("produces net pay less than gross when deductions exist", () => {
		const out = calculatePayroll(
			35000,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);
		expect(out.netPay).to.be.lessThan(out.grossIncome);
	});
	it("supports zero deductions path", () => {
		const out = calculatePayroll(10000);
		expect(out.netPay).to.equal(out.grossIncome);
	});
	it("rounds outputs", () => {
		const out = calculatePayroll(
			35000.123,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);
		expect(out.grossIncome * 100).to.be.closeTo(Math.round(out.grossIncome * 100), 1e-9);
	});
	it("calculates taxable income as gross minus contribution total", () => {
		const out = calculatePayroll(
			35000,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);
		expect(out.taxableIncome).to.equal(roundToCentavo(out.grossIncome - out.contributions.total));
	});
});

describe("getTaxBracket", () => {
	it("returns null with missing rates", () => expect(getTaxBracket(10000)).to.equal(null));
	it("returns a bracket for valid income", () =>
		expect(getTaxBracket(30000, WITHHOLDING_TAX_TABLE)).to.not.equal(null));
	it("matches first bracket for low income", () =>
		expect(getTaxBracket(10000, WITHHOLDING_TAX_TABLE)?.monthlyBase).to.equal(0));
	it("handles very high income bracket", () =>
		expect(getTaxBracket(999999, WITHHOLDING_TAX_TABLE)?.monthlyCap).to.equal(null));
	it("returns object with expected keys", () => {
		const bracket = getTaxBracket(35000, WITHHOLDING_TAX_TABLE);
		expect(bracket).to.have.property("rate");
	});
});

describe("formatPHP / roundToCentavo / roundUpToPeso", () => {
	it("formatPHP includes peso sign", () => expect(formatPHP(100)).to.contain("₱"));
	it("formatPHP keeps two decimals", () => expect(formatPHP(100)).to.match(/\.00$/));
	it("roundToCentavo rounds correctly", () => expect(roundToCentavo(1.236)).to.equal(1.24));
	it("roundUpToPeso rounds up", () => expect(roundUpToPeso(10.1)).to.equal(11));
	it("roundUpToPeso keeps integer", () => expect(roundUpToPeso(10)).to.equal(10));
});

describe("calculateYTDWithholdingTax / getContributionBreakdown / calculateProratedPayroll", () => {
	it("calculateYTDWithholdingTax returns number", () =>
		expect(calculateYTDWithholdingTax([10000, 20000, 30000])).to.be.a("number"));
	it("calculateYTDWithholdingTax handles empty list", () =>
		expect(calculateYTDWithholdingTax([])).to.equal(0));
	it("getContributionBreakdown returns breakdown structure", () => {
		const out = getContributionBreakdown(20000, SSS_CONFIG, PHILHEALTH_CONFIG, PAGIBIG_CONFIG);
		expect(out).to.have.keys(["sss", "philHealth", "pagIbig"]);
	});
	it("calculateProratedPayroll uses split factor when provided", () => {
		const out = calculateProratedPayroll(
			40000,
			20000,
			0.5,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);
		expect(out.grossIncome).to.equal(20000);
	});
	it("calculateProratedPayroll returns rounded components", () => {
		const out = calculateProratedPayroll(
			40000,
			18000,
			undefined,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);
		expect(out.totalDeductions * 100).to.be.closeTo(Math.round(out.totalDeductions * 100), 1e-9);
	});
});

describe("determineAttendanceStatus / timeToMinutes / minutesToHours / formatMinutesAsTime", () => {
	it("determineAttendanceStatus returns INCOMPLETE without timeOut", () =>
		expect(determineAttendanceStatus({} as any, false)).to.equal("INCOMPLETE"));
	it("determineAttendanceStatus returns PRESENT with timeOut", () =>
		expect(determineAttendanceStatus({} as any, true)).to.equal("PRESENT"));
	it("timeToMinutes parses HH:mm", () => expect(timeToMinutes("01:30")).to.equal(90));
	it("minutesToHours converts and rounds", () => expect(minutesToHours(125)).to.equal(2.08));
	it("formatMinutesAsTime formats hh:mm", () => expect(formatMinutesAsTime(125)).to.equal("2:05"));
});

describe("calculateTotalMinutes / generateTimesheetSummary / computeNightShiftForDay", () => {
	it("calculateTotalMinutes returns zero totals for empty list", () => {
		const out = calculateTotalMinutes([]);
		expect(out).to.deep.equal({
			totalRegularMinutes: 0,
			totalOvertimeMinutes: 0,
			totalUndertimeMinutes: 0,
			totalLateMinutes: 0,
			totalEarlyOutMinutes: 0,
		});
	});
	it("calculateTotalMinutes aggregates one simple attendance", () => {
		const out = calculateTotalMinutes([
			{
				timeIn: new Date("2026-01-01T00:00:00.000Z"),
				timeOut: new Date("2026-01-01T01:00:00.000Z"),
				scheduleSnapshot: null,
				date: new Date("2026-01-01T00:00:00.000Z"),
			},
		]);
		expect(out.totalRegularMinutes).to.equal(60);
	});
	it("generateTimesheetSummary returns metadata object", () => {
		const out = generateTimesheetSummary([]);
		expect(out.metadata.totalMinutesWorked).to.equal(0);
	});
	it("computeNightShiftForDay returns null when non-overnight", () =>
		expect(computeNightShiftForDay({ isOvernight: false })).to.equal(null));
	it("computeNightShiftForDay returns structured result for overnight", () => {
		const out = computeNightShiftForDay({
			isOvernight: true,
			scheduleStartTime: "22:00",
			scheduleEndTime: "06:00",
			timeIn: "2026-01-01T14:00:00.000Z",
			timeOut: "2026-01-01T22:00:00.000Z",
		});
		expect(out?.isNightShiftDay).to.equal(true);
	});
});
