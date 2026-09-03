import fs from "fs";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import { describe, it } from "mocha";
import {
	ENTERPRISE_CSV_FILENAME_MAP,
	loadEnterpriseMigrationDataFromCsvDir,
} from "../scripts/migration/enterprise-csv-loader";

describe("enterprise-csv-loader", () => {
	it("recognizes canonical csv filenames", () => {
		assert.equal(ENTERPRISE_CSV_FILENAME_MAP.departments, "departments");
		assert.equal(ENTERPRISE_CSV_FILENAME_MAP.employee_payrolls, "employeePayrolls");
	});

	it("loads recognized csv files and infers stages", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "departments.csv"),
				["code,name,parentCode", "HR,Human Resources,", "IT,Information Technology,HR"].join(
					"\n",
				),
			);
			fs.writeFileSync(
				path.join(tempDir, "employees.csv"),
				[
					"employeeId,role,departmentCode,positionCode,basicSalary",
					"EMP-001,hris-employee,HR,HR-STAFF,25000",
				].join("\n"),
			);

			const result = loadEnterpriseMigrationDataFromCsvDir(tempDir);

			assert.equal(result.loadedFiles.length, 2);
			assert.equal(result.data.departments.length, 2);
			assert.equal(result.data.employees.length, 1);
			assert.ok(result.inferredStages.includes("PRE_MIGRATION_CONTROLS"));
			assert.ok(result.inferredStages.includes("ORG_STRUCTURE_SKELETON"));
			assert.ok(result.inferredStages.includes("EMPLOYMENT_BASE"));
			assert.ok(result.inferredStages.includes("POST_MIGRATION_RECONCILIATION"));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("recognizes representative datasets across DM0 to DM6 buckets from synthetic fixtures", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-dm-buckets-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "organization.csv"),
				["code,name,description", "BNEI,Bandai Namco Test Org,Synthetic DM0 fixture"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "calculators.csv"),
				["name,type", "Basic Payroll,BASIC"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "shift_types.csv"),
				["code,name,startTime,endTime,isOff", "DAY,Day Shift,09:00,18:00,false"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "departments.csv"),
				["code,name,parentCode", "HR,Human Resources,"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "persons.csv"),
				["employeeNumber,firstName,lastName,email", "EMP-001,Cara,Cruz,cara@example.com"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "document_folders.csv"),
				["employeeId,code,name", "EMP-001,FOLDER-001,Employee 201 Folder"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "attendances.csv"),
				["employeeId,date,status", "EMP-001,2026-05-01T00:00:00.000Z,PRESENT"].join("\n"),
			);

			const result = loadEnterpriseMigrationDataFromCsvDir(tempDir);
			const loadedDatasetKeys = new Set(result.loadedFiles.map((file) => file.datasetKey));

			assert.equal(loadedDatasetKeys.has("organization"), true);
			assert.equal(loadedDatasetKeys.has("calculators"), true);
			assert.equal(loadedDatasetKeys.has("shiftTypes"), true);
			assert.equal(loadedDatasetKeys.has("departments"), true);
			assert.equal(loadedDatasetKeys.has("persons"), true);
			assert.equal(loadedDatasetKeys.has("documentFolders"), true);
			assert.equal(loadedDatasetKeys.has("attendances"), true);

			assert.ok(result.inferredStages.includes("FOUNDATION_MASTER"));
			assert.ok(result.inferredStages.includes("CORE_CONFIGURATION"));
			assert.ok(result.inferredStages.includes("WORK_PATTERN_MASTER"));
			assert.ok(result.inferredStages.includes("ORG_STRUCTURE_SKELETON"));
			assert.ok(result.inferredStages.includes("IDENTITY_MASTER"));
			assert.ok(result.inferredStages.includes("EMPLOYEE_ATTACHMENT_OPENING_BALANCE"));
			assert.ok(result.inferredStages.includes("CLOSED_HISTORICAL_OPERATIONAL_LEDGER"));
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("normalizes raw employee section and position columns using existing definitions", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-raw-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "departments.csv"),
				["code,name,parentCode", "GA-HR,GA/HR,"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "positions.csv"),
				[
					"title,code,description,departmentCode,minSalary,maxSalary",
					"Staff,STF,Staff role,GA-HR,22000,42000",
				].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "employees.csv"),
				[
					"Employee No.,Section,Position,Employment Status",
					"EMP-001,GA/HR,Staff,Active",
				].join("\n"),
			);

			const result = loadEnterpriseMigrationDataFromCsvDir(tempDir);

			assert.equal(result.data.employees.length, 1);
			assert.equal(result.data.employees[0].employeeId, "EMP-001");
			assert.equal(result.data.employees[0].role, "hris-employee");
			assert.equal(result.data.employees[0].departmentCode, "GA-HR");
			assert.equal(result.data.employees[0].positionCode, "STF");
			assert.equal(result.data.employees[0].basicSalary, 22000);
			assert.equal(result.normalizationSummary?.defaultedEmployeeRoles, 1);
			assert.equal(result.normalizationSummary?.derivedBasicSalaries, 1);
			assert.ok((result.normalizationSummary?.warnings[0] || "").includes("derived basicSalary=22000"));
			assert.deepEqual(result.normalizationSummary?.errors, []);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("preserves CSV row provenance on loaded dataset rows", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-source-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "sample-departments.csv"),
				["code,name,parentCode", "HR,Human Resources,"].join("\n"),
			);

			const result = loadEnterpriseMigrationDataFromCsvDir(tempDir);
			const source = (result.data.departments[0] as any)._csvSource;

			assert.deepEqual(source, {
				fileName: "sample-departments.csv",
				rowNumber: 2,
				datasetKey: "departments",
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("synthesizes missing departments and positions deterministically from employee rows", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-generated-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "employees.csv"),
				[
					"Employee No.,Section,Position,role,basicSalary",
					"EMP-001,Custom Section,Custom Role,,25000",
					"EMP-002,Custom Section,Custom Role,,26000",
				].join("\n"),
			);

			const result = loadEnterpriseMigrationDataFromCsvDir(tempDir);

			assert.equal(result.data.departments.length, 1);
			assert.equal(result.data.positions.length, 1);
			assert.equal(result.data.departments[0].name, "Custom Section");
			assert.equal(result.data.positions[0].title, "Custom Role");
			assert.equal(result.data.positions[0].departmentCode, result.data.departments[0].code);
			assert.equal(result.data.employees[0].departmentCode, result.data.departments[0].code);
			assert.equal(result.data.employees[1].departmentCode, result.data.departments[0].code);
			assert.equal(result.data.employees[0].positionCode, result.data.positions[0].code);
			assert.equal(result.data.employees[1].positionCode, result.data.positions[0].code);
			assert.equal(result.normalizationSummary?.createdDepartments, 1);
			assert.equal(result.normalizationSummary?.createdPositions, 1);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("fails clearly when salary is missing and no trusted position minSalary fallback exists", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-missing-salary-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "departments.csv"),
				["code,name,parentCode", "GA-HR,GA/HR,"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "positions.csv"),
				["title,code,description,departmentCode", "Staff,STF,Staff role,GA-HR"].join("\n"),
			);
			fs.writeFileSync(
				path.join(tempDir, "employees.csv"),
				["Employee No.,Section,Position,Employment Status", "EMP-001,GA/HR,Staff,Active"].join("\n"),
			);

			assert.throws(
				() => loadEnterpriseMigrationDataFromCsvDir(tempDir),
				/missing basicSalary.*no trusted minSalary fallback/i,
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("fails clearly when salary is non-positive", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-csv-loader-non-positive-salary-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "employees.csv"),
				["employeeId,role,departmentCode,positionCode,basicSalary", "EMP-001,hris-employee,HR,HR-STAFF,0"].join(
					"\n",
				),
			);

			assert.throws(() => loadEnterpriseMigrationDataFromCsvDir(tempDir), /non-positive basicSalary 0/i);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
