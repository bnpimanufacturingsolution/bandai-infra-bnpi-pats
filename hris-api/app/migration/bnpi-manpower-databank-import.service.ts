import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import type { PrismaClient } from "../../generated/prisma";
import { EmployeeImportHelper } from "../../helper/employee-import.helper";
import {
	mapManpowerDatabankMatrix,
	pickManpowerDatabankSheet,
	type ManpowerDatabankMappedRow,
	type ManpowerDatabankSheetSelectionReason,
} from "../../helper/bnpi-manpower-databank-import.helper";
import { getLogger } from "../../helper/logger.helper";
import {
	persistDm3ImportActivityLog,
	resolveMassUploadImportStatus,
} from "./bnpi-mass-upload-import.service";

export type ManpowerDatabankImportSummary = {
	kind: "manpower-databank";
	sourceFileName: string;
	sheetName: string;
	sheetSelectionReason: ManpowerDatabankSheetSelectionReason;
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: Array<{ row: number; employeeId?: string; field?: string; message: string }>;
};

export type ManpowerDatabankJobProgress = {
	jobId: string;
	kind: "manpower-databank";
	status: "processing" | "completed" | "failed";
	phase: "parsing" | "importing_rows" | "completed" | "failed";
	sourceFileName: string;
	sheetName: string;
	sheetSelectionReason: ManpowerDatabankSheetSelectionReason | "";
	total: number;
	processed: number;
	success: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: Array<{ row: number; employeeId?: string; field?: string; message: string }>;
	recentLog: Array<{
		row: number;
		employeeId: string;
		fullName?: string;
		success: boolean;
		message?: string;
		createdAt: string;
	}>;
	startedAt: Date;
	completedAt?: Date;
	message?: string;
	/** Durable activity log id when persist succeeds. */
	importLogId?: string | null;
	migrationRunId?: string | null;
};

const MAX_ERRORS = 50;
const MAX_RECENT_LOG = 40;
const manpowerJobs = new Map<string, ManpowerDatabankJobProgress>();
const manpowerLogger = getLogger().child({ module: "manpower-databank-import" });

function cleanupOldManpowerJobs() {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	for (const [jobId, job] of manpowerJobs.entries()) {
		if (job.startedAt < oneHourAgo) {
			manpowerJobs.delete(jobId);
		}
	}
}

export function getManpowerDatabankJobProgress(jobId: string): ManpowerDatabankJobProgress | null {
	cleanupOldManpowerJobs();
	return manpowerJobs.get(jobId) || null;
}

function setManpowerJob(
	jobId: string,
	update: Partial<Omit<ManpowerDatabankJobProgress, "jobId" | "kind" | "startedAt">>,
) {
	const job = manpowerJobs.get(jobId);
	if (!job) return;
	Object.assign(job, update);
	manpowerJobs.set(jobId, job);
}

function appendRecentLog(
	job: ManpowerDatabankJobProgress,
	entry: ManpowerDatabankJobProgress["recentLog"][number],
) {
	job.recentLog.push(entry);
	if (job.recentLog.length > MAX_RECENT_LOG) {
		job.recentLog = job.recentLog.slice(-MAX_RECENT_LOG);
	}
}

function pushError(
	summary: ManpowerDatabankImportSummary,
	error: { row: number; employeeId?: string; field?: string; message: string },
) {
	summary.failed += 1;
	if (summary.errors.length < MAX_ERRORS) {
		summary.errors.push(error);
	}
}

function mergePersonPersonalInfo(
	existing: any,
	row: ManpowerDatabankMappedRow,
): Record<string, unknown> {
	const current = (existing?.personalInfo || {}) as Record<string, unknown>;
	return {
		...current,
		firstName: row.firstName || current.firstName || "Unknown",
		middleName: row.middleName ?? current.middleName,
		lastName: row.lastName || current.lastName || "Unknown",
		dateOfBirth: row.birthday || current.dateOfBirth || null,
		nationality: row.nationality || current.nationality || null,
		gender: row.gender || current.gender || null,
	};
}

function buildManpowerMetadata(
	existingMetadata: any,
	row: ManpowerDatabankMappedRow,
	params: {
		sourceFileName: string;
		sheetName: string;
	},
) {
	const metadata =
		existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
			? { ...existingMetadata }
			: {};
	const prior =
		metadata.manpowerDatabank && typeof metadata.manpowerDatabank === "object"
			? { ...metadata.manpowerDatabank }
			: {};

	metadata.importSource = "manpower_databank";
	metadata.manpowerDatabank = {
		...prior,
		sourceWorkbook: params.sourceFileName,
		sourceSheet: params.sheetName,
		sourceRow: row.sourceRow,
		sourceStatus: row.statusLabel || null,
		employmentStatusLabel: row.employmentStatusLabel || null,
		company: row.company || null,
		jobCategory: row.jobCategory || null,
		classification: row.classification || null,
		workStatus: row.workStatus || null,
		separationReason: row.separationReason || null,
		dateOfResignation: row.separationDate?.toISOString() || prior.dateOfResignation || null,
		ops: {
			...(prior.ops && typeof prior.ops === "object" ? prior.ops : {}),
			...row.opsMetadata,
		},
		importedAt: new Date().toISOString(),
	};
	metadata.sourceOfTruth = {
		...(metadata.sourceOfTruth && typeof metadata.sourceOfTruth === "object"
			? metadata.sourceOfTruth
			: {}),
		stage: "DM3",
		step: "DM3.1 Employees",
		sourceWorkbook: params.sourceFileName,
		sourceSheet: params.sheetName,
		sourceRow: row.sourceRow,
		importKind: "manpower-databank",
	};
	return metadata;
}

async function applyManpowerRow(params: {
	prisma: PrismaClient;
	organizationId: string;
	helper: EmployeeImportHelper;
	row: ManpowerDatabankMappedRow;
	sourceFileName: string;
	sheetName: string;
}): Promise<"created" | "updated"> {
	const { prisma, organizationId, helper, row, sourceFileName, sheetName } = params;

	if (!row.department) {
		throw new Error("Department is required.");
	}
	if (!row.position) {
		throw new Error("Position is required.");
	}

	const departmentId = helper.getDepartmentId(row.department);
	if (!departmentId) {
		throw new Error(`Department not found: ${row.department}`);
	}
	const positionId = helper.getPositionId(row.position);
	if (!positionId) {
		throw new Error(`Position not found: ${row.position}`);
	}
	const sectionId = row.section ? helper.getSectionId(row.section, row.department) : undefined;
	const derivedRole = helper.resolveDerivedRoleFlags(row.department, undefined, row.section);

	const existing = await prisma.employee.findUnique({
		where: {
			organizationId_employeeId: {
				organizationId,
				employeeId: row.employeeId,
			},
		},
		include: { person: true },
	});

	if (existing) {
		const personId = existing.personId;
		if (personId) {
			const person = existing.person;
			const contactInfo = (person?.contactInfo || { email: null, phones: [], address: [] }) as any;
			await prisma.person.update({
				where: { id: personId },
				data: {
					personalInfo: mergePersonPersonalInfo(person, row) as any,
					// Preserve email / phones / statutory identification — databank has none.
					contactInfo,
				},
			});
		}

		const employeeUpdate: Record<string, unknown> = {
			departmentId,
			positionId,
			employmentStatus: row.employmentStatus as any,
			workforceSource: row.workforceSource as any,
			role: derivedRole.role,
			isManager: derivedRole.isManager,
			isHrManager: derivedRole.isHrManager,
			metadata: buildManpowerMetadata(existing.metadata, row, {
				sourceFileName,
				sheetName,
			}),
		};

		if (sectionId) {
			employeeUpdate.sectionId = sectionId;
		} else if (!row.section) {
			// leave section as-is when source blank
		}

		if (row.hireDate) {
			employeeUpdate.employmentHireDate = row.hireDate;
		}
		if (row.employmentStatus !== "ACTIVE" && row.separationDate) {
			employeeUpdate.employmentTerminationDate = row.separationDate;
		}

		// Explicitly do NOT set basicSalary, dailyRate, payFrequency, leaveBalances, embeddedSchedule, reportToId.

		await prisma.employee.update({
			where: { id: existing.id },
			data: employeeUpdate as any,
		});
		helper.addEmployeeToCache(row.employeeId, existing.id);
		return "updated";
	}

	// Create path — salary 0, no fake email, no account provisioning.
	const person = await prisma.person.create({
		data: {
			organizationId,
			personalInfo: {
				firstName: row.firstName,
				middleName: row.middleName,
				lastName: row.lastName,
				dateOfBirth: row.birthday,
				nationality: row.nationality || null,
				gender: (row.gender as any) || null,
			},
			contactInfo: {
				email: null,
				phones: [],
				address: [],
			},
			metadata: {
				isActive: true,
				sourceOfTruth: {
					stage: "DM3",
					step: "DM3.1 Employees",
					sourceWorkbook: sourceFileName,
					sourceSheet: sheetName,
					sourceRow: row.sourceRow,
					importKind: "manpower-databank",
				},
			},
		} as any,
	});

	const created = await prisma.employee.create({
		data: {
			organizationId,
			employeeId: row.employeeId,
			personId: person.id,
			departmentId,
			positionId,
			sectionId: sectionId || null,
			employmentHireDate: row.hireDate || new Date(),
			employmentStartDate: row.hireDate || null,
			employmentTerminationDate:
				row.employmentStatus !== "ACTIVE" && row.separationDate ? row.separationDate : null,
			employmentStatus: row.employmentStatus as any,
			employmentType: "PROBATIONARY" as any,
			workforceSource: row.workforceSource as any,
			workLocation: "ONSITE" as any,
			basicSalary: 0,
			currency: "PHP",
			payFrequency: "SEMI_MONTHLY" as any,
			role: derivedRole.role,
			isManager: derivedRole.isManager,
			isHrManager: derivedRole.isHrManager,
			deviceEmpId: row.employeeId,
			leaveBalances: [],
			metadata: buildManpowerMetadata(null, row, { sourceFileName, sheetName }),
		} as any,
	});

	await prisma.person.update({
		where: { id: person.id },
		data: { employeeId: created.id },
	});

	helper.addEmployeeToCache(row.employeeId, created.id);
	return "created";
}

function parseManpowerDatabankBuffer(params: {
	buffer: Buffer;
	sourceFileName?: string;
}): {
	sourceFileName: string;
	sheetName: string;
	sheetSelectionReason: ManpowerDatabankSheetSelectionReason;
	rows: ManpowerDatabankMappedRow[];
	skippedBlank: number;
} {
	const sourceFileName = params.sourceFileName || "manpower-databank.xlsx";
	const workbook = XLSX.read(params.buffer, {
		type: "buffer",
		cellDates: true,
		raw: false,
	});
	const selection = pickManpowerDatabankSheet(workbook.SheetNames || []);
	if (!selection.sheetName || !workbook.Sheets[selection.sheetName]) {
		throw new Error("No usable worksheet found in Manpower Databank workbook.");
	}

	const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[selection.sheetName], {
		header: 1,
		defval: "",
		raw: false,
		blankrows: false,
	});

	const mapped = mapManpowerDatabankMatrix(matrix as unknown[][]);
	return {
		sourceFileName,
		sheetName: selection.sheetName,
		sheetSelectionReason: selection.reason,
		rows: mapped.rows,
		skippedBlank: mapped.skippedBlank,
	};
}

async function processManpowerDatabankRows(params: {
	prisma: PrismaClient;
	organizationId: string;
	sourceFileName: string;
	sheetName: string;
	sheetSelectionReason: ManpowerDatabankSheetSelectionReason;
	rows: ManpowerDatabankMappedRow[];
	skippedBlank: number;
	onProgress?: (snapshot: {
		processed: number;
		created: number;
		updated: number;
		failed: number;
		errors: ManpowerDatabankImportSummary["errors"];
		lastLog?: ManpowerDatabankJobProgress["recentLog"][number];
	}) => void;
}): Promise<ManpowerDatabankImportSummary> {
	const summary: ManpowerDatabankImportSummary = {
		kind: "manpower-databank",
		sourceFileName: params.sourceFileName,
		sheetName: params.sheetName,
		sheetSelectionReason: params.sheetSelectionReason,
		total: params.rows.length,
		created: 0,
		updated: 0,
		skipped: params.skippedBlank,
		failed: 0,
		errors: [],
	};

	const helper = new EmployeeImportHelper(params.prisma, params.organizationId);
	await helper.loadCaches();

	let processed = 0;
	for (const row of params.rows) {
		try {
			const result = await applyManpowerRow({
				prisma: params.prisma,
				organizationId: params.organizationId,
				helper,
				row,
				sourceFileName: params.sourceFileName,
				sheetName: params.sheetName,
			});
			if (result === "created") summary.created += 1;
			else summary.updated += 1;
			processed += 1;
			const lastLog = {
				row: row.sourceRow,
				employeeId: row.employeeId,
				fullName: row.name,
				success: true,
				message: result === "created" ? "Created" : "Updated",
				createdAt: new Date().toISOString(),
			};
			params.onProgress?.({
				processed,
				created: summary.created,
				updated: summary.updated,
				failed: summary.failed,
				errors: summary.errors,
				lastLog,
			});
		} catch (error: any) {
			pushError(summary, {
				row: row.sourceRow,
				employeeId: row.employeeId,
				message: error?.message || "Failed to import manpower databank row",
			});
			processed += 1;
			const lastLog = {
				row: row.sourceRow,
				employeeId: row.employeeId,
				fullName: row.name,
				success: false,
				message: error?.message || "Failed",
				createdAt: new Date().toISOString(),
			};
			params.onProgress?.({
				processed,
				created: summary.created,
				updated: summary.updated,
				failed: summary.failed,
				errors: summary.errors,
				lastLog,
			});
		}
	}

	return summary;
}

/** Synchronous import (tests / scripts). */
export async function importManpowerDatabankUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
	sourceFileName?: string;
}): Promise<ManpowerDatabankImportSummary> {
	const parsed = parseManpowerDatabankBuffer(params);
	return processManpowerDatabankRows({
		prisma: params.prisma,
		organizationId: params.organizationId,
		sourceFileName: parsed.sourceFileName,
		sheetName: parsed.sheetName,
		sheetSelectionReason: parsed.sheetSelectionReason,
		rows: parsed.rows,
		skippedBlank: parsed.skippedBlank,
	});
}

/**
 * Async import matching DM employee-import contract:
 * create job → return jobId immediately → process in background with live progress.
 */
export function startManpowerDatabankImport(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
	sourceFileName?: string;
	migrationRunId?: string | null;
	startedByUserId?: string | null;
}): { jobId: string } {
	cleanupOldManpowerJobs();
	const sourceFileName = params.sourceFileName || "manpower-databank.xlsx";
	const jobId = randomUUID();
	const startedAt = new Date();
	const job: ManpowerDatabankJobProgress = {
		jobId,
		kind: "manpower-databank",
		status: "processing",
		phase: "parsing",
		sourceFileName,
		sheetName: "",
		sheetSelectionReason: "",
		total: 0,
		processed: 0,
		success: 0,
		created: 0,
		updated: 0,
		skipped: 0,
		failed: 0,
		errors: [],
		recentLog: [],
		startedAt,
		message: "Reading Manpower Databank workbook…",
		migrationRunId: params.migrationRunId || null,
		importLogId: null,
	};
	manpowerJobs.set(jobId, job);

	void (async () => {
		try {
			const parsed = parseManpowerDatabankBuffer({
				buffer: params.buffer,
				sourceFileName,
			});
			setManpowerJob(jobId, {
				phase: "importing_rows",
				sheetName: parsed.sheetName,
				sheetSelectionReason: parsed.sheetSelectionReason,
				total: parsed.rows.length,
				skipped: parsed.skippedBlank,
				message: `Importing sheet "${parsed.sheetName}" (${parsed.rows.length} rows)`,
			});

			const summary = await processManpowerDatabankRows({
				prisma: params.prisma,
				organizationId: params.organizationId,
				sourceFileName: parsed.sourceFileName,
				sheetName: parsed.sheetName,
				sheetSelectionReason: parsed.sheetSelectionReason,
				rows: parsed.rows,
				skippedBlank: parsed.skippedBlank,
				onProgress: (snapshot) => {
					const current = manpowerJobs.get(jobId);
					if (!current) return;
					if (snapshot.lastLog) appendRecentLog(current, snapshot.lastLog);
					setManpowerJob(jobId, {
						phase: "importing_rows",
						processed: snapshot.processed,
						created: snapshot.created,
						updated: snapshot.updated,
						failed: snapshot.failed,
						success: snapshot.created + snapshot.updated,
						errors: snapshot.errors.slice(0, MAX_ERRORS),
						message: `Importing ${snapshot.processed}/${parsed.rows.length} from "${parsed.sheetName}"`,
					});
				},
			});

			const finishedAt = new Date();
			const status = resolveMassUploadImportStatus(summary);
			const log = await persistDm3ImportActivityLog({
				prisma: params.prisma,
				organizationId: params.organizationId,
				kind: "manpower-databank",
				sourceFilename: sourceFileName,
				migrationRunId: params.migrationRunId,
				startedByUserId: params.startedByUserId,
				startedAt,
				finishedAt,
				total: summary.total,
				created: summary.created,
				updated: summary.updated,
				skipped: summary.skipped,
				failed: summary.failed,
				status,
				errors: summary.errors,
				summaryExtra: {
					sheetName: summary.sheetName,
					sheetSelectionReason: summary.sheetSelectionReason,
					jobId,
				},
			});

			setManpowerJob(jobId, {
				status: "completed",
				phase: "completed",
				processed: summary.total,
				created: summary.created,
				updated: summary.updated,
				failed: summary.failed,
				success: summary.created + summary.updated,
				skipped: summary.skipped,
				errors: summary.errors,
				completedAt: finishedAt,
				message: `Completed sheet "${summary.sheetName}"`,
				importLogId: log?.id || null,
			});
			manpowerLogger.info(
				`Manpower databank job ${jobId} completed: created=${summary.created} updated=${summary.updated} failed=${summary.failed}`,
			);
		} catch (error: any) {
			const finishedAt = new Date();
			const failMessage = error?.message || "Manpower databank import failed";
			const log = await persistDm3ImportActivityLog({
				prisma: params.prisma,
				organizationId: params.organizationId,
				kind: "manpower-databank",
				sourceFilename: sourceFileName,
				migrationRunId: params.migrationRunId,
				startedByUserId: params.startedByUserId,
				startedAt,
				finishedAt,
				total: 0,
				created: 0,
				updated: 0,
				skipped: 0,
				failed: 1,
				status: "failed",
				errors: [{ row: 0, message: failMessage }],
				summaryExtra: { jobId },
			});
			setManpowerJob(jobId, {
				status: "failed",
				phase: "failed",
				completedAt: finishedAt,
				message: failMessage,
				errors: [
					{
						row: 0,
						message: failMessage,
					},
				],
				importLogId: log?.id || null,
			});
			manpowerLogger.error(
				`Manpower databank job ${jobId} failed: ${error?.message || "Unknown error"}`,
				{ error },
			);
		}
	})();

	return { jobId };
}
