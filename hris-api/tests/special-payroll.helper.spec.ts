import assert from "node:assert/strict";
import {
	buildSourceFingerprint,
	buildSpecialPayrollRunCode,
	buildSpecialPayslipNumber,
	isMaterialEmployeeNameMismatch,
	normalizeSpecialPayrollImportRow,
	parseSpecialPayrollAmount,
	parseSpecialPayrollDate,
	validateSpecialPayrollRow,
} from "../helper/special-payroll.helper";

describe("special-payroll.helper", () => {
	it("maps sample Excel headers (COMCODE, EmployeeID, StartPayDate) to canonical keys", () => {
		const row = normalizeSpecialPayrollImportRow({
			COMCODE: "AINC",
			Amount: "1,250.50",
			EmployeeID: "01466",
			EmployeeName: "Leyesa, Ma. Angelica N.",
			StartPayDate: "26/07/2026",
		});

		assert.equal(row.COMPENSATION_CODE, "AINC");
		assert.equal(row.AMOUNT, "1,250.50");
		assert.equal(row.EMPLOYEE_NUMBER, "01466");
		assert.equal(row.EMPLOYEE_NAME, "Leyesa, Ma. Angelica N.");
		assert.equal(row.START_PAY_DATE, "26/07/2026");
	});

	it("keeps canonical template headers", () => {
		const row = normalizeSpecialPayrollImportRow({
			COMPENSATION_CODE: "LLA",
			AMOUNT: 250,
			EMPLOYEE_NUMBER: "1001",
			EMPLOYEE_NAME: "Sample, Employee",
			START_PAY_DATE: "2026-07-26",
		});
		assert.equal(row.COMPENSATION_CODE, "LLA");
		assert.equal(row.EMPLOYEE_NUMBER, "1001");
	});

	it("parses currency amounts and source dates (audit only)", () => {
		assert.equal(parseSpecialPayrollAmount("1,250.50"), 1250.5);
		assert.equal(parseSpecialPayrollAmount(250), 250);
		assert.equal(parseSpecialPayrollAmount(""), null);

		const d = parseSpecialPayrollDate("26/07/2026");
		assert.ok(d);
		assert.equal(d!.toISOString().slice(0, 10), "2026-07-26");
	});

	it("validates a good row and rejects zero amount", () => {
		const good = validateSpecialPayrollRow(
			normalizeSpecialPayrollImportRow({
				COMCODE: "AINC",
				Amount: 100,
				EmployeeID: "01466",
			}),
		);
		assert.equal(good.ok, true);
		if (good.ok) {
			assert.equal(good.compensationCode, "AINC");
			assert.equal(good.amount, 100);
			assert.equal(good.sourcePayDate, null);
		}

		const zero = validateSpecialPayrollRow(
			normalizeSpecialPayrollImportRow({
				COMCODE: "AINC",
				Amount: 0,
				EmployeeID: "01466",
			}),
		);
		assert.equal(zero.ok, false);
	});

	it("detects material employee name mismatches", () => {
		assert.equal(
			isMaterialEmployeeNameMismatch("Leyesa, Ma. Angelica", "Leyesa, Ma. Angelica N."),
			false,
		);
		assert.equal(
			isMaterialEmployeeNameMismatch("Totally Different Person", "Leyesa, Ma. Angelica N."),
			true,
		);
		assert.equal(isMaterialEmployeeNameMismatch("", "Leyesa, Ma. Angelica N."), false);
	});

	it("builds stable source fingerprints and run/payslip codes", () => {
		const fp1 = buildSourceFingerprint({
			organizationId: "org1",
			contextPayrollPeriodId: "period1",
			contextStartDate: "2026-07-26",
			contextEndDate: "2026-08-11",
			label: "Annual Incentive 2026",
			rows: [
				{ employeeNumber: "2", compensationCode: "B", amount: 2 },
				{ employeeNumber: "1", compensationCode: "A", amount: 1 },
			],
		});
		const fp2 = buildSourceFingerprint({
			organizationId: "org1",
			contextPayrollPeriodId: "period1",
			contextStartDate: "2026-07-26",
			contextEndDate: "2026-08-11",
			label: "Annual Incentive 2026",
			rows: [
				{ employeeNumber: "1", compensationCode: "A", amount: 1 },
				{ employeeNumber: "2", compensationCode: "B", amount: 2 },
			],
		});
		assert.equal(fp1, fp2);
		assert.match(buildSpecialPayrollRunCode(new Date("2026-07-29T00:00:00Z")), /^SPR-20260729-/);
		assert.equal(buildSpecialPayslipNumber("SPR-20260729-ABC", 3), "SPS-SPR-20260729-ABC-0003");
	});
});
