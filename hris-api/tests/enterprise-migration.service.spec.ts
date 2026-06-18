import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import {
	buildEnterpriseAttendancePayload,
	buildEnterpriseEmployeePayrollPayload,
	enterpriseMigrationService,
} from "../app/migration/enterprise-migration.service";
import { loadEnterpriseMigrationDataFromCsvDir } from "../scripts/migration/enterprise-csv-loader";
import { ENTERPRISE_MIGRATION_STAGE_ORDER } from "../zod/migration.zod";

describe("enterprise migration attendance payload", () => {
	it("builds a schema-valid attendance payload without deviceEmpIdSnapshot", () => {
		const payload = buildEnterpriseAttendancePayload({
			attendance: {
				employeeId: "BNEI-003",
				date: new Date("2099-01-02T00:00:00.000Z"),
				timeIn: new Date("2099-01-02T09:00:00.000Z"),
				timeBreak: new Date("2099-01-02T12:00:00.000Z"),
				timeOut: new Date("2099-01-02T18:00:00.000Z"),
				status: "PRESENT",
				notes: "Sample attendance row",
				deviceEmpId: "DEV-003",
				metadata: { source: "sample-pack" },
				scheduleSnapshot: { shiftTypeCode: "DAY-STD" },
			},
			employee: {
				id: "emp-id",
				employeeId: "BNEI-003",
				departmentId: "dept-id",
				reportToId: "mgr-id",
				workforceSource: "DIRECT",
				agencyId: null,
			},
		});

		expect(payload).to.not.have.property("deviceEmpIdSnapshot");
		expect(payload).to.not.have.property("metadata");
		expect(payload).to.include({
			employeeCodeSnapshot: "BNEI-003",
			departmentIdSnapshot: "dept-id",
			reportToIdSnapshot: "mgr-id",
			workforceSourceSnapshot: "DIRECT",
			notes: "Sample attendance row",
		});
		expect(payload.employeeNameSnapshot).to.equal("BNEI-003");
		expect(payload.departmentNameSnapshot).to.equal(null);
		expect(payload.agencyIdSnapshot).to.equal(null);
		expect(payload.deviceInfo).to.deep.equal({
			deviceEmpId: "DEV-003",
			source: "enterprise-csv-migration",
			importContext: { source: "sample-pack" },
		});
	});
});

describe("enterprise migration employee payroll payload", () => {
	it("builds a schema-valid payroll payload without unsupported top-level hour fields", () => {
		const payload = buildEnterpriseEmployeePayrollPayload({
			payroll: {
				employeeId: "BNEI-003",
				payrollPeriodCode: "PAY-2099-01A",
				timesheetCode: "TS-2099-01A-0001",
				basicPay: 2000,
				overtimePay: 0,
				nightDiffPay: 0,
				holidayPay: 0,
				allowances: 500,
				bonuses: 0,
				taxAmount: 200,
				sssContribution: 100,
				philHealthContribution: 50,
				pagibigContribution: 50,
				loanDeductions: 0,
				absentDeduction: 0,
				lateDeduction: 0,
				earlyOutDeduction: 0,
				otherDeductions: 0,
				grossPay: 2500,
				totalDeductions: 400,
				netPay: 2100,
				regularHours: 8,
				overtimeHours: 0,
				isPaid: true,
				paidAt: new Date("2099-01-20T00:00:00.000Z"),
				paymentMethod: "BANK_TRANSFER",
				referenceNumber: "PAYREF-0001",
				notes: "Sample payroll history row",
				metadata: { source: "sample-pack" },
			},
			payrollPeriodId: "period-id",
			timesheetId: "timesheet-id",
			timesheet: {
				totalHoursWorked: "8:00",
				totalRegularHours: "8:00",
				totalOvertimeHours: "0:00",
				totalUndertimeHours: "0:00",
				totalLateHours: "0:00",
				totalEarlyOutHours: "0:00",
				totalDays: 1,
			},
		});

		expect(payload).to.not.have.property("regularHours");
		expect(payload).to.not.have.property("overtimeHours");
		expect(payload.metadata).to.deep.equal({
			source: "sample-pack",
			sourceSystem: "enterprise-csv-migration",
		});
		expect(payload.taxableIncome).to.equal(2300);
		expect(payload.timesheetSnapshot).to.deep.equal({
			totalHoursWorked: "8:00",
			totalRegularHours: "8:00",
			totalOvertimeHours: "0:00",
			totalUndertimeHours: "0:00",
			totalLateHours: "0:00",
			totalEarlyOutHours: "0:00",
			totalDays: 1,
			metadata: {
				importedRegularHours: 8,
				importedOvertimeHours: 0,
				sourceSystem: "enterprise-csv-migration",
				importContext: { source: "sample-pack" },
			},
		});
	});
});

const createDryRunPrismaMock = () =>
	new Proxy(
		{},
		{
			get(_target, model: string) {
				if (model === "$disconnect") return async () => undefined;
				return new Proxy(
					{},
					{
						get(_innerTarget, method: string) {
							if (method === "findFirst") {
								return async () =>
									model === "organization"
										? { id: "org-1", code: "bnei", name: "Bandai Namco", branding: {} }
										: null;
							}
							if (method === "findMany") {
								return async () => [];
							}
							if (method === "create" || method === "update") {
								return async (args: any) => ({
									id: `mock-${model}`,
									...(args?.data || {}),
								});
							}
							return async () => null;
						},
					},
				);
			},
		},
	) as any;

describe("enterprise migration dry-run prerequisite overlay", () => {
	it("treats the sample csv pack as GO in dry-run without writing prerequisite rows", async () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const { data } = loadEnterpriseMigrationDataFromCsvDir(sampleDir);
		const service = enterpriseMigrationService(createDryRunPrismaMock());

		const result = await service.executeEnterpriseMigration({
			config: {
				organizationId: "org-1",
				batchSize: 500,
				maxParallelBatches: 6,
				skipDuplicates: false,
				dryRun: true,
				stageBatchSize: 500,
				stopOnStageFailure: true,
			},
			manifest: {
				runLabel: "enterprise-dryrun-sample-pack",
				sourceSystem: "test",
				cutoffAt: new Date("2026-05-25T00:00:00.000Z"),
				operator: "test",
				dryRun: true,
				assumptions: [],
				baselineCounts: {},
			},
			data,
			options: {
				strictIntegrity: true,
				allowFallbackSchedule: false,
			},
		});

		expect(result.success).to.equal(true);
		expect(result.goNoGo.decision).to.equal("GO");
		expect(result.globalErrors).to.deep.equal([]);
		expect(result.manifest.executedStages).to.deep.equal(ENTERPRISE_MIGRATION_STAGE_ORDER);
		expect(result.stageResults.map((stage) => stage.stage)).to.deep.equal(ENTERPRISE_MIGRATION_STAGE_ORDER);
		for (const stage of result.stageResults) {
			expect(stage.status).to.equal("success");
			expect(stage.durationMs).to.be.a("number");
		}
		const employmentStage = result.stageResults.find((stage) => stage.stage === "EMPLOYMENT_BASE");
		expect(employmentStage?.reconciliation?.accounts).to.deep.include({
			skippedMissingEmail: 0,
			linkedEmployees: data.employees.length,
		});
		expect(employmentStage?.reconciliation?.accounts?.created).to.be.greaterThan(0);
	});

	it("reports CSV provenance for true missing prerequisites", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enterprise-migration-provenance-"));

		try {
			fs.writeFileSync(
				path.join(tempDir, "sample-department-schedule-links.csv"),
				[
					"departmentCode,scheduleTemplateCode,isPrimary",
					"HR,DAY-STD,true",
				].join("\n"),
			);

			const { data } = loadEnterpriseMigrationDataFromCsvDir(tempDir);
			const service = enterpriseMigrationService(createDryRunPrismaMock());
			const result = await service.executeEnterpriseMigration({
				config: {
					organizationId: "org-1",
					batchSize: 500,
					maxParallelBatches: 6,
					skipDuplicates: false,
					dryRun: true,
					stageBatchSize: 500,
					stopOnStageFailure: true,
				},
				manifest: {
					runLabel: "enterprise-dryrun-provenance",
					sourceSystem: "test",
					cutoffAt: new Date("2026-05-25T00:00:00.000Z"),
					operator: "test",
					dryRun: true,
					assumptions: [],
					baselineCounts: {},
				},
				data,
				options: {
					stages: ["ORG_STRUCTURE_SKELETON"],
					strictIntegrity: true,
					allowFallbackSchedule: false,
				},
			});

			expect(result.success).to.equal(false);
			expect(result.goNoGo.decision).to.equal("NO_GO");
			expect(result.goNoGo.reasons[0]).to.include("sample-department-schedule-links.csv row 2 field departmentCode");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("warns and skips account creation when a migrated employee has no valid email", async () => {
		const sampleDir = path.resolve(__dirname, "../docs/csv");
		const { data } = loadEnterpriseMigrationDataFromCsvDir(sampleDir);
		if (data.persons[0]) {
			data.persons[0].contactInfo = {
				...((data.persons[0].contactInfo as Record<string, any>) || {}),
				email: "",
			};
		}
		const service = enterpriseMigrationService(createDryRunPrismaMock());

		const result = await service.executeEnterpriseMigration({
			config: {
				organizationId: "org-1",
				batchSize: 500,
				maxParallelBatches: 6,
				skipDuplicates: false,
				dryRun: true,
				stageBatchSize: 500,
				stopOnStageFailure: true,
			},
			manifest: {
				runLabel: "enterprise-dryrun-missing-email",
				sourceSystem: "test",
				cutoffAt: new Date("2026-05-25T00:00:00.000Z"),
				operator: "test",
				dryRun: true,
				assumptions: [],
				baselineCounts: {},
			},
			data,
			options: {
				strictIntegrity: true,
				allowFallbackSchedule: false,
			},
		});

		const employmentStage = result.stageResults.find((stage) => stage.stage === "EMPLOYMENT_BASE");
		expect(employmentStage?.warnings.some((warning) => warning.includes("missing a valid person email"))).to.equal(
			true,
		);
		expect(employmentStage?.reconciliation?.accounts?.skippedMissingEmail).to.equal(1);
	});
});
