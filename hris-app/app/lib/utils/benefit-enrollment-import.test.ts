import { describe, expect, it } from "vitest";
import {
	applyBenefitColumnMapping,
	autoMapBenefitEnrollmentHeaders,
	buildMappedEnrollmentCsvFile,
	getMissingRequiredBenefitMaps,
	validateMappedEnrollmentRows,
} from "./benefit-enrollment-import";

describe("benefit-enrollment-import", () => {
	it("auto-maps sample Excel aliases (COMCODE / EmployeeID)", () => {
		const mapping = autoMapBenefitEnrollmentHeaders([
			"COMCODE",
			"Amount",
			"EmployeeID",
			"EmployeeName",
			"StartPayDate",
		]);
		expect(mapping.BENEFIT_CODE).toBe("COMCODE");
		expect(mapping.AMOUNT).toBe("Amount");
		expect(mapping.EMPLOYEE_NUMBER).toBe("EmployeeID");
		expect(mapping.EMPLOYEE_NAME).toBe("EmployeeName");
		expect(mapping.START_DATE).toBe("StartPayDate");
		expect(getMissingRequiredBenefitMaps(mapping)).toEqual([]);
	});

	it("auto-maps schema template headers with no manual mapping needed", () => {
		const mapping = autoMapBenefitEnrollmentHeaders([
			"BENEFIT_CODE",
			"AMOUNT",
			"EMPLOYEE_NUMBER",
			"EMPLOYEE_NAME",
			"START_DATE",
			"END_DATE",
			"NAME",
			"DESCRIPTION",
			"NOTES",
		]);
		expect(mapping.EMPLOYEE_NUMBER).toBe("EMPLOYEE_NUMBER");
		expect(mapping.BENEFIT_CODE).toBe("BENEFIT_CODE");
		expect(mapping.AMOUNT).toBe("AMOUNT");
		expect(mapping.START_DATE).toBe("START_DATE");
		expect(mapping.EMPLOYEE_NAME).toBe("EMPLOYEE_NAME");
		expect(mapping.END_DATE).toBe("END_DATE");
		expect(mapping.IS_ACTIVE).toBeUndefined();
		expect(getMissingRequiredBenefitMaps(mapping)).toEqual([]);
	});

	it("reports missing required maps", () => {
		expect(getMissingRequiredBenefitMaps({ EMPLOYEE_NUMBER: "A" })).toEqual(
			expect.arrayContaining(["AMOUNT", "START_DATE", "BENEFIT_CODE or BENEFIT_TYPE"]),
		);
	});

	it("applies mapping and validates rows", () => {
		const headers = ["COMCODE", "Amount", "EmployeeID", "StartPayDate"];
		const rows = [
			["LLA", "250.00", "01466", "26/06/2026"],
			["LLA", "0", "01467", "26/06/2026"],
		];
		const mapping = autoMapBenefitEnrollmentHeaders(headers);
		const mapped = applyBenefitColumnMapping(headers, rows, mapping);
		expect(mapped[0].BENEFIT_CODE).toBe("LLA");
		expect(mapped[0].EMPLOYEE_NUMBER).toBe("01466");

		const issues = validateMappedEnrollmentRows(mapped);
		expect(issues.some((i) => i.row === 3 && i.field === "AMOUNT")).toBe(true);
	});

	it("builds a CSV file with canonical headers", async () => {
		const file = buildMappedEnrollmentCsvFile([
			{
				EMPLOYEE_NUMBER: "01466",
				BENEFIT_CODE: "LLA",
				AMOUNT: "250",
				START_DATE: "26/06/2026",
			},
		]);
		expect(file.name).toContain("benefit-enrollments");
		const text = await file.text();
		expect(text).toContain("EMPLOYEE_NUMBER");
		expect(text).toContain("BENEFIT_CODE");
		expect(text).toContain("01466");
	});
});
