import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { PrismaClient } from "../../generated/prisma";
import { MigrationRunAdapterResult, MigrationRunRequest } from "./migration-run.types";
import { MigrationEventService } from "./migration-event.service";

type WorkbookSheet = {
	sheetName: string;
	headers: string[];
	rows: Record<string, any>[];
};

const DM3_EXPECTED_SHEETS = [
	"Employees",
	"Employee Schedule Assignments",
	"Employee Documents 201 Files",
	"Employee Benefits Loans",
];

const DM3_EMPLOYEE_HEADERS = ["EMP_ID", "NAME", "DEPARTMENT", "POSITION", "LEVEL", "BASIC_SALARY"];
const DM3_SCHEDULE_HEADERS = ["EMP_ID", "SCHEDULE_CODE", "EFFECTIVE_FROM"];
const DM4_TIMESHEET_REVIEW_LINK = "/hr/timesheets";
/** Legacy strict filename (year + space + name). Kept for older drops. */
const APPROVED_OT_WORKBOOK_PATTERN = /2026\s+rptOvertimeDetails\.xlsx$/i;
/** Any basename that includes the Bandai OT report name, regardless of prefix/suffix. */
const ANY_APPROVED_OT_WORKBOOK_PATTERN = /rptOvertimeDetails/i;
const DEFAULT_APPROVED_OT_WORKBOOK = ["docs", "Bandai Payroll", "2026 rptOvertimeDetails.xlsx"];

export type ResolveMigrationDm4SourceFilesOptions = {
	/** Explicit OT workbook paths/roles from the UI; accepted regardless of file name. */
	approvedOvertimeFiles?: unknown[];
	/** When true (default), append the repo default OT file if none is resolved. */
	autoAppendDefaultApprovedOvertime?: boolean;
};

export function isDm4ApprovedOvertimeWorkbookPath(filePath: string): boolean {
	const baseName = path.basename(String(filePath || "").replace(/\\/g, "/"));
	return ANY_APPROVED_OT_WORKBOOK_PATTERN.test(baseName);
}

function resolveSourcePathList(rawSourceFiles: unknown[]): string[] {
	return rawSourceFiles
		.map((item) => String(item || "").trim())
		.filter(Boolean)
		.map((filePath) => (path.isAbsolute(filePath) ? filePath : resolveRepoPath(filePath)));
}

function normalizePathKey(filePath: string): string {
	return filePath.replace(/\\/g, "/").toLowerCase();
}

function normalizeSheetKey(value: string) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function parseWorkbook(buffer: Buffer): WorkbookSheet[] {
	const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
	return workbook.SheetNames.map((sheetName) => {
		const worksheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json(worksheet, {
			defval: "",
			blankrows: false,
			raw: false,
		}) as Record<string, any>[];
		const cleanedRows = rows.map((row) => {
			const cleaned: Record<string, any> = {};
			for (const key of Object.keys(row || {})) {
				const value = row[key];
				cleaned[String(key).trim()] = typeof value === "string" ? value.trim() : value;
			}
			return cleaned;
		});
		const headers = Array.from(
			cleanedRows.reduce<Set<string>>((set, row) => {
				Object.keys(row).forEach((key) => set.add(key));
				return set;
			}, new Set()),
		);
		return { sheetName, headers, rows: cleanedRows };
	});
}

function getSheet(sheets: WorkbookSheet[], name: string) {
	const key = normalizeSheetKey(name);
	return sheets.find((sheet) => normalizeSheetKey(sheet.sheetName) === key);
}

function parseMoney(value: unknown) {
	const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
	return Number.isFinite(parsed) ? parsed : null;
}

function resolveRepoPath(...segments: string[]) {
	const candidates = [
		path.resolve(process.cwd(), "..", ...segments),
		path.resolve(process.cwd(), ...segments),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function collectWorkbookFiles(sourcePath: string): string[] {
	if (!fs.existsSync(sourcePath)) return [];
	const stat = fs.statSync(sourcePath);
	if (!stat.isDirectory()) {
		const fileName = path.basename(sourcePath);
		return /\.(xlsx|xls)$/i.test(sourcePath) && !fileName.startsWith("~$") ? [sourcePath] : [];
	}
	return fs
		.readdirSync(sourcePath)
		.flatMap((entry) => collectWorkbookFiles(path.join(sourcePath, entry)))
		.sort((left, right) => left.localeCompare(right));
}

function toRepoDisplayPath(filePath: string) {
	const repoRoot = path.resolve(process.cwd(), "..");
	const relative = path.relative(repoRoot, filePath);
	return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
		? relative.replace(/\\/g, "/")
		: filePath.replace(/\\/g, "/");
}

export function resolveMigrationDm4SourceFiles(
	rawSourceFiles: unknown[],
	options: ResolveMigrationDm4SourceFilesOptions = {},
) {
	const autoAppendDefaultApprovedOvertime = options.autoAppendDefaultApprovedOvertime !== false;
	const resolvedInputs = resolveSourcePathList(rawSourceFiles);
	const explicitApprovedOvertimeInputs = resolveSourcePathList(options.approvedOvertimeFiles || []);

	// Combine for existence checks; OT files may only appear in the explicit list.
	const allResolvedInputs = Array.from(
		new Set([...resolvedInputs, ...explicitApprovedOvertimeInputs]),
	);

	const workbookFiles = Array.from(
		new Set(allResolvedInputs.flatMap((filePath) => collectWorkbookFiles(filePath))),
	).sort((left, right) => left.localeCompare(right));

	const explicitApprovedOvertimeFiles = Array.from(
		new Set(explicitApprovedOvertimeInputs.flatMap((filePath) => collectWorkbookFiles(filePath))),
	);
	const namedApprovedOvertimeFiles = workbookFiles.filter((filePath) =>
		isDm4ApprovedOvertimeWorkbookPath(filePath),
	);

	let approvedOvertimeWorkbookFiles = Array.from(
		new Set([...explicitApprovedOvertimeFiles, ...namedApprovedOvertimeFiles]),
	).sort((left, right) => left.localeCompare(right));

	const defaultApprovedOtWorkbook = resolveRepoPath(...DEFAULT_APPROVED_OT_WORKBOOK);
	if (
		autoAppendDefaultApprovedOvertime &&
		allResolvedInputs.length > 0 &&
		approvedOvertimeWorkbookFiles.length === 0 &&
		fs.existsSync(defaultApprovedOtWorkbook) &&
		!allResolvedInputs.some((filePath) =>
			APPROVED_OT_WORKBOOK_PATTERN.test(path.basename(filePath.replace(/\\/g, "/"))),
		)
	) {
		allResolvedInputs.push(defaultApprovedOtWorkbook);
		approvedOvertimeWorkbookFiles = [defaultApprovedOtWorkbook];
	}

	const approvedOvertimeKeySet = new Set(
		approvedOvertimeWorkbookFiles.map((filePath) => normalizePathKey(filePath)),
	);
	const attendanceWorkbookFiles = workbookFiles.filter(
		(filePath) => !approvedOvertimeKeySet.has(normalizePathKey(filePath)),
	);

	// Recompute workbook set if default OT was appended after first collect.
	const finalWorkbookFiles = Array.from(
		new Set([
			...workbookFiles,
			...approvedOvertimeWorkbookFiles,
		]),
	).sort((left, right) => left.localeCompare(right));

	const missing = allResolvedInputs.filter((filePath) => !fs.existsSync(filePath));
	const invalid = allResolvedInputs.filter((filePath) => {
		if (!fs.existsSync(filePath)) return false;
		if (fs.statSync(filePath).isDirectory()) return false;
		return !/\.(xlsx|xls)$/i.test(filePath);
	});
	const emptyDirectories = allResolvedInputs.filter(
		(filePath) =>
			fs.existsSync(filePath) &&
			fs.statSync(filePath).isDirectory() &&
			collectWorkbookFiles(filePath).length === 0,
	);
	return {
		resolvedInputs: allResolvedInputs,
		missing,
		invalid,
		emptyDirectories,
		workbookFiles: finalWorkbookFiles,
		attendanceWorkbookFiles,
		approvedOvertimeWorkbookFiles,
		sourceFiles: allResolvedInputs.map(toRepoDisplayPath),
		sourceWorkbookFiles: finalWorkbookFiles.map(toRepoDisplayPath),
		approvedOvertimeSourceFiles: approvedOvertimeWorkbookFiles.map(toRepoDisplayPath),
		attendanceSourceFiles: attendanceWorkbookFiles.map(toRepoDisplayPath),
	};
}

async function runDm4DryRunProofScript(resolution: ReturnType<typeof resolveMigrationDm4SourceFiles>) {
	const scriptPath = path.resolve(process.cwd(), "scripts", "bnpi-demo-attendance-proof.cjs");
	if (!fs.existsSync(scriptPath)) {
		throw new Error("DM4 proof script was not found.");
	}
	const args = [scriptPath, "--limit=all"];
	const attendanceWorkbookFiles =
		resolution.attendanceWorkbookFiles ||
		resolution.workbookFiles.filter(
			(filePath) => !isDm4ApprovedOvertimeWorkbookPath(filePath),
		);
	if (attendanceWorkbookFiles.length > 0) {
		args.push(`--files=${attendanceWorkbookFiles.join(";")}`);
	}
	return new Promise<Record<string, any>>((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const child = spawn(process.execPath, args, {
			cwd: process.cwd(),
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `DM4 dry-run proof exited with code ${code}.`));
				return;
			}
			const jsonStart = stdout.indexOf("{");
			if (jsonStart < 0) {
				reject(new Error("DM4 dry-run proof did not return JSON."));
				return;
			}
			try {
				resolve(JSON.parse(stdout.slice(jsonStart)));
			} catch (error) {
				reject(error);
			}
		});
	});
}

async function runApprovedOvertimeDryRun(workbookPath?: string) {
	if (!workbookPath) {
		return { mode: "dry-run", plannedLineUpdates: 0, touchedTimesheets: 0, missingSourceRows: 0 };
	}
	const scriptPath = path.resolve(process.cwd(), "scripts", "repair-bandai-payroll-source-timesheet-lines.ts");
	if (!fs.existsSync(scriptPath)) {
		return { mode: "dry-run", skipped: true, reason: "script_missing", plannedLineUpdates: 0 };
	}
	return new Promise<Record<string, any>>((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const tsxCliPath = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
		const child = spawn(process.execPath, [tsxCliPath, scriptPath, `--overtime-workbook=${workbookPath}`], {
			cwd: process.cwd(),
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `Approved overtime dry-run exited with code ${code}.`));
				return;
			}
			const jsonStart = stdout.indexOf("{");
			if (jsonStart < 0) {
				reject(new Error("Approved overtime dry-run did not return JSON."));
				return;
			}
			try {
				resolve(JSON.parse(stdout.slice(jsonStart)));
			} catch (error) {
				reject(error);
			}
		});
	});
}

export class MigrationDryRunService {
	constructor(
		private readonly prisma: PrismaClient,
		private readonly events: MigrationEventService,
	) {}

	async dryRunDm3(runId: string, request: MigrationRunRequest): Promise<MigrationRunAdapterResult> {
		const file = request.files?.[0];
		if (!file?.buffer) {
			await this.events.append({
				runId,
				stage: "DM3",
				eventType: "BLOCKER_FOUND",
				status: "BLOCKED",
				message: "DM3 dry-run requires the employee data workbook upload.",
			});
			return {
				status: "BLOCKED",
				phase: "VALIDATING",
				errorJson: { message: "DM3 workbook file is required." },
			};
		}

		await this.events.append({
			runId,
			stage: "DM3",
			eventType: "SOURCE_READ_STARTED",
			status: "READING_SOURCE",
			message: `Reading ${file.originalname}.`,
			sourceWorkbook: file.originalname,
		});
		const sheets = parseWorkbook(file.buffer);
		await this.events.append({
			runId,
			stage: "DM3",
			eventType: "SOURCE_READ_COMPLETED",
			status: "VALIDATING",
			message: `Read ${sheets.length} sheets from DM3 workbook.`,
			counts: { sheets: sheets.length },
		});

		const errors: any[] = [];
		const warnings: any[] = [];
		for (const sheetName of DM3_EXPECTED_SHEETS) {
			if (!getSheet(sheets, sheetName)) {
				errors.push({ sheetName, field: "sheet", message: `${sheetName} sheet is missing.` });
			}
		}
		const employeesSheet = getSheet(sheets, "Employees");
		const scheduleSheet = getSheet(sheets, "Employee Schedule Assignments");
		for (const header of DM3_EMPLOYEE_HEADERS) {
			if (employeesSheet && !employeesSheet.headers.includes(header)) {
				errors.push({ sheetName: "Employees", field: header, message: `${header} header is missing.` });
			}
		}
		for (const header of DM3_SCHEDULE_HEADERS) {
			if (scheduleSheet && !scheduleSheet.headers.includes(header)) {
				errors.push({
					sheetName: "Employee Schedule Assignments",
					field: header,
					message: `${header} header is missing.`,
				});
			}
		}

		const employeeIds = new Map<string, number[]>();
		for (const [index, row] of (employeesSheet?.rows || []).entries()) {
			const employeeId = String(row.EMP_ID || "").trim();
			if (!employeeId) continue;
			employeeIds.set(employeeId, [...(employeeIds.get(employeeId) || []), index + 2]);
			if (row.BASIC_SALARY !== undefined && row.BASIC_SALARY !== "" && parseMoney(row.BASIC_SALARY) === null) {
				errors.push({
					sheetName: "Employees",
					row: index + 2,
					field: "BASIC_SALARY",
					message: "BASIC_SALARY must be parseable as money.",
				});
			}
			if (!String(row.EMAIL || "").trim()) {
				warnings.push({
					sheetName: "Employees",
					row: index + 2,
					field: "EMAIL",
					message: "No account provisioning or credential email will run without a real source email.",
				});
			}
		}
		for (const [employeeId, rows] of employeeIds) {
			if (rows.length > 1) {
				errors.push({
					sheetName: "Employees",
					field: "EMP_ID",
					message: `Duplicate employee id ${employeeId} on rows ${rows.join(", ")}.`,
				});
			}
		}

		const scheduledEmployeeIds = new Set(
			(scheduleSheet?.rows || [])
				.map((row) => String(row.EMP_ID || "").trim())
				.filter(Boolean),
		);
		for (const employeeId of employeeIds.keys()) {
			if (!scheduledEmployeeIds.has(employeeId)) {
				warnings.push({
					sheetName: "Employee Schedule Assignments",
					field: "EMP_ID",
					employeeId,
					message:
						"Attendance obligation repair will not be planned until this employee has an actual DM3 schedule assignment.",
				});
			}
		}

		const refs = await this.readDm3ReferenceCounts(request.organizationId);
		await this.events.append({
			runId,
			stage: "DM3",
			eventType: "PREREQUISITE_CHECKED",
			status: "VALIDATING",
			message: "Checked DM1/DM2 reference prerequisites for DM3.",
			counts: refs,
		});

		if (errors.length > 0) {
			await this.events.append({
				runId,
				stage: "DM3",
				eventType: "BLOCKER_FOUND",
				status: "BLOCKED",
				message: `DM3 dry-run found ${errors.length} blocker(s).`,
				counts: { blockers: errors.length, warnings: warnings.length },
			});
			return {
				status: "BLOCKED",
				phase: "VALIDATING",
				counts: { employees: employeesSheet?.rows.length || 0, blockers: errors.length, warnings: warnings.length },
				summaryJson: { sheets: sheets.map((sheet) => ({ sheetName: sheet.sheetName, rows: sheet.rows.length })), errors, warnings, references: refs },
				errorJson: { errors },
			};
		}

		await this.events.append({
			runId,
			stage: "DM3",
			eventType: "DRY_RUN_COMPLETED",
			status: warnings.length > 0 ? "COMPLETED_WITH_WARNINGS" : "DRY_RUN_COMPLETED",
			message: `DM3 dry-run completed for ${(employeesSheet?.rows.length || 0).toLocaleString()} employee row(s).`,
			counts: { employees: employeesSheet?.rows.length || 0, warnings: warnings.length },
		});
		return {
			status: warnings.length > 0 ? "COMPLETED_WITH_WARNINGS" : "DRY_RUN_COMPLETED",
			phase: "DRY_RUN_COMPLETED",
			counts: { employees: employeesSheet?.rows.length || 0, warnings: warnings.length },
			summaryJson: { sheets: sheets.map((sheet) => ({ sheetName: sheet.sheetName, rows: sheet.rows.length })), warnings, references: refs },
			proofJson: {
				plannedOrder: [
					"Employees",
					"Employee Schedule Assignments",
					"Employee Documents / 201 Files",
					"Employee Benefits / Loans",
					"Employee Post Actions",
					"Schedule-backed attendance obligation repair",
					"Final audit/proof",
				],
			},
		};
	}

	async dryRunDm4(runId: string, request: MigrationRunRequest): Promise<MigrationRunAdapterResult> {
		const rawSourceFiles = Array.isArray(request.options?.sourceFiles)
			? request.options?.sourceFiles
			: Array.isArray(request.sourceFiles)
				? request.sourceFiles.map((file) => file.path || file.name)
				: [];
		const hasExplicitApprovedOvertimeOption =
			Array.isArray(request.options?.approvedOvertimeFiles) ||
			Array.isArray(request.options?.approvedOvertimeSourceFiles);
		const explicitApprovedOvertimeFiles = Array.isArray(request.options?.approvedOvertimeFiles)
			? request.options.approvedOvertimeFiles
			: Array.isArray(request.options?.approvedOvertimeSourceFiles)
				? request.options.approvedOvertimeSourceFiles
				: [];
		const resolution = resolveMigrationDm4SourceFiles(rawSourceFiles, {
			approvedOvertimeFiles: explicitApprovedOvertimeFiles,
			autoAppendDefaultApprovedOvertime: !hasExplicitApprovedOvertimeOption,
		});
		const blockers = [
			...resolution.invalid.map((filePath) => `Invalid workbook source: ${filePath}`),
			...resolution.missing.map((filePath) => `Missing workbook source: ${filePath}`),
		];
		if (resolution.resolvedInputs.length > 0 && resolution.workbookFiles.length === 0) {
			blockers.push("No .xlsx/.xls workbook files were resolved from DM4 source entries.");
		}
		const organization = await this.prisma.organization.findUnique({
			where: { code: "bnei" },
			select: { id: true, code: true },
		});
		const employeeCount = organization
			? await this.prisma.employee.count({
					where: { organizationId: organization.id, isDeleted: false },
				})
			: 0;
		if (!organization) blockers.push("BNEI organization seed is required before DM4 proof.");
		if (organization && employeeCount === 0) {
			blockers.push("DM3 employee records must exist before DM4 employee matching can run.");
		}

		await this.events.append({
			runId,
			stage: "DM4",
			eventType: "SOURCE_FILES_RESOLVED",
			status: blockers.length > 0 ? "BLOCKED" : "VALIDATING",
			message: `Resolved ${resolution.sourceWorkbookFiles.length} DM4 source workbook file(s).`,
			counts: { sourceWorkbookCount: resolution.sourceWorkbookFiles.length, matchedEmployees: employeeCount },
			metadata: { sourceWorkbookFiles: resolution.sourceWorkbookFiles.slice(0, 50) },
		});

		if (blockers.length > 0) {
			await this.events.append({
				runId,
				stage: "DM4",
				eventType: "BLOCKER_FOUND",
				status: "BLOCKED",
				message: blockers[0],
				counts: { blockers: blockers.length },
			});
			return {
				status: "BLOCKED",
				phase: "VALIDATING",
				counts: { sourceWorkbookCount: resolution.sourceWorkbookFiles.length, matchedEmployees: employeeCount, blockers: blockers.length },
				summaryJson: { blockers, sourceWorkbookFiles: resolution.sourceWorkbookFiles },
				errorJson: { blockers },
			};
		}

		const dryRunProof = await runDm4DryRunProofScript(resolution);
		const materializationPlan = dryRunProof?.dryRunMaterializationPlan || {};
		const selection = dryRunProof?.phase1Selection || {};
		const approvedOvertimeWorkbook =
			resolution.approvedOvertimeWorkbookFiles?.[0] ||
			resolution.workbookFiles.find((filePath) => isDm4ApprovedOvertimeWorkbookPath(filePath));
		const approvedOvertimeDryRun = await runApprovedOvertimeDryRun(approvedOvertimeWorkbook);

		await this.events.append({
			runId,
			stage: "DM4",
			stepCode: "DM4.1",
			eventType: "DRY_RUN_STEP_COMPLETED",
			status: "DRY_RUN_COMPLETED",
			message: "DM4 dry-run planned Attendance History source evidence.",
			counts: {
				total: Number(selection.selectedRowsTotal || 0),
				updated: Number(selection.selectedRowsTotal || 0),
				sourceRowsScanned: Number(selection.sourceRowsScanned || 0),
				matchedEmployees: employeeCount,
			},
		});
		await this.events.append({
			runId,
			stage: "DM4",
			stepCode: "DM4.2",
			eventType: "DRY_RUN_STEP_COMPLETED",
			status: "DRY_RUN_COMPLETED",
			message: "DM4 dry-run planned idempotent timesheet materialization.",
			counts: {
				total: Number(materializationPlan.rowsWouldApply || 0),
				created: Number(materializationPlan.rowsWouldApply || 0),
				specificScheduleRows: Number(materializationPlan.specificScheduleRows || 0),
				currentEmbeddedHistoricalFallbackRows: Number(
					materializationPlan.currentEmbeddedHistoricalFallbackRows || 0,
				),
				defaultScheduleFallbackRows: Number(materializationPlan.defaultScheduleFallbackRows || 0),
			},
		});
		await this.events.append({
			runId,
			stage: "DM4",
			stepCode: "DM4.3",
			eventType: "DRY_RUN_STEP_COMPLETED",
			status: "DRY_RUN_COMPLETED",
			sourceWorkbook: approvedOvertimeWorkbook ? toRepoDisplayPath(approvedOvertimeWorkbook) : null,
			message: approvedOvertimeWorkbook
				? "DM4 dry-run planned approved overtime detail updates."
				: "No approved overtime details workbook was supplied for DM4 dry-run.",
			counts: {
				total: Number(
					approvedOvertimeDryRun.sourceRowsParsed ||
						approvedOvertimeDryRun.effectiveLinesChecked ||
						approvedOvertimeDryRun.plannedLineUpdates ||
						0,
				),
				updated: Number(approvedOvertimeDryRun.plannedLineUpdates || 0),
				skipped: Number(approvedOvertimeDryRun.missingSourceRows || 0),
				sourceRowsParsed: Number(approvedOvertimeDryRun.sourceRowsParsed || 0),
				effectiveLinesChecked: Number(approvedOvertimeDryRun.effectiveLinesChecked || 0),
				plannedLineUpdates: Number(approvedOvertimeDryRun.plannedLineUpdates || 0),
				touchedTimesheets: Number(approvedOvertimeDryRun.touchedTimesheets || 0),
				missingSourceRows: Number(approvedOvertimeDryRun.missingSourceRows || 0),
				approvedOvertimeWorkbookCount: approvedOvertimeWorkbook ? 1 : 0,
			},
		});

		await this.events.append({
			runId,
			stage: "DM4",
			eventType: "DRY_RUN_COMPLETED",
			status: "DRY_RUN_COMPLETED",
			message: `DM4 dry-run selected ${Number(selection.selectedRowsTotal || 0).toLocaleString()} employee-day row(s); ${Number(materializationPlan.rowsWouldApply || 0).toLocaleString()} would be materialized.`,
			counts: {
				sourceWorkbookCount: resolution.sourceWorkbookFiles.length,
				matchedEmployees: employeeCount,
				sourceRowsScanned: Number(selection.sourceRowsScanned || 0),
				selectedRows: Number(selection.selectedRowsTotal || 0),
				rowsWouldApply: Number(materializationPlan.rowsWouldApply || 0),
				specificScheduleRows: Number(materializationPlan.specificScheduleRows || 0),
				currentEmbeddedHistoricalFallbackRows: Number(
					materializationPlan.currentEmbeddedHistoricalFallbackRows || 0,
				),
				defaultScheduleFallbackRows: Number(materializationPlan.defaultScheduleFallbackRows || 0),
				approvedOvertimeWorkbookCount: approvedOvertimeWorkbook ? 1 : 0,
				approvedOvertimePlannedLineUpdates: Number(approvedOvertimeDryRun.plannedLineUpdates || 0),
			},
			metadata: {
				timesheetReviewLink: DM4_TIMESHEET_REVIEW_LINK,
				mutatesRecurringSchedule: false,
				approvedOvertimeWorkbook: approvedOvertimeWorkbook ? toRepoDisplayPath(approvedOvertimeWorkbook) : undefined,
			},
		});
		return {
			status: "DRY_RUN_COMPLETED",
			phase: "DRY_RUN_COMPLETED",
			counts: {
				sourceWorkbookCount: resolution.sourceWorkbookFiles.length,
				matchedEmployees: employeeCount,
				sourceRowsScanned: Number(selection.sourceRowsScanned || 0),
				selectedRows: Number(selection.selectedRowsTotal || 0),
				rowsWouldApply: Number(materializationPlan.rowsWouldApply || 0),
				specificScheduleRows: Number(materializationPlan.specificScheduleRows || 0),
				currentEmbeddedHistoricalFallbackRows: Number(
					materializationPlan.currentEmbeddedHistoricalFallbackRows || 0,
				),
				defaultScheduleFallbackRows: Number(materializationPlan.defaultScheduleFallbackRows || 0),
				approvedOvertimeWorkbookCount: approvedOvertimeWorkbook ? 1 : 0,
			},
			summaryJson: {
				sourceFiles: resolution.sourceFiles,
				sourceWorkbookFiles: resolution.sourceWorkbookFiles,
				approvedOvertimeWorkbook: approvedOvertimeWorkbook ? toRepoDisplayPath(approvedOvertimeWorkbook) : undefined,
				approvedOvertimeDryRun,
				dm3EmployeePrerequisites: employeeCount,
				noScheduleMutationPlan: true,
				dryRunMaterializationPlan: materializationPlan,
			},
			proofJson: {
				...dryRunProof,
				timesheetReviewLink: DM4_TIMESHEET_REVIEW_LINK,
				plannedOrder: [
					"Resolve source workbook file list",
					"Read source workbooks",
					"Validate DM3 employee prerequisites",
					"Match employees",
					"Validate payroll periods",
					"Plan attendance evidence import/proof",
					"Materialize timesheet candidates idempotently",
					"Dry-run approved overtime details against effective DM4.3 timesheet lines when 2026 rptOvertimeDetails.xlsx is supplied",
					"Run DB proof",
					"Emit HR Timesheet review link",
					"Persist final audit/proof",
				],
				approvedOvertimeRepair: approvedOvertimeDryRun,
			},
		};
	}

	private async readDm3ReferenceCounts(organizationId: string) {
		const [departments, sections, positions, levels, schedules, documentTypes, benefitTypes, loanTypes] =
			await Promise.all([
				this.prisma.department.count({ where: { organizationId, isDeleted: false } }),
				this.prisma.section.count({ where: { organizationId, isDeleted: false } }),
				this.prisma.position.count({ where: { organizationId, isDeleted: false } }),
				this.prisma.level.count({ where: { organizationId, isDeleted: false } }),
				this.prisma.scheduleTemplate.count({ where: { organizationId, isDeleted: false } }),
				this.prisma.documentType.count({ where: { organizationId, isDeleted: false } }),
				(this.prisma as any).benefitType.count({ where: { organizationId, isDeleted: false } }),
				(this.prisma as any).loanType.count({ where: { organizationId, isDeleted: false } }),
			]);
		return { departments, sections, positions, levels, schedules, documentTypes, benefitTypes, loanTypes };
	}
}
