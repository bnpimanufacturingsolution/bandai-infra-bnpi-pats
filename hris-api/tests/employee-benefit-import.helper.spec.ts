import assert from "node:assert/strict";
import {
	normalizeBenefitImportRow,
	parseBenefitImportAmount,
	parseBenefitImportDate,
	validateBenefitImportRow,
} from "../helper/employee-benefit-import.helper";

describe("employee-benefit-import.helper", () => {
	it("maps sample Excel headers (COMCODE, EmployeeID, StartPayDate) to canonical keys", () => {
		const row = normalizeBenefitImportRow({
			COMCODE: "LLA",
			Amount: 250,
			EmployeeID: "01466",
			EmployeeName: "Leyesa, Ma. Angelica N.",
			StartPayDate: "26/06/2026",
		});

		assert.equal(row.BENEFIT_CODE, "LLA");
		assert.equal(row.AMOUNT, 250);
		assert.equal(row.EMPLOYEE_NUMBER, "01466");
		assert.equal(row.EMPLOYEE_NAME, "Leyesa, Ma. Angelica N.");
		assert.equal(row.START_DATE, "26/06/2026");
	});

	it("keeps legacy EMPLOYEE_NUMBER + BENEFIT_TYPE headers", () => {
		const row = normalizeBenefitImportRow({
			EMPLOYEE_NUMBER: "1001",
			BENEFIT_TYPE: "Line Leader Allowance",
			AMOUNT: "100.50",
			START_DATE: "2026-06-26",
		});
		assert.equal(row.EMPLOYEE_NUMBER, "1001");
		assert.equal(row.BENEFIT_TYPE, "Line Leader Allowance");
		assert.equal(row.AMOUNT, "100.50");
	});

	it("parses DD/MM/YYYY start pay dates", () => {
		const d = parseBenefitImportDate("26/06/2026");
		assert.ok(d);
		assert.equal(d!.toISOString().slice(0, 10), "2026-06-26");
	});

	it("parses Excel serial dates", () => {
		// 2026-06-26 Excel serial (1900 date system, epoch 1899-12-30)
		const expected = Date.UTC(2026, 5, 26);
		const serial = (expected - Date.UTC(1899, 11, 30)) / (24 * 60 * 60 * 1000);
		const d = parseBenefitImportDate(serial);
		assert.ok(d);
		assert.equal(d!.toISOString().slice(0, 10), "2026-06-26");
	});

	it("parses currency-ish amounts", () => {
		assert.equal(parseBenefitImportAmount("250.00"), 250);
		assert.equal(parseBenefitImportAmount("1,250.50"), 1250.5);
		assert.equal(parseBenefitImportAmount(250), 250);
		assert.equal(parseBenefitImportAmount(""), null);
	});

	it("validates a good sample row", () => {
		const result = validateBenefitImportRow(
			normalizeBenefitImportRow({
				COMCODE: "LLA",
				Amount: 250,
				EmployeeID: "01466",
				StartPayDate: "26/06/2026",
			}),
		);
		assert.equal(result.ok, true);
		if (result.ok) {
			assert.equal(result.employeeNumber, "01466");
			assert.equal(result.benefitCode, "LLA");
			assert.equal(result.amount, 250);
			assert.equal(result.startDate.toISOString().slice(0, 10), "2026-06-26");
		}
	});

	it("fails when amount is zero or missing benefit", () => {
		const zero = validateBenefitImportRow(
			normalizeBenefitImportRow({
				COMCODE: "LLA",
				Amount: 0,
				EmployeeID: "01466",
				StartPayDate: "26/06/2026",
			}),
		);
		assert.equal(zero.ok, false);

		const noBenefit = validateBenefitImportRow(
			normalizeBenefitImportRow({
				Amount: 100,
				EmployeeID: "01466",
				StartPayDate: "26/06/2026",
			}),
		);
		assert.equal(noBenefit.ok, false);
	});
});
