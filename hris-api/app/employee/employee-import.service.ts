import { PrismaClient } from "../../generated/prisma";
import { EmployeeImportHelper, EmployeeImportRow } from "../../helper/employee-import.helper";
import { createEmployeeHelpers, checkMissingCredentials } from "../../helper/employee.helper";
import { createBoardingProcess } from "../../helper/boarding.helper";
import { createDocumentChecklistItems } from "../../helper/boarding-documents.helper";
import { buildBulkPasswordCandidates } from "../../helper/bulk-password.helper";
import {
	isEmployeeEmailConfigured,
	sendEmployeeCredentialsEmail,
} from "../../helper/employee-credentials-email.helper";
import { getLogger } from "../../helper/logger.helper";
import { buildSafeUserName, ensureLocalUserAccount } from "../../helper/local-user-account.helper";
import { randomUUID } from "crypto";
import { runEmployeePostActions } from "../../helper/employee-post-actions.helper";
import { ensureDefaultLeaveBalances } from "../../helper/default-leave-balances.helper";
import { config } from "../../config/config";
import {
	backfillCurrentPayrollPeriodAttendanceObligations,
} from "../../helper/attendance-obligation.helper";

const logger = getLogger();
const employeeLogger = logger.child({ module: "employee-import" });
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, any>)
		: {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

export function shouldBackfillAttendanceObligationsAfterReportToResolution(params: {
	currentReportToId?: string | null;
	resolvedReportToId?: string | null;
}): boolean {
	return Boolean(params.resolvedReportToId && params.currentReportToId !== params.resolvedReportToId);
}

export function resolveEmployeeImportExecutionOptions(params: {
	importMode?: "fast" | "full";
	enableAccountProvisioning?: boolean;
	enableCredentialEmails?: boolean;
	enablePostActions?: boolean;
}) {
	// Normal employee imports, including DM3 Employees, should behave like Add Employee:
	// create/link user accounts for rows with real source emails and run shared post-actions.
	// Fast mode remains an explicit repair/import shortcut for callers that only want master data.
	const isFastMode = params.importMode === "fast";
	const enableAccountProvisioning =
		params.enableAccountProvisioning ?? (isFastMode ? false : true);
	const enableCredentialEmails =
		params.enableCredentialEmails ?? (isFastMode ? false : enableAccountProvisioning);

	return {
		enableAccountProvisioning,
		enableCredentialEmails,
		enablePostActions:
			params.enablePostActions ?? (!isFastMode && enableAccountProvisioning),
	};
}

interface ImportEmployeeParams {
	row: EmployeeImportRow;
	organizationId: string;
	authToken: string;
	helper?: EmployeeImportHelper;
	autoCreate?: boolean;
	applyDefaultLeaveBalances?: boolean;
	enableAccountProvisioning?: boolean;
	enableCredentialEmails?: boolean;
	enablePostActions?: boolean;
}

interface ImportResult {
	success: boolean;
	employeeId: string;
	employeeDbId?: string;
	personId?: string;
	userId?: string;
	email?: string;
	userName?: string;
	password?: string;
	fullName?: string;
	role?: string;
	wasCreated?: boolean;
	userLinkedDuringImport?: boolean;
	credentialsEmailSent?: boolean;
	credentialsEmailError?: string;
	importWarnings?: string[];
	error?: string;
}

interface AuthUserResult {
	userId: string;
	password: string;
}

/** Single entry in the live activity log (for UI) */
export interface ImportProgressLogEntry {
	row: number;
	employeeId: string;
	fullName?: string;
	success: boolean;
	message?: string;
	createdAt?: string;
}

export interface AttendanceObligationSideEffectEntry {
	row?: number;
	employeeId: string;
	fullName?: string;
	employeeDbId: string;
	touched: number;
	created: number;
	updated: number;
	status: "pending" | "success" | "failed";
	message?: string;
}

export interface ImportSideEffects {
	attendanceObligations: {
		attempted: number;
		completed: number;
		touched: number;
		created: number;
		updated: number;
		failed: number;
		rows: AttendanceObligationSideEffectEntry[];
	};
}

export interface CredentialExportEntry {
	row?: number;
	employeeId: string;
	fullName?: string;
	email: string;
	userName: string;
	password: string;
	role: string;
}

export interface ImportJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed";
	phase:
		| "importing_rows"
		| "resolving_reporting_lines"
		| "syncing_metadata"
		| "running_post_actions"
		| "refreshing_attendance_obligations"
		| "completed"
		| "failed";
	total: number;
	processed: number;
	success: number;
	failed: number;
	created: number;
	updated: number;
	skipped: number;
	blocked: number;
	errors: Array<{ row: number; employeeId: string; error: string }>;
	warnings: Array<{ row?: number; employeeId: string; stage: string; message: string }>;
	/** Live log of recent rows (success + failure) for UI; last 50 entries */
	recentLog: ImportProgressLogEntry[];
	sideEffects: ImportSideEffects;
	/** Downloadable login credentials for successfully provisioned rows */
	credentialExports: CredentialExportEntry[];
	startedAt: Date;
	completedAt?: Date;
}

export class EmployeeImportService {
	// Static map to store import job progress (use Redis in production for multi-instance support)
	private static importJobs: Map<string, ImportJobProgress> = new Map();
	private hasLoggedEmailConfigWarning = false;
	private statutoryDocumentTypeCache = new Map<string, Promise<Map<string, any>>>();

	// Cleanup jobs older than 1 hour
	private static cleanupOldJobs() {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		for (const [jobId, job] of this.importJobs.entries()) {
			if (job.startedAt < oneHourAgo) {
				this.importJobs.delete(jobId);
				employeeLogger.info(`Cleaned up old import job: ${jobId}`);
			}
		}
	}

	// Get job progress by ID
	static getJobProgress(jobId: string): ImportJobProgress | null {
		this.cleanupOldJobs();
		return this.importJobs.get(jobId) || null;
	}

	static getActiveImportJobs(): ImportJobProgress[] {
		this.cleanupOldJobs();
		return Array.from(this.importJobs.values()).filter(
			(job) => job.status === "processing",
		);
	}

	// Create new import job
	private createImportJob(total: number): string {
		const jobId = randomUUID();
		const job: ImportJobProgress = {
			jobId,
			status: "processing",
			phase: "importing_rows",
			total,
			processed: 0,
			success: 0,
			failed: 0,
			created: 0,
			updated: 0,
			skipped: 0,
			blocked: 0,
			errors: [],
			warnings: [],
			recentLog: [],
			sideEffects: {
				attendanceObligations: {
					attempted: 0,
					completed: 0,
					touched: 0,
					created: 0,
					updated: 0,
					failed: 0,
					rows: [],
				},
			},
			credentialExports: [],
			startedAt: new Date(),
		};
		EmployeeImportService.importJobs.set(jobId, job);
		employeeLogger.info(`Created import job ${jobId} for ${total} employees`);
		return jobId;
	}

	// Update job progress
	private updateJobProgress(
		jobId: string,
		update: Partial<Omit<ImportJobProgress, "jobId" | "startedAt">>,
	) {
		const job = EmployeeImportService.importJobs.get(jobId);
		if (job) {
			Object.assign(job, update);
			EmployeeImportService.importJobs.set(jobId, job);
		}
	}

	private async refreshImportedEmployeeAttendanceObligations(params: {
		jobId: string;
		organizationId: string;
		targets: Array<{
			employeeDbId: string;
			employeeId: string;
			fullName?: string;
			row?: number;
		}>;
		maxConcurrency?: number;
	}) {
		const concurrency = Math.max(1, Math.min(5, params.maxConcurrency ?? 3));
		let refreshed = 0;
		const job = EmployeeImportService.importJobs.get(params.jobId);
		if (job) {
			job.sideEffects.attendanceObligations.attempted = params.targets.length;
			job.sideEffects.attendanceObligations.rows = params.targets.map((target) => ({
				row: target.row,
				employeeId: target.employeeId,
				fullName: target.fullName,
				employeeDbId: target.employeeDbId,
				touched: 0,
				created: 0,
				updated: 0,
				status: "pending",
			}));
		}

		for (let i = 0; i < params.targets.length; i += concurrency) {
			const chunk = params.targets.slice(i, i + concurrency);
			const settled = await Promise.allSettled(
				chunk.map(async (target) => {
					const results = await backfillCurrentPayrollPeriodAttendanceObligations(
						this.prisma,
						{
							organizationId: params.organizationId,
							employeeId: target.employeeDbId,
						},
					);
					const touched = results.reduce(
						(total, result: any) => total + Number(result?.touched || 0),
						0,
					);
					const created = results.reduce(
						(total, result: any) => total + Number(result?.created || 0),
						0,
					);
					const updated = results.reduce(
						(total, result: any) => total + Number(result?.updated || 0),
						0,
					);
					return { target, touched, created, updated };
				}),
			);

			const job = EmployeeImportService.importJobs.get(params.jobId);
			for (let resultIndex = 0; resultIndex < settled.length; resultIndex++) {
				const result = settled[resultIndex];
				if (result.status === "fulfilled") {
					refreshed += result.value.touched;
					if (job) {
						const summary = job.sideEffects.attendanceObligations;
						summary.completed += 1;
						summary.touched += result.value.touched;
						summary.created += result.value.created;
						summary.updated += result.value.updated;
						const sideEffectRow = summary.rows.find(
							(row) => row.employeeDbId === result.value.target.employeeDbId,
						);
						if (sideEffectRow) {
							sideEffectRow.touched = result.value.touched;
							sideEffectRow.created = result.value.created;
							sideEffectRow.updated = result.value.updated;
							sideEffectRow.status = "success";
							sideEffectRow.message =
								result.value.touched > 0
									? `${result.value.touched.toLocaleString()} current-period rows refreshed`
									: "No current-period obligation rows were needed";
						}
						if (result.value.touched > 0) {
							this.appendRecentLog(job, {
								row: result.value.target.row || 0,
								employeeId: result.value.target.employeeId,
								fullName: result.value.target.fullName,
								success: true,
								message: `[attendance] ${result.value.touched.toLocaleString()} obligation rows refreshed (${result.value.created.toLocaleString()} created, ${result.value.updated.toLocaleString()} updated)`,
							});
						}
					}
					continue;
				}

				const target = chunk[resultIndex];
				const message =
					result.reason?.message ||
					String(result.reason || "Failed attendance obligation refresh");
				if (job) {
					const summary = job.sideEffects.attendanceObligations;
					summary.completed += 1;
					summary.failed += 1;
					const sideEffectRow = summary.rows.find(
						(row) => row.employeeDbId === target?.employeeDbId,
					);
					if (sideEffectRow) {
						sideEffectRow.status = "failed";
						sideEffectRow.message = message;
					}
					job.warnings.push({
						row: target?.row,
						employeeId: target?.employeeId || "unknown",
						stage: "attendance",
						message,
					});
					this.appendRecentLog(job, {
						row: target?.row || 0,
						employeeId: target?.employeeId || "unknown",
						fullName: target?.fullName,
						success: false,
						message: `[attendance] ${message}`,
					});
				}
			}
		}

		return refreshed;
	}

	private async getStatutoryDocumentTypes(organizationId: string) {
		const cached = this.statutoryDocumentTypeCache.get(organizationId);
		if (cached) return cached;

		const load = async () => {
			const specs = [
				{ code: "TIN", name: "Tax Identification Number", displayOrder: 2 },
				{ code: "SSS", name: "Social Security System", displayOrder: 3 },
				{ code: "PHILHEALTH", name: "PhilHealth", displayOrder: 4 },
				{ code: "PAGIBIG", name: "Pag-IBIG Fund", displayOrder: 5 },
			];
			const documentTypes = await (this.prisma as any).documentType.findMany({
				where: {
					organizationId,
					isDeleted: false,
					code: { in: specs.map((spec) => spec.code) },
				},
				select: { id: true, code: true, name: true },
			});
			const byCode = new Map<string, any>(
				documentTypes.map((documentType: any) => [
					String(documentType.code || "").toUpperCase(),
					documentType,
				]),
			);

			for (const spec of specs) {
				if (byCode.has(spec.code)) continue;
				const created = await (this.prisma as any).documentType.create({
					data: {
						organizationId,
						code: spec.code,
						name: spec.name,
						category: "Compliance",
						uploadBy: "EMPLOYEE",
						isRequired: true,
						isEmployeeVisible: true,
						isActive: true,
						displayOrder: spec.displayOrder,
						fields: [],
						metadata: {
							source: "employee_import_statutory_document_type",
						},
					},
					select: { id: true, code: true, name: true },
				});
				byCode.set(spec.code, created);
			}

			return byCode;
		};

		const promise = load();
		this.statutoryDocumentTypeCache.set(organizationId, promise);
		return promise;
	}

	private async upsertStatutoryDocumentsFromImportRow(params: {
		row: EmployeeImportRow;
		organizationId: string;
		employeeDbId: string;
		issueDate: Date;
		sourceWorkbook?: string | null;
	}) {
		const sourceSpecs = [
			{ rowKey: "TIN", documentCode: "TIN" },
			{ rowKey: "SSS", documentCode: "SSS" },
			{ rowKey: "PHILHEALTH", documentCode: "PHILHEALTH" },
			{ rowKey: "PAGIBIG", documentCode: "PAGIBIG" },
		] as const;
		const entries = sourceSpecs
			.map((spec) => ({
				...spec,
				number: String((params.row as any)[spec.rowKey] || "").trim(),
			}))
			.filter((entry) => entry.number.length > 0);
		if (entries.length === 0) return;

		const documentTypesByCode = await this.getStatutoryDocumentTypes(params.organizationId);
		for (const entry of entries) {
			const documentType = documentTypesByCode.get(entry.documentCode);
			if (!documentType) continue;
			const existingDocument = await (this.prisma as any).document.findFirst({
				where: {
					employeeId: params.employeeDbId,
					isDeleted: false,
					OR: [{ documentTypeId: documentType.id }, { type: entry.documentCode }],
				},
				select: { id: true },
			});
			const documentPayload = {
				name: documentType.name,
				type: documentType.code,
				number: entry.number,
				issueDate: params.issueDate,
				expiryDate: null,
				documentTypeId: documentType.id,
				reviewStatus: "APPROVED" as any,
				reviewSource: "MIGRATION" as any,
				reviewSubmittedAt: new Date(),
				reviewApprovedAt: new Date(),
				fieldValues: {
					number: entry.number,
				},
				metadata: {
					source: "DM3.1 Employees statutory ID",
					sourceWorkbook: params.sourceWorkbook || params.row.DM3_IMPORT_WORKBOOK || null,
					sourceSheet: params.row.SOURCE_SHEET || "Employees",
					sourceRow: params.row.SOURCE_ROW || null,
					sourceField: entry.rowKey,
				},
			};
			if (existingDocument) {
				await (this.prisma as any).document.update({
					where: { id: existingDocument.id },
					data: documentPayload,
				});
			} else {
				const document = await (this.prisma as any).document.create({
					data: {
						...documentPayload,
						employeeId: params.employeeDbId,
					},
				});
				await (this.prisma as any).documentReviewEvent.create({
					data: {
						organizationId: params.organizationId,
						documentId: document.id,
						employeeId: params.employeeDbId,
						eventType: "APPROVED",
						fromStatus: null,
						toStatus: "APPROVED",
						source: "MIGRATION",
						comments: "Created from DM3 Employees statutory ID column.",
					},
				});
			}
		}
	}

	private appendRecentLog(job: ImportJobProgress, entry: ImportProgressLogEntry) {
		job.recentLog.push({
			...entry,
			createdAt: entry.createdAt || new Date().toISOString(),
		});
		if (job.recentLog.length > 50) {
			job.recentLog.shift();
		}
	}

	private prisma: PrismaClient;

	constructor(prisma: PrismaClient) {
		this.prisma = prisma;
	}

	private async createUserViaAuthService(params: {
		email: string;
		userName: string;
		password: string;
		roleId?: string;
		role: string;
		organizationId: string;
		personId: string;
		authToken: string;
	}): Promise<string> {
		if (!config.idpEnabled) {
			const localUser = await ensureLocalUserAccount({
				prisma: this.prisma,
				email: params.email,
				userName: params.userName,
				password: params.password,
				role: params.role,
				organizationId: params.organizationId,
			});
			return localUser.userId;
		}

		if (!params.roleId) {
			throw new Error("roleId is required when IDP is enabled");
		}

		const url = `${config.authBaseUrl}/api/user`;
		const payload = {
			email: params.email,
			userName: params.userName,
			password: params.password,
			status: "active",
			loginMethod: "email",
			organizationId: params.organizationId,
			roleIds: [params.roleId],
			metadata: {
				requirePasswordChange: true,
				isFirstLogin: true,
			},
		};

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${params.authToken}`,
		};

		employeeLogger.info("auth_user_create_attempt source=employee_import");

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Auth service user create failed: ${response.status} ${text}`);
		}

		const result = await response.json();
		const userId = result?.data?.id || result?.user?.id || result?.id;
		if (!userId) throw new Error(`Auth service response missing user id`);

		return userId;
	}

	private async authLogin(
		email: string,
		password: string,
		authToken: string,
	): Promise<{ userId: string; token?: string }> {
		if (!config.idpEnabled) {
			throw new Error("Auth login fallback is unavailable in local auth mode");
		}

		const url = `${config.authBaseUrl}/api/auth/login`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${authToken}`,
		};

		const res = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({ email, password }),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Auth login failed: ${res.status} ${text}`);
		}

		const json = await res.json();
		const userId = json?.data?.id;
		if (!userId) throw new Error(`Auth login response missing user id`);

		return { userId, token: json?.data?.token };
	}

	private async createOrGetUser(params: {
		email: string;
		userName: string;
		passwordCandidates: string[];
		roleId?: string;
		role: string;
		organizationId: string;
		personId: string;
		authToken: string;
	}): Promise<AuthUserResult> {
		const candidates = params.passwordCandidates.filter(
			(candidate) => typeof candidate === "string" && candidate.length > 0,
		);
		if (candidates.length === 0) {
			throw new Error("Password candidates are required for bulk auth create/login");
		}

		try {
			const userId = await this.createUserViaAuthService({
				...params,
				password: candidates[0],
			});
			employeeLogger.info("bulk_password_strategy=normalized");
			return { userId, password: candidates[0] };
		} catch (e: any) {
			const message = String(e?.message || e);
			if (
				config.idpEnabled &&
				(message.includes("already") ||
					message.includes("409") ||
					message.includes("exists"))
			) {
				let lastLoginError: any = null;
				for (let i = 0; i < candidates.length; i++) {
					try {
						const login = await this.authLogin(
							params.email,
							candidates[i],
							params.authToken,
						);
						if (i > 0) {
							employeeLogger.info("bulk_password_fallback=legacy");
						}
						return { userId: login.userId, password: candidates[i] };
					} catch (loginError) {
						lastLoginError = loginError;
					}
				}
				throw lastLoginError || e;
			}
			throw e;
		}
	}

	private sanitizeUserNameSegment(value: string): string {
		return String(value || "")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-zA-Z0-9]/g, "")
			.toLowerCase();
	}

	private buildSafeUserName(params: {
		email: string;
		firstName: string;
		lastName: string;
	}): string {
		const emailLocalPart = params.email.split("@")[0] || "";
		const fromEmail = this.sanitizeUserNameSegment(emailLocalPart);
		const fromName = this.sanitizeUserNameSegment(`${params.firstName}${params.lastName}`);
		let userName = fromEmail || fromName || "user";

		if (!/^[a-z]/.test(userName)) {
			userName = `u${userName}`;
		}

		return userName.slice(0, 30);
	}

	async importEmployee(params: ImportEmployeeParams): Promise<ImportResult> {
		const {
			row,
			organizationId,
			authToken,
			autoCreate,
			applyDefaultLeaveBalances,
			enableAccountProvisioning = true,
			enableCredentialEmails = true,
		} = params;

		try {
			// Use provided helper or create new one
			let helper = params.helper;
			if (!helper) {
				helper = new EmployeeImportHelper(this.prisma, organizationId);
				await helper.loadCaches(authToken);
			}

			// Auto-create missing resources if enabled
			if (autoCreate) {
				await helper.ensureResources(row);
			}

			if (!String(row.SCHEDULE || "").trim()) {
				await helper.ensureBnpiDefaultScheduleTemplate();
			}

			const mappedData = helper.mapRowToEmployeeData(row);
			const importWarnings = Array.isArray((mappedData as any).warnings)
				? ((mappedData as any).warnings as string[]).filter(
						(message) => typeof message === "string" && message.trim().length > 0,
					)
				: [];

			// Schedule is now embedded in employee from helper.mapRowToEmployeeData()
			// No need to look up scheduleId separately

			// Match create flow: derive role strictly from department.isHr + level.isManager.
			const derivedRole = helper.resolveDerivedRoleFlags(row.DEPARTMENT, row.LEVEL, row.SECTION);
			const resolvedRole = derivedRole.role;
			const roleId = config.idpEnabled ? helper.getRoleId(resolvedRole) : undefined;
			// Default password is normalized for bulk flow:
			// lastName (lowercase, no spaces) + employeeId + !{currentYear}
			const lastName = String(mappedData.person.personalInfo.lastName || "");
			const firstName = mappedData.person.personalInfo.firstName.trim();
			const passwordCandidates = buildBulkPasswordCandidates(lastName, row.EMP_ID);
			const userName = row.EMAIL
				? buildSafeUserName({
						email: row.EMAIL,
						firstName,
						lastName,
					})
				: buildSafeUserName({
						email: `${row.EMP_ID || "user"}@placeholder.local`,
						firstName,
						lastName,
					});

			// Create or find person
			let person = await this.prisma.person
				.findFirst({
					where: {
						organizationId,
						contactInfo: { equals: { email: row.EMAIL } } as any,
					},
				})
				.catch(() => null);

			if (!person) {
				person = await this.prisma.person.create({
					data: mappedData.person,
				});
			} else {
				person = await this.prisma.person.update({
					where: { id: person.id },
					data: {
						personalInfo: mappedData.person.personalInfo,
						contactInfo: mappedData.person.contactInfo,
						identification: (mappedData.person as any).identification,
						metadata: (mappedData.person as any).metadata,
					},
				});
			}

			// Create or get user
			let userId: string;
			let userLinkedDuringImport = false;
			let credentialsForEmail:
				| {
						email: string;
						userName: string;
						password: string;
				  }
				| undefined;
			let credentialsEmailSent = false;
			let credentialsEmailError: string | undefined;

			if (enableAccountProvisioning && row.EMAIL) {
				try {
					const userResult = await this.createOrGetUser({
						email: row.EMAIL,
						userName,
						passwordCandidates,
						roleId,
						role: resolvedRole,
						organizationId,
						personId: person.id,
						authToken,
					});
					userId = userResult.userId;
					credentialsForEmail = {
						email: row.EMAIL,
						userName,
						password: userResult.password,
					};

					// Update person with userId
					await this.prisma.person.update({
						where: { id: person.id },
						data: { userId },
					});
					userLinkedDuringImport = true;
				} catch (e: any) {
					console.warn(`Failed to create user for ${row.EMAIL}: ${e?.message || e}`);
					userId = "pending";
				}
			} else {
				userId = "pending";
			}

			const employmentHireDate = row.HIRE_DATE ? new Date(row.HIRE_DATE) : new Date();
			const rawEmployeeFields = (mappedData.employee || {}) as any;

			// Create employee with transaction for schedule
			const employee = await this.prisma.$transaction(async (tx) => {
				const { documents: _ignoredImportDocuments, ...baseEmployeeFields } =
					rawEmployeeFields;

				// Check if employee exists
				const existingEmp = await tx.employee.findUnique({
					where: {
						organizationId_employeeId: {
							organizationId,
							employeeId: row.EMP_ID,
						},
					},
					include: {
						person: true,
					},
				});

				const shouldInjectDefaults =
					!Array.isArray(baseEmployeeFields.leaveBalances) ||
					baseEmployeeFields.leaveBalances.length === 0;

				const existingHasLeaveBalances =
					Array.isArray(existingEmp?.leaveBalances) &&
					existingEmp.leaveBalances.length > 0;

				let employeeFields = baseEmployeeFields;
				if (
					applyDefaultLeaveBalances !== false &&
					shouldInjectDefaults &&
					!existingHasLeaveBalances
				) {
					employeeFields = ensureDefaultLeaveBalances(
						baseEmployeeFields,
						employmentHireDate,
					);
				} else if (shouldInjectDefaults && existingHasLeaveBalances) {
					const {
						leaveBalances: _leaveBalances,
						leaveBalancesLastUpdated: _leaveBalancesLastUpdated,
						...employeeFieldsWithoutLeaveBalanceOverwrite
					} = baseEmployeeFields;
					employeeFields = employeeFieldsWithoutLeaveBalanceOverwrite;
				}

				if (existingEmp) {
					const employerUpdate =
						baseEmployeeFields.employer !== undefined
							? { employer: baseEmployeeFields.employer as any }
							: {};
					// Update existing employee with all fields from CSV
					const updatedEmployee = await tx.employee.update({
						where: { id: existingEmp.id },
						data: {
							...employeeFields,
							userId: userId !== "pending" ? userId : existingEmp.userId, // Update userId if provided
							personId: person.id,
							...employerUpdate,
							role: resolvedRole,
							isManager: derivedRole.isManager,
							isHrManager: derivedRole.isHrManager,
						},
					});
					console.log(`[EMPLOYEE_IMPORT] Updated existing employee ${row.EMP_ID}`);
					// Add to cache so later rows in same batch can reference it
					helper.addEmployeeToCache(row.EMP_ID, updatedEmployee.id);
					return { employee: updatedEmployee, wasCreated: false };
				}

				// Create employee (schedule is already embedded in mappedData.employee)
				const employeeFieldsForCreate = Array.isArray(employeeFields.leaveBalances)
					? employeeFields
					: {
							...employeeFields,
							leaveBalances: [],
							leaveBalancesLastUpdated:
								employeeFields.leaveBalancesLastUpdated ?? null,
						};
				const newEmployee = await tx.employee.create({
					data: {
						...employeeFieldsForCreate,
						personId: person.id,
						userId: userId !== "pending" ? userId : null, // Ensure we don't save "pending" string
						role: resolvedRole, // Add required role field
						isManager: derivedRole.isManager,
						isHrManager: derivedRole.isHrManager,
					},
				});
				console.log(`[EMPLOYEE_IMPORT] Created new employee ${row.EMP_ID}`);

				// Schedule is now embedded in the employee record, no separate relationship needed
				return { employee: newEmployee, wasCreated: true };
			});
			const { employee: importedEmployee, wasCreated } = employee;

			// 4. Add employee to cache so later rows in same batch can reference it (for REPORT_TO_EMP_ID)
			helper.addEmployeeToCache(row.EMP_ID, importedEmployee.id);
			await this.upsertStatutoryDocumentsFromImportRow({
				row,
				organizationId,
				employeeDbId: importedEmployee.id,
				issueDate: employmentHireDate,
				sourceWorkbook: row.DM3_IMPORT_WORKBOOK,
			});

			// Send credentials email only after employee create/update succeeds.
			if (enableCredentialEmails && credentialsForEmail) {
				if (!isEmployeeEmailConfigured) {
					if (!this.hasLoggedEmailConfigWarning) {
						employeeLogger.warn(
							"Credential email sending is disabled. Configure EMPLOYEE_EMAIL_USER/EMPLOYEE_EMAIL_PASS (or EMAIL_USER/EMAIL_PASS, SMTP_USER/APP_PASSWORD).",
						);
						this.hasLoggedEmailConfigWarning = true;
					}
				} else {
					try {
						await sendEmployeeCredentialsEmail({
							to: credentialsForEmail.email,
							employeeId: row.EMP_ID,
							email: credentialsForEmail.email,
							userName: credentialsForEmail.userName,
							password: credentialsForEmail.password,
							fullName: `${firstName} ${lastName}`.trim(),
						});
						credentialsEmailSent = true;
					} catch (emailError: any) {
						credentialsEmailError = String(emailError?.message || emailError);
						employeeLogger.warn(
							`Failed to send credentials email for ${row.EMP_ID}: ${credentialsEmailError}`,
						);
					}
				}
			}

			return {
				success: true,
				employeeId: row.EMP_ID,
				employeeDbId: importedEmployee.id,
				personId: person.id,
				userId: userId !== "pending" ? userId : undefined,
				email: row.EMAIL,
				userName: credentialsForEmail?.userName,
				password: credentialsForEmail?.password,
				fullName: `${firstName} ${lastName}`.trim(),
				role: resolvedRole,
				wasCreated,
				userLinkedDuringImport,
				credentialsEmailSent,
				credentialsEmailError,
				importWarnings,
			};
		} catch (error: any) {
			return {
				success: false,
				employeeId: row.EMP_ID,
				error: error.message,
			};
		}
	}

	/**
	 * Start import job - creates jobId and returns immediately
	 * Processing happens in background via processImport
	 */
	startImport(total: number): string {
		return this.createImportJob(total);
	}

	/**
	 * Process import in background - updates progress as it goes
	 */
	async processImport(params: {
		jobId: string;
		rows: EmployeeImportRow[];
		organizationId: string;
		authToken: string;
		autoCreate?: boolean;
		applyDefaultLeaveBalances?: boolean;
		importMode?: "fast" | "full";
		enableAccountProvisioning?: boolean;
		enableCredentialEmails?: boolean;
		enablePostActions?: boolean;
		enableAttendanceObligationRefresh?: boolean;
		onRowProgress?: (event: {
			row: number;
			employeeId: string;
			fullName?: string;
			success: boolean;
			wasCreated?: boolean;
			message: string;
		}) => void | Promise<void>;
	}): Promise<{
		success: number;
		failed: number;
		results: ImportResult[];
	}> {
		const results: ImportResult[] = [];
		const { jobId, rows, organizationId, authToken, autoCreate, applyDefaultLeaveBalances } =
			params;
		const enableAttendanceObligationRefresh =
			params.enableAttendanceObligationRefresh ?? true;
		const {
			enableAccountProvisioning,
			enableCredentialEmails,
			enablePostActions,
		} = resolveEmployeeImportExecutionOptions(params);

		// Create shared helper instance for the batch
		const helper = new EmployeeImportHelper(this.prisma, organizationId);
		await helper.loadCaches(authToken);
		if (rows.some((row) => !String(row.SCHEDULE || "").trim())) {
			await helper.ensureBnpiDefaultScheduleTemplate();
		}

		let processed = 0;
		let successCount = 0;
		let failedCount = 0;
		let createdCount = 0;
		let updatedCount = 0;
		let skippedCount = 0;
		let blockedCount = 0;

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];

			try {
				const result = await this.importEmployee({
					row,
					organizationId,
					authToken,
					helper,
					autoCreate,
					applyDefaultLeaveBalances,
					enableAccountProvisioning,
					enableCredentialEmails,
				});

				results.push(result);
				processed++;

				if (result.success) {
					successCount++;
					if (result.wasCreated) {
						createdCount++;
					} else {
						updatedCount++;
					}
				} else {
					failedCount++;
					blockedCount++;
					// Store error details (limit to last 50 errors to prevent memory issues)
					const job = EmployeeImportService.importJobs.get(jobId);
					if (job && job.errors.length < 50) {
						job.errors.push({
							row: i + 1,
							employeeId: row.EMP_ID || "unknown",
							error: result.error || "Unknown error",
						});
					}
				}

				if (
					result.success &&
					Array.isArray(result.importWarnings) &&
					result.importWarnings.length
				) {
					const job = EmployeeImportService.importJobs.get(jobId);
					if (job) {
						for (const warningMessage of result.importWarnings) {
							job.warnings.push({
								row: i + 1,
								employeeId: row.EMP_ID || result.employeeId || "unknown",
								stage: "agency_resolution",
								message: warningMessage,
							});
							this.appendRecentLog(job, {
								row: i + 1,
								employeeId: row.EMP_ID || result.employeeId || "unknown",
								fullName: result.fullName || row.NAME,
								success: true,
								message: `[agency_resolution] ${warningMessage}`,
							});
						}
					}
				}

				// Append to recentLog for live UI (keep last 50)
				const successMessage = result.credentialsEmailSent
					? "Added, credentials emailed"
					: result.credentialsEmailError
						? `Added, email failed: ${result.credentialsEmailError}`
						: "Added";
				const job = EmployeeImportService.importJobs.get(jobId);
				if (job) {
					if (
						result.success &&
						result.email &&
						result.userName &&
						result.password &&
						result.role
					) {
						job.credentialExports.push({
							row: i + 1,
							employeeId: row.EMP_ID || result.employeeId || "unknown",
							fullName: result.fullName,
							email: result.email,
							userName: result.userName,
							password: result.password,
							role: result.role,
						});
					}

					this.appendRecentLog(job, {
						row: i + 1,
						employeeId: row.EMP_ID || "unknown",
						fullName: result.fullName || row.NAME,
						success: result.success,
						message: result.success ? successMessage : result.error || "Failed",
					});
				}
				await params.onRowProgress?.({
					row: i + 2,
					employeeId: row.EMP_ID || result.employeeId || "unknown",
					fullName: result.fullName || row.NAME,
					success: result.success,
					wasCreated: result.wasCreated,
					message: result.success ? successMessage : result.error || "Failed",
				});

				// Update progress every row for smooth live UI
				this.updateJobProgress(jobId, {
					processed,
					success: successCount,
					failed: failedCount,
					created: createdCount,
					updated: updatedCount,
					skipped: skippedCount,
					blocked: blockedCount,
				});
			} catch (error: any) {
				// Handle unexpected errors
				processed++;
				failedCount++;
				blockedCount++;
				const errorResult: ImportResult = {
					success: false,
					employeeId: row.EMP_ID || "unknown",
					error: error.message || "Unexpected error during import",
				};
				results.push(errorResult);

				const job = EmployeeImportService.importJobs.get(jobId);
				if (job && job.errors.length < 50) {
					job.errors.push({
						row: i + 1,
						employeeId: row.EMP_ID || "unknown",
						error: error.message || "Unexpected error",
					});
				}
				if (job) {
					this.appendRecentLog(job, {
						row: i + 1,
						employeeId: row.EMP_ID || "unknown",
						fullName: row.NAME,
						success: false,
						message: error.message || "Unexpected error",
					});
				}
				await params.onRowProgress?.({
					row: i + 2,
					employeeId: row.EMP_ID || "unknown",
					fullName: row.NAME,
					success: false,
					message: error.message || "Unexpected error",
				});

				this.updateJobProgress(jobId, {
					processed,
					success: successCount,
					failed: failedCount,
					created: createdCount,
					updated: updatedCount,
					skipped: skippedCount,
					blocked: blockedCount,
				});
			}
		}

		// Second pass: Resolve reportToId for employees that couldn't find their manager initially
		// (e.g. manager was created later in the same batch)
		this.updateJobProgress(jobId, { phase: "resolving_reporting_lines" });
		await this.resolveReportToRelationships(jobId, rows, helper, organizationId);

		// Sync canonical metadata after relationship resolution so team/reportTo scope is accurate.
		try {
			this.updateJobProgress(jobId, { phase: "syncing_metadata" });
			const syncTargets = results
				.filter(
					(result): result is ImportResult & { userId: string; employeeDbId: string } =>
						Boolean(result.success && result.userId && result.employeeDbId),
				)
				.map((result) => ({
					userId: result.userId,
					employeeId: result.employeeDbId,
				}));

			if (syncTargets.length > 0) {
				const helpers = createEmployeeHelpers(this.prisma, employeeLogger);
				const mockReq = {
					headers: { authorization: `Bearer ${authToken}` },
					cookies: authToken ? { token: authToken } : {},
					user: { id: "employee-import-system" },
					userId: "employee-import-system",
				} as any;

				await helpers.syncUserMetadataForEmployees(syncTargets, mockReq);
			}
		} catch (metadataSyncError: any) {
			const warningMessage =
				metadataSyncError?.message ||
				String(metadataSyncError || "Unknown metadata sync error");
			const job = EmployeeImportService.importJobs.get(jobId);
			if (job) {
				job.warnings.push({
					employeeId: "batch",
					stage: "metadata_sync",
					message: warningMessage,
				});
				this.appendRecentLog(job, {
					row: 0,
					employeeId: "batch",
					success: false,
					message: `[metadata_sync] ${warningMessage}`,
				});
			}
		}

		const postActionEmployees = results
			.filter(
				(
					result,
				): result is ImportResult & {
					employeeDbId: string;
					personId: string;
					role: string;
				} =>
					Boolean(
						result.success &&
						(result.wasCreated || result.userLinkedDuringImport) &&
						result.employeeDbId &&
						result.personId &&
						result.role,
					),
			)
			.map((result) => ({
				...(() => {
					const sourceRowIndex = rows.findIndex(
						(row) => row.EMP_ID === result.employeeId && row.EMAIL === result.email,
					);
					const row = sourceRowIndex >= 0 ? rows[sourceRowIndex] : undefined;
					return {
						sourceRow: sourceRowIndex >= 0 ? sourceRowIndex + 1 : undefined,
						sourceWorkbook:
							(row?.SOURCE_WORKBOOK || row?.DM3_IMPORT_WORKBOOK || undefined) as
								| string
								| undefined,
						sourceSheet: row?.SOURCE_SHEET || "Employees",
					};
				})(),
				employeeDbId: result.employeeDbId,
				employeeId: result.employeeId,
				personId: result.personId,
				role: result.role,
				email: result.email || null,
			}));

		const successfulImportedEmployees = results
			.filter(
				(
					result,
				): result is ImportResult & {
					employeeDbId: string;
				} => Boolean(result.success && result.employeeDbId),
			)
			.map((result) => ({
				employeeDbId: result.employeeDbId,
				employeeId: result.employeeId,
				fullName: result.fullName,
				row:
					rows.findIndex(
						(row) => row.EMP_ID === result.employeeId && row.EMAIL === result.email,
					) + 1 || undefined,
			}));

		if (enablePostActions && postActionEmployees.length > 0) {
			this.updateJobProgress(jobId, { phase: "running_post_actions" });
			const postActions = await runEmployeePostActions({
				prisma: this.prisma,
				organizationId,
				createdEmployees: postActionEmployees,
				authToken,
				requestPath: "/api/employee/import",
				enablePostActions: true,
				enableOnboardingReconciliation: true,
				strictMode: false,
				maxConcurrency: 3,
				onProgress: (progress) => {
					const job = EmployeeImportService.importJobs.get(jobId);
					if (!job) return;
					this.appendRecentLog(job, {
						row: progress.row || 0,
						employeeId: progress.employeeId,
						fullName: progress.fullName,
						success: true,
						message: `[${progress.stage}] ${progress.message}`,
					});
				},
			});

			const job = EmployeeImportService.importJobs.get(jobId);
			if (job) {
				job.warnings.push(...postActions.warnings);

				for (const warning of postActions.warnings) {
					this.appendRecentLog(job, {
						row: warning.row || 0,
						employeeId: warning.employeeId,
						success: true,
						message: `[${warning.stage}] ${warning.message}`,
					});
				}

				const failedEmployeeIds = new Set<string>();
				for (const failure of postActions.failures) {
					job.errors.push({
						row: failure.row || 0,
						employeeId: failure.employeeId,
						error: `[${failure.code}] ${failure.message}`,
					});
					this.appendRecentLog(job, {
						row: failure.row || 0,
						employeeId: failure.employeeId,
						success: false,
						message: `[${failure.stage}] ${failure.message}`,
					});
					failedEmployeeIds.add(failure.employeeId);
				}

				if (failedEmployeeIds.size > 0) {
					const postActionFailures = Array.from(failedEmployeeIds).filter((employeeId) =>
						results.some(
							(result) => result.success && result.employeeId === employeeId,
						),
					).length;
					successCount = Math.max(0, successCount - postActionFailures);
					failedCount += postActionFailures;
					blockedCount += postActionFailures;
				}

				const existingExports = new Set(
					job.credentialExports.map((entry) => `${entry.employeeId}:${entry.userName}`),
				);
				for (const entry of postActions.credentialExports) {
					const key = `${entry.employeeId}:${entry.userName}`;
					if (!existingExports.has(key)) {
						job.credentialExports.push(entry);
						existingExports.add(key);
					}
				}
			}
		}

		const postActionEmployeeDbIds = new Set(
			postActionEmployees.map((employee) => employee.employeeDbId),
		);
		const employeesNeedingDirectAttendanceRefresh = enableAttendanceObligationRefresh
			? enablePostActions
				? successfulImportedEmployees.filter(
						(employee) => !postActionEmployeeDbIds.has(employee.employeeDbId),
					)
				: successfulImportedEmployees
			: [];

		if (employeesNeedingDirectAttendanceRefresh.length > 0) {
			this.updateJobProgress(jobId, { phase: "refreshing_attendance_obligations" });
			const refreshed = await this.refreshImportedEmployeeAttendanceObligations({
				jobId,
				organizationId,
				targets: employeesNeedingDirectAttendanceRefresh,
				maxConcurrency: 3,
			});
			const reconciliationResults = await backfillCurrentPayrollPeriodAttendanceObligations(
				this.prisma,
				{ organizationId },
			);
			const reconciled = reconciliationResults.reduce(
				(total, result: any) => total + Number(result?.touched || 0),
				0,
			);
			const job = EmployeeImportService.importJobs.get(jobId);
			if (job) {
				this.appendRecentLog(job, {
					row: 0,
					employeeId: "batch",
					success: true,
					message: `[attendance] ${refreshed.toLocaleString()} employee-targeted rows refreshed; ${reconciled.toLocaleString()} open-period rows reconciled after import`,
				});
			}
		}

		// Mark job as completed
		this.updateJobProgress(jobId, {
			status: "completed",
			phase: "completed",
			success: successCount,
			failed: failedCount,
			created: createdCount,
			updated: updatedCount,
			skipped: skippedCount,
			blocked: blockedCount,
			completedAt: new Date(),
		});

		employeeLogger.info(
			`Import job ${jobId} completed: ${successCount} success, ${failedCount} failed`,
		);

		return { success: successCount, failed: failedCount, results };
	}

	/**
	 * Second pass: Update reportToId for employees whose manager was created later in the batch
	 */
	private async resolveReportToRelationships(
		jobId: string,
		rows: EmployeeImportRow[],
		helper: EmployeeImportHelper,
		organizationId: string,
	): Promise<void> {
		let resolvedCount = 0;
		let unresolvedCount = 0;

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const reportToEmpId =
				typeof row.REPORT_TO_EMP_ID === "string"
					? row.REPORT_TO_EMP_ID.trim()
					: row.REPORT_TO_EMP_ID;

			// Skip if no REPORT_TO_EMP_ID provided
			if (!reportToEmpId || String(reportToEmpId).length === 0) {
				continue;
			}

			try {
				// Find the employee we just created
				const employee = await this.prisma.employee.findUnique({
					where: {
						organizationId_employeeId: {
							organizationId,
							employeeId: row.EMP_ID,
						},
					},
					select: { id: true, reportToId: true },
				});

				// If employee doesn't exist, skip
				if (!employee) {
					continue;
				}

				// Try to find the manager now (should be in cache if created in this batch)
				const reportToId = helper.getReportToId(String(reportToEmpId));

				if (!reportToId) {
					unresolvedCount++;
					employeeLogger.warn(
						`Could not resolve reportToId for ${row.EMP_ID}: manager ${reportToEmpId} not found`,
					);
					continue;
				}

				// Update if reportToId is different (null or different manager)
				if (
					shouldBackfillAttendanceObligationsAfterReportToResolution({
						currentReportToId: employee.reportToId,
						resolvedReportToId: reportToId,
					})
				) {
					await this.prisma.employee.update({
						where: { id: employee.id },
						data: { reportToId },
					});
					await backfillCurrentPayrollPeriodAttendanceObligations(this.prisma, {
						organizationId,
						employeeId: employee.id,
					});
					resolvedCount++;
					employeeLogger.info(
						`Resolved reportToId for ${row.EMP_ID}: now reports to ${reportToEmpId}`,
					);
				}
			} catch (error: any) {
				employeeLogger.warn(
					`Error resolving reportToId for ${row.EMP_ID}: ${error.message}`,
				);
			}
		}

		if (resolvedCount > 0 || unresolvedCount > 0) {
			employeeLogger.info(
				`ReportTo resolution: ${resolvedCount} resolved, ${unresolvedCount} unresolved`,
			);
		}
	}

	async importEmployees(params: {
		rows: EmployeeImportRow[];
		organizationId: string;
		authToken: string;
		autoCreate?: boolean;
		importMode?: "fast" | "full";
		enableAccountProvisioning?: boolean;
		enableCredentialEmails?: boolean;
	}): Promise<{
		jobId: string;
		success: number;
		failed: number;
		results: ImportResult[];
	}> {
		const jobId = this.startImport(params.rows.length);

		// Start background processing - do NOT await
		this.processImport({
			jobId,
			...params,
		}).catch((error) => {
			employeeLogger.error(`Background import job ${jobId} failed: ${error}`);
			const job = EmployeeImportService.getJobProgress(jobId);
			if (job) {
				const errorMessage =
					error?.message || String(error || "Employee import failed unexpectedly");
				job.status = "failed";
				job.phase = "failed";
				job.failed = Math.max(job.failed || 0, Math.max(1, job.total - job.processed));
				job.blocked = Math.max(job.blocked || 0, job.failed || 1);
				job.errors.push({
					row: 0,
					employeeId: "batch",
					error: errorMessage,
				});
				job.recentLog.push({
					row: 0,
					employeeId: "batch",
					success: false,
					message: `[system] ${errorMessage}`,
					createdAt: new Date().toISOString(),
				});
				if (job.recentLog.length > 50) {
					job.recentLog.splice(0, job.recentLog.length - 50);
				}
				job.completedAt = new Date();
			}
		});

		return { jobId, success: 0, failed: 0, results: [] };
	}

	private async handlePostCreationTasks(params: {
		employeeId: string;
		userId: string;
		organizationId: string;
		authToken: string;
		role: string;
	}) {
		try {
			// 1. Fetch full employee details for metadata and checks
			const employee = await this.prisma.employee.findUnique({
				where: { id: params.employeeId },
				include: {
					department: true,
					position: true,
					level: true,
					documents: {
						where: { isDeleted: false },
					},
					person: {
						select: {
							personalInfo: true,
						},
					},
					reportTo: {
						include: {
							person: {
								select: {
									personalInfo: true,
									contactInfo: true,
								},
							},
						},
					},
				},
			});

			if (!employee) return;

			// 2. Patch User Metadata (Sync details to Auth Service)
			try {
				const helpers = createEmployeeHelpers(this.prisma, employeeLogger);
				// Create a mock request object with the auth token
				const mockReq = {
					headers: { authorization: `Bearer ${params.authToken}` },
				} as any;

				// Call updateUserMetadata (or patchUserMetadata if alias exists)
				// We'll use the logic directly found in helper if needed, but let's try the helper first.
				// Based on my view, helper has 'updateUserMetadata'.
				// If strictly typed, I might need to cast or use 'any'.
				const helperAny = helpers as any;
				if (typeof helperAny.updateUserMetadata === "function") {
					await helperAny.updateUserMetadata(params.userId, employee.id, mockReq);
				} else if (typeof helperAny.patchUserMetadata === "function") {
					await helperAny.patchUserMetadata(params.userId, employee.id, mockReq);
				}

				// 2.4 Handle Device Enrollment if deviceEmpId is present
				if (employee.deviceEmpId) {
					try {
						const localUser = await this.prisma.user.findUnique({
							where: { id: params.userId },
							select: { metadata: true },
						});
						const existingMetadata =
							(localUser?.metadata as Record<string, any> | null) || {};
						const existingDevice = (existingMetadata.device || {}) as Record<
							string,
							any
						>;
						const updatedMetadata = {
							...existingMetadata,
							device: {
								...existingDevice,
								access: {
									empId: employee.deviceEmpId,
									status: "enrolled",
								},
							},
						};

						await helperAny.updateUserAccount(
							params.userId,
							{ metadata: updatedMetadata },
							mockReq,
						);
						console.log(
							`Successfully enrolled device for employee ${employee.employeeId} with device ID ${employee.deviceEmpId}`,
						);
					} catch (deviceError) {
						console.warn(
							`Failed to enroll device for ${params.userId}: ${deviceError}`,
						);
					}
				}

				// 2.5 Create Birthday Calendar Item
				if (getJsonString((employee as any).person?.personalInfo, "dateOfBirth")) {
					const personName =
						`${getJsonString((employee as any).person?.personalInfo, "firstName")} ${getJsonString((employee as any).person?.personalInfo, "lastName")}`.trim();
					if (typeof helperAny.createOrUpdateBirthdayCalendarItem === "function") {
						await helperAny.createOrUpdateBirthdayCalendarItem(
							employee.id,
							params.organizationId,
							getJsonString((employee as any).person?.personalInfo, "dateOfBirth"),
							personName,
						);
						console.log(`Created birthday calendar item for ${personName}`);
					}
				}

				// 2.6 Log Employee Creation (Audit)
				if (typeof helperAny.logEmployeeCreation === "function") {
					await helperAny.logEmployeeCreation(mockReq, employee);
				}
			} catch (metaError) {
				console.warn(
					`Failed to execute post-creation helpers for ${params.userId}: ${metaError}`,
				);
			}

			// 3. Create Boarding Process
			try {
				// Check for missing credentials
				const missingDocs = checkMissingCredentials(employee);

				// Check for boarding template
				const template = await this.prisma.boardingTemplate.findFirst({
					where: {
						role: params.role,
						type: "ONBOARDING",
						isActive: true,
						isDeleted: false,
						organizationId: params.organizationId,
					},
				});

				if (template || missingDocs.length > 0) {
					// Create process via helper
					// Note: createBoardingProcess handles template logic
					let boardingProcess = await createBoardingProcess({
						prisma: this.prisma,
						organizationId: params.organizationId,
						employeeId: params.employeeId,
						type: "ONBOARDING",
						targetDate: new Date(), // Or hire date?
						departmentId: employee.departmentId,
						role: params.role,
						templateId: template?.id,
					});

					// If createBoardingProcess returned null (no template) but we have missing docs,
					// we need to create a process manually (like controller does).
					if (!boardingProcess && missingDocs.length > 0) {
						boardingProcess = await this.prisma.boardingProcess.create({
							data: {
								organizationId: params.organizationId,
								employeeId: params.employeeId,
								departmentId: employee.departmentId,
								type: "ONBOARDING",
								status: "NOT_STARTED",
								startDate: new Date(),
								targetDate: new Date(),
								metadata: {
									generatedFromMissingCredentials: true,
								},
							},
						});
					}

					// Create document checklist items if process exists
					if (boardingProcess) {
						await createDocumentChecklistItems({
							prisma: this.prisma,
							organizationId: params.organizationId,
							employeeId: params.employeeId,
							processId: boardingProcess.id,
							targetDate: new Date(),
						});
					}
				}
			} catch (boardError) {
				console.warn(
					`Failed to create boarding process for ${params.employeeId}: ${boardError}`,
				);
			}
		} catch (error) {
			console.error(`Error in post-creation tasks for ${params.employeeId}:`, error);
		}
	}
}
