import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { ENTERPRISE_CSV_FILENAME_MAP } from "../scripts/migration/enterprise-csv-loader";
import { DM_REPORT_DEFINITIONS } from "../scripts/migration/migration-dm-report";
import {
	MIGRATION_DM_MASTERLIST,
	TIMESHEET_MIGRATION_QUALITY_GATES,
	getTimesheetMigrationQualityEntries,
} from "../scripts/migration/migration-dm-masterlist";

describe("enterprise migration DM masterlist", () => {
	it("keeps one quality-mapped masterlist row for every canonical DM report row", () => {
		assert.equal(MIGRATION_DM_MASTERLIST.length, DM_REPORT_DEFINITIONS.length);
		assert.deepEqual(
			MIGRATION_DM_MASTERLIST.map((row) => `${row.dmCode} ${row.sourceFile}`),
			DM_REPORT_DEFINITIONS.map((row) => `${row.dmCode} ${row.fileName}`),
		);
		assert.equal(
			new Set(MIGRATION_DM_MASTERLIST.map((row) => row.dmCode)).size,
			MIGRATION_DM_MASTERLIST.length,
		);
	});

	it("maps every recognized enterprise dataset to a target model and key fields", () => {
		const expectedDatasetKeys = Array.from(new Set(Object.values(ENTERPRISE_CSV_FILENAME_MAP))).sort();
		const mappedDatasetKeys = MIGRATION_DM_MASTERLIST.map((row) => row.datasetKey)
			.filter((value): value is NonNullable<typeof value> => Boolean(value))
			.sort();

		assert.deepEqual(mappedDatasetKeys, expectedDatasetKeys);
		for (const row of MIGRATION_DM_MASTERLIST) {
			assert.ok(row.businessGroup, `${row.dmCode} should have a business group`);
			assert.ok(row.businessName, `${row.dmCode} should have a business name`);
			assert.ok(row.targetModels.length > 0, `${row.dmCode} should have target models`);
			assert.ok(row.keyFields.length > 0, `${row.dmCode} should have key fields`);
		}
	});

	it("requires baseline quality gates for every DM0-DM7 mapping", () => {
		const expectedGroups = ["DM0", "DM1", "DM2", "DM3", "DM4", "DM5", "DM6", "DM7"];
		assert.deepEqual(
			Array.from(new Set(MIGRATION_DM_MASTERLIST.map((row) => row.dmGroup))),
			expectedGroups,
		);

		for (const row of MIGRATION_DM_MASTERLIST) {
			for (const gate of [
				"mapping-coverage",
				"schema-validation",
				"dry-run",
				"idempotency",
				"count-reconciliation",
				"timing-capture",
				"go-no-go-reporting",
			] as const) {
				assert.equal(row.qualityGates.includes(gate), true, `${row.dmCode} missing ${gate}`);
			}
			if (row.dependencies.length > 0) {
				assert.equal(
					row.qualityGates.includes("referential-integrity"),
					true,
					`${row.dmCode} has dependencies and must require referential-integrity`,
				);
			}
		}
	});

	it("pins timesheet migration quality to effective lines and paid payroll snapshots", () => {
		const entries = getTimesheetMigrationQualityEntries();
		assert.deepEqual(
			entries.map((row) => row.datasetKey),
			["timesheets", "timesheetLines", "employeePayrolls"],
		);

		const timesheetHeader = entries.find((row) => row.datasetKey === "timesheets");
		const timesheetLines = entries.find((row) => row.datasetKey === "timesheetLines");
		const payrollHistory = entries.find((row) => row.datasetKey === "employeePayrolls");

		assert.equal(timesheetHeader?.dmCode, "DM6.2");
		assert.equal(timesheetLines?.dmCode, "DM6.3");
		assert.equal(payrollHistory?.dmCode, "DM6.4");
		assert.deepEqual(timesheetLines?.targetModels, ["Timesheetline"]);
		assert.deepEqual(payrollHistory?.targetModels, ["EmployeePayroll"]);

		for (const gate of TIMESHEET_MIGRATION_QUALITY_GATES) {
			assert.equal(timesheetHeader?.qualityGates.includes(gate), true, `timesheets missing ${gate}`);
			assert.equal(timesheetLines?.qualityGates.includes(gate), true, `timesheetLines missing ${gate}`);
		}

		assert.equal(
			payrollHistory?.qualityGates.includes("paid-payroll-snapshot-boundary"),
			true,
			"payroll history must preserve EmployeePayroll.timesheetSnapshot as paid-history truth",
		);
	});

	it("keeps the employee business mapping visible even though the technical code is DM4.2", () => {
		const employees = MIGRATION_DM_MASTERLIST.find((row) => row.datasetKey === "employees");
		assert.equal(employees?.dmCode, "DM4.2");
		assert.equal(employees?.businessName, "Employees");
		assert.deepEqual(employees?.targetModels, ["Employee", "User"]);
		assert.deepEqual(employees?.keyFields, ["employeeId"]);
	});
});
