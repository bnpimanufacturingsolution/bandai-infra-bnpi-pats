import { strict as assert } from "assert";
import { EmployeeImportHelper, EmployeeImportRow } from "../helper/employee-import.helper";

const buildHelper = () => {
	const helper = new EmployeeImportHelper({} as any, "org-1");
	const writableHelper = helper as any;

	writableHelper.departmentCache.set("Administration", "dept-1");
	writableHelper.departmentCache.set("administration", "dept-1");
	writableHelper.positionCache.set("HR Associate", "pos-1");
	writableHelper.positionCache.set("hr associate", "pos-1");
	writableHelper.levelCache.set("Mid Staff", "level-1");
	writableHelper.levelCache.set("mid staff", "level-1");

	return helper;
};

const buildImportRow = (overrides: Partial<EmployeeImportRow> = {}): EmployeeImportRow => ({
	EMP_ID: "EMP-001",
	NAME: "Robles, Ella May",
	POSITION: "HR Associate",
	LEVEL: "Mid Staff",
	DEPARTMENT: "Administration",
	TIN: "695-992-556",
	SSS: "00-0000000-0",
	PHILHEALTH: "",
	PAGIBIG: "",
	HIRE_DATE: "2026-04-27",
	BASIC_SALARY: "25000",
	EMAIL: "ella.robles@example.com",
	...overrides,
});

describe("employee import helper document regression", () => {
	it("does not synthesize employee documents from statutory import columns", () => {
		const helper = buildHelper();
		const mapped = helper.mapRowToEmployeeData(buildImportRow());

		assert.equal(Object.prototype.hasOwnProperty.call(mapped.employee, "documents"), false);
		assert.equal(mapped.employee.metadata?.manpowerDatabank?.sourceSheet, "Manpower Databank");
		assert.equal(
			mapped.employee.metadata?.manpowerDatabank?.tinFormattedWithoutBranchCode,
			true,
		);
	});

	it("does not create placeholder document payloads when statutory columns are blank", () => {
		const helper = buildHelper();
		const mapped = helper.mapRowToEmployeeData(
			buildImportRow({
				TIN: "",
				SSS: "",
				PHILHEALTH: "",
				PAGIBIG: "",
			}),
		);

		assert.equal(Object.prototype.hasOwnProperty.call(mapped.employee, "documents"), false);
		assert.equal(
			mapped.employee.metadata?.manpowerDatabank?.tinFormattedWithoutBranchCode,
			null,
		);
	});

	it("keeps missing Manpower Databank email blank and preserves row provenance", () => {
		const helper = buildHelper();
		const mapped = helper.mapRowToEmployeeData(
			buildImportRow({
				EMAIL: "",
				SOURCE_SHEET: "Manpower Databank",
				SOURCE_ROW: "854",
			}),
		);

		assert.equal(mapped.person.contactInfo.email, "");
		assert.equal(mapped.employee.metadata?.manpowerDatabank?.sourceSheet, "Manpower Databank");
		assert.equal(mapped.employee.metadata?.manpowerDatabank?.sourceRow, "854");
	});
});
