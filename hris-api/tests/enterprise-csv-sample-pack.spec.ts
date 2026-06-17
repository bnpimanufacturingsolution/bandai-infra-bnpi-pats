import path from "path";
import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { RequestType } from "../generated/prisma";
import {
	ENTERPRISE_CSV_FILENAME_MAP,
	loadEnterpriseMigrationDataFromCsvDir,
} from "../scripts/migration/enterprise-csv-loader";
import { DM_REPORT_DEFINITIONS } from "../scripts/migration/migration-dm-report";

describe("enterprise csv sample pack", () => {
	it("keeps the sample organization aligned with the seeded local mock organization", () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const { data } = loadEnterpriseMigrationDataFromCsvDir(sampleDir);

		assert.equal(data.organization?.code, "bnei");
		assert.equal(data.organization?.name, "Bandai Namco");
	});

	it("keeps the sample employee pack at realistic validation volume", () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const { data } = loadEnterpriseMigrationDataFromCsvDir(sampleDir);

		assert.ok(data.employees.length >= 100, "sample pack should include at least 100 employees");
		assert.equal(
			data.persons.length,
			data.employees.length,
			"sample persons should remain 1:1 with sample employees",
		);
	});

	it("covers every recognized dataset with schema-aligned sample files", () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const result = loadEnterpriseMigrationDataFromCsvDir(sampleDir);
		const loadedDatasetKeys = new Set(result.loadedFiles.map((file) => file.datasetKey));
		const expectedDatasetKeys = Array.from(new Set(Object.values(ENTERPRISE_CSV_FILENAME_MAP)));

		expectedDatasetKeys.forEach((datasetKey) => {
			assert.equal(
				loadedDatasetKeys.has(datasetKey),
				true,
				`missing sample file for dataset ${datasetKey}`,
			);
		});
	});

	it("exercises every DM sheet group through the sample pack or reconciliation stage", () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const result = loadEnterpriseMigrationDataFromCsvDir(sampleDir);
		const loadedDatasetKeys = new Set(result.loadedFiles.map((file) => file.datasetKey));
		const exercisedSheetGroups = new Set(
			DM_REPORT_DEFINITIONS.filter((item) =>
				item.sourceType === "stage"
					? item.stage === "POST_MIGRATION_RECONCILIATION"
					: loadedDatasetKeys.has(item.datasetKey),
			).map((item) => item.sheetName),
		);

		["DM0", "DM1", "DM2", "DM3", "DM4", "DM5", "DM6", "DM7"].forEach((sheetName) => {
			assert.equal(exercisedSheetGroups.has(sheetName), true, `sample pack should exercise ${sheetName}`);
		});
	});

	it("keeps cross-file references internally consistent for the sample pack", () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const { data } = loadEnterpriseMigrationDataFromCsvDir(sampleDir);

		const departmentCodes = new Set(data.departments.map((row) => row.code));
		const levelNames = new Set(data.levels.map((row) => row.name));
		const positionCodes = new Set(data.positions.map((row) => row.code));
		const employeeIds = new Set(data.employees.map((row) => row.employeeId));
		const shiftTypeCodes = new Set(data.shiftTypes.map((row) => row.code));
		const scheduleTemplateCodes = new Set(data.scheduleTemplates.map((row) => row.code));
		const documentTypeCodes = new Set(data.documentTypes.map((row) => row.code));
		const benefitTypeNames = new Set(data.benefitTypes.map((row) => row.name));
		const loanTypeNames = new Set(data.loanTypes.map((row) => row.name));
		const payrollPeriodCodes = new Set(
			data.payrollPeriods.map((row) => row.code).filter((code): code is string => Boolean(code)),
		);
		const soaNumbers = new Set(data.statementsOfAccount.map((row) => row.soaNumber));
		const workflowCodes = new Set(
			data.workflowInstances.map((row) => row.code).filter((code): code is string => Boolean(code)),
		);
		const requestCodes = new Set(
			data.requests.map((row) => row.code).filter((code): code is string => Boolean(code)),
		);

		data.positions.forEach((row) => {
			assert.equal(departmentCodes.has(row.departmentCode || ""), true, `position ${row.code} department`);
		});

		data.positionLevels.forEach((row) => {
			assert.equal(positionCodes.has(row.positionCode), true, `position level ${row.positionCode}`);
			assert.equal(levelNames.has(row.levelName), true, `position level ${row.levelName}`);
		});

		data.departmentScheduleLinks.forEach((row) => {
			assert.equal(departmentCodes.has(row.departmentCode), true, `schedule link ${row.departmentCode}`);
			assert.equal(
				scheduleTemplateCodes.has(row.scheduleTemplateCode),
				true,
				`schedule link ${row.scheduleTemplateCode}`,
			);
		});

		data.employees.forEach((row) => {
			assert.equal(departmentCodes.has(row.departmentCode), true, `employee ${row.employeeId} department`);
			assert.equal(positionCodes.has(row.positionCode), true, `employee ${row.employeeId} position`);
			if (row.levelName) {
				assert.equal(levelNames.has(row.levelName), true, `employee ${row.employeeId} level`);
			}
		});

		data.reportingLines.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `reporting line employee ${row.employeeId}`);
			assert.equal(employeeIds.has(row.reportToEmployeeId), true, `reporting manager ${row.reportToEmployeeId}`);
		});

		data.departmentManagers.forEach((row) => {
			assert.equal(departmentCodes.has(row.departmentCode), true, `department manager ${row.departmentCode}`);
			assert.equal(employeeIds.has(row.managerEmployeeId), true, `department manager ${row.managerEmployeeId}`);
		});

		data.scheduleOverrides.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `schedule override employee ${row.employeeId}`);
			assert.equal(shiftTypeCodes.has(row.shiftTypeCode), true, `schedule override shift ${row.shiftTypeCode}`);
		});

		data.employeeScheduleHistories.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `schedule history employee ${row.employeeId}`);
			if (row.actorEmployeeId) {
				assert.equal(employeeIds.has(row.actorEmployeeId), true, `schedule history actor ${row.actorEmployeeId}`);
			}
		});

		data.documentFolders.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `document folder employee ${row.employeeId}`);
		});

		data.documents.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `document employee ${row.employeeId}`);
			if (row.documentTypeCode) {
				assert.equal(documentTypeCodes.has(row.documentTypeCode), true, `document type ${row.documentTypeCode}`);
			}
		});

		data.leaveBalances.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `leave balance employee ${row.employeeId}`);
		});

		data.employeeBenefits.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `benefit employee ${row.employeeId}`);
			assert.equal(benefitTypeNames.has(row.benefitTypeName), true, `benefit type ${row.benefitTypeName}`);
		});

		data.employeeBenefitInstallments.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `benefit installment employee ${row.employeeId}`);
			assert.equal(
				benefitTypeNames.has(row.benefitTypeName),
				true,
				`benefit installment type ${row.benefitTypeName}`,
			);
		});

		data.employeeLoans.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `loan employee ${row.employeeId}`);
			assert.equal(loanTypeNames.has(row.loanTypeName), true, `loan type ${row.loanTypeName}`);
		});

		data.attendances.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `attendance employee ${row.employeeId}`);
		});

		data.timesheets.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `timesheet employee ${row.employeeId}`);
			if (row.payrollPeriodCode) {
				assert.equal(payrollPeriodCodes.has(row.payrollPeriodCode), true, `timesheet period ${row.payrollPeriodCode}`);
			}
		});

		data.timesheetLines.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `timesheet line employee ${row.employeeId}`);
			if (row.payrollPeriodCode) {
				assert.equal(payrollPeriodCodes.has(row.payrollPeriodCode), true, `timesheet line period ${row.payrollPeriodCode}`);
			}
			if (row.timesheetCode) {
				assert.equal(
					data.timesheets.some((timesheet) => timesheet.code === row.timesheetCode),
					true,
					`timesheet line parent ${row.timesheetCode}`,
				);
			}
		});

		data.employeePayrolls.forEach((row) => {
			assert.equal(employeeIds.has(row.employeeId), true, `employee payroll employee ${row.employeeId}`);
			if (row.payrollPeriodCode) {
				assert.equal(
					payrollPeriodCodes.has(row.payrollPeriodCode),
					true,
					`employee payroll period ${row.payrollPeriodCode}`,
				);
			}
		});

		data.soaRemittances.forEach((row) => {
			assert.equal(soaNumbers.has(row.soaNumber), true, `soa remittance parent ${row.soaNumber}`);
		});

		data.workflowInstances.forEach((row) => {
			assert.equal(row.domain, "REQUEST");
		});

		data.requests.forEach((row) => {
			assert.equal(employeeIds.has(row.requesterEmployeeId), true, `request requester ${row.requesterEmployeeId}`);
			if (row.workflowCode) {
				assert.equal(workflowCodes.has(row.workflowCode), true, `request workflow ${row.workflowCode}`);
			}
		});

		data.workflowStepExecutions.forEach((row) => {
			if (row.workflowCode) {
				assert.equal(workflowCodes.has(row.workflowCode), true, `step workflow ${row.workflowCode}`);
			}
			if (row.requestCode) {
				assert.equal(requestCodes.has(row.requestCode), true, `step request ${row.requestCode}`);
			}
			if (row.assigneeEmployeeId) {
				assert.equal(employeeIds.has(row.assigneeEmployeeId), true, `step assignee ${row.assigneeEmployeeId}`);
			}
		});

		data.requestTransactions.forEach((row) => {
			if (row.requestCode) {
				assert.equal(requestCodes.has(row.requestCode), true, `transaction request ${row.requestCode}`);
			}
			if (row.workflowCode) {
				assert.equal(workflowCodes.has(row.workflowCode), true, `transaction workflow ${row.workflowCode}`);
			}
			if (row.actorEmployeeId) {
				assert.equal(employeeIds.has(row.actorEmployeeId), true, `transaction actor ${row.actorEmployeeId}`);
			}
		});
	});

	it("keeps sample request types aligned with the live Prisma RequestType enum", () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const { data } = loadEnterpriseMigrationDataFromCsvDir(sampleDir);
		const validRequestTypes = new Set(Object.values(RequestType));

		data.requests.forEach((row) => {
			assert.equal(
				validRequestTypes.has(row.type as RequestType),
				true,
				`request ${row.code || row.sourceRequestKey} type ${row.type} must match Prisma RequestType`,
			);
		});
	});
});
