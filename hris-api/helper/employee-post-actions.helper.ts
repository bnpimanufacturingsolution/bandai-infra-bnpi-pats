import { Request } from "express";
import { PrismaClient } from "../generated/prisma";
import { reconcileEmployeeOnboardingState } from "./boarding-documents.helper";
import { createEmployeeHelpers } from "./employee.helper";
import { buildBulkPasswordCandidates } from "./bulk-password.helper";
import {
	isEmployeeEmailConfigured,
	sendEmployeeCredentialsEmail,
} from "./employee-credentials-email.helper";
import { getLogger } from "./logger.helper";
import { invalidateCache } from "../middleware/cache";
import { config } from "../config/config";
import { backfillOpenPayrollPeriodAttendanceObligations } from "./attendance-obligation.helper";
import { ensureCurrentPayrollPeriodDraftTimesheet } from "./timesheet.helper";

/**
 * Employee creation/import post-action event map.
 *
 * Source-of-truth boundary:
 * - Person = identity/contact source for a human.
 * - Employee = HR employee master source for assignment, payroll, schedule, and role.
 * - User = login/auth account linked by Employee.userId and Person.userId.
 * - Document/BoardingProcess/ChecklistItem = onboarding and 201-file task state.
 * - CalendarItem = birthday/HR calendar projection.
 * - AttendanceObligation = live operational attendance-day projection.
 * - Draft Timesheet = current-period employee timesheet shell until submission/review/payroll.
 *
 * Main entry points:
 * - Add Employee form: employee.controller creates Person + Employee, creates User, links userId,
 *   syncs user metadata, logs audit/activity, upserts birthday calendar, creates onboarding /
 *   document checklist rows when needed, then queues attendance/timesheet coverage backfill.
 * - Employee import full mode: employee-import.service writes Person + Employee rows, creates or
 *   links User accounts for rows with a real source email, then calls runEmployeePostActions for
 *   shared metadata/calendar/attendance/logging work.
 * - DM3 Employees import from /admin/configuration/migration: must use full import with account
 *   provisioning enabled. It must not synthesize placeholder emails; rows without real source email
 *   remain employee records and emit an auth warning until HR supplies a verified email or a later
 *   employee-ID-only account strategy is implemented.
 * - Employee import fast mode: repair/special-purpose path only. It skips account provisioning and
 *   shared post-actions unless the caller explicitly enables them; do not use it for normal DM3.
 *
 * Duplication rule:
 * Keep side effects in this shared helper or in the Add Employee controller's form-only flow. New
 * import callers should not independently create users, birthday rows, onboarding rows, audit logs,
 * or attendance obligations when this helper can own the same event once.
 *
 * Current shared post-action stages:
 * - auth: create/link User account, then write Person.userId and Employee.userId.
 * - email: optionally send credentials and expose a credential CSV export.
 * - metadata: sync role/employee/department/position metadata into the user record.
 * - device: copy deviceEmpId into user metadata when present.
 * - calendar: upsert the birthday CalendarItem.
 * - boarding: optional onboarding/document compliance reconciliation.
 * - attendance: refresh open-period AttendanceObligation rows and ensure the current DRAFT timesheet.
 * - logging/cache: write activity/audit log and invalidate employee/schedule caches.
 */
const logger = getLogger();
const postActionLogger = logger.child({ module: "employee-post-actions" });

export type PostActionStage =
	| "auth"
	| "email"
	| "metadata"
	| "device"
	| "calendar"
	| "boarding"
	| "attendance"
	| "logging"
	| "cache";

export type PostActionFailureCode =
	| "AUTH_REGISTER_FAILED"
	| "AUTH_EXISTING_ACCOUNT_PASSWORD_UNKNOWN"
	| "AUTH_LINK_FAILED"
	| "EMAIL_SEND_FAILED"
	| "EMAIL_CONFIG_MISSING";

export interface PostActionWarning {
	row?: number;
	employeeId: string;
	stage: PostActionStage;
	message: string;
}

export interface PostActionProgress {
	row?: number;
	employeeId: string;
	fullName?: string;
	stage: PostActionStage;
	message: string;
}

export interface PostActionFailure {
	row?: number;
	employeeId: string;
	stage: Extract<PostActionStage, "auth" | "email">;
	code: PostActionFailureCode;
	message: string;
}

export interface PostActionsSummary {
	attempted: number;
	completed: number;
	authCreated: number;
	authLinkedExisting: number;
	credentialsEmailSent: number;
	credentialsEmailFailed: number;
	strictMode: boolean;
	strictRowsFailed: number;
	strictRowsRolledBack: number;
	metadataPatched: number;
	calendarUpserted: number;
	boardingCreated: number;
	attendanceObligationsRefreshed: number;
	draftTimesheetsEnsured: number;
	warningsCount: number;
}

export interface PostActionsResult {
	summary: PostActionsSummary;
	warnings: PostActionWarning[];
	failures: PostActionFailure[];
	credentialExports: Array<{
		row?: number;
		employeeId: string;
		fullName?: string;
		email: string;
		userName: string;
		password: string;
		role: string;
	}>;
}

export interface CreatedEmployeePostActionInput {
	employeeDbId: string;
	employeeId: string;
	personId: string;
	role: string;
	email?: string | null;
	sourceRow?: number;
	sourceWorkbook?: string | null;
	sourceSheet?: string | null;
}

export interface RunEmployeePostActionsParams {
	prisma: PrismaClient;
	organizationId: string;
	createdEmployees: CreatedEmployeePostActionInput[];
	authToken?: string;
	actorUserId?: string;
	requestPath?: string;
	enablePostActions?: boolean;
	enableOnboardingReconciliation?: boolean;
	enableAttendanceObligationRefresh?: boolean;
	maxConcurrency?: number;
	strictMode?: boolean;
	onProgress?: (progress: PostActionProgress) => void;
}

const createEmptySummary = (): PostActionsSummary => ({
	attempted: 0,
	completed: 0,
	authCreated: 0,
	authLinkedExisting: 0,
	credentialsEmailSent: 0,
	credentialsEmailFailed: 0,
	strictMode: false,
	strictRowsFailed: 0,
	strictRowsRolledBack: 0,
	metadataPatched: 0,
	calendarUpserted: 0,
	boardingCreated: 0,
	attendanceObligationsRefreshed: 0,
	draftTimesheetsEnsured: 0,
	warningsCount: 0,
});

const normalizeRoleName = (role?: string | null): string =>
	typeof role === "string" ? role.toLowerCase().trim() : "";

const extractRoleDocuments = (result: any): any[] => {
	if (Array.isArray(result?.data?.documents)) return result.data.documents;
	if (Array.isArray(result?.data?.roles)) return result.data.roles;
	if (Array.isArray(result?.data)) return result.data;
	if (Array.isArray(result?.roles)) return result.roles;
	if (Array.isArray(result?.documents)) return result.documents;
	return [];
};

const buildAuthHeaders = (authToken?: string): Record<string, string> => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (authToken) headers.Authorization = `Bearer ${authToken}`;
	return headers;
};

const buildMockRequest = (params: {
	authToken?: string;
	actorUserId?: string;
	requestPath?: string;
}): Request => {
	const authHeader = params.authToken ? `Bearer ${params.authToken}` : undefined;
	const req: Partial<Request> = {
		method: "POST",
		originalUrl: params.requestPath || "/api/migration/upload-csv",
		ip: "127.0.0.1",
		headers: {
			...(authHeader ? { authorization: authHeader } : {}),
		} as any,
		cookies: params.authToken ? { token: params.authToken } : {},
		socket: {
			remoteAddress: "127.0.0.1",
		} as any,
		get: (name: string) => {
			const key = name.toLowerCase();
			if (key === "authorization") return authHeader;
			if (key === "content-type") return "application/json";
			if (key === "user-agent") return "migration-post-actions";
			return undefined;
		},
	} as Partial<Request>;

	(req as any).user = { id: params.actorUserId || "migration-system" };
	(req as any).userId = params.actorUserId || "migration-system";

	return req as Request;
};

const isExistingAuthUserError = (error: unknown): boolean => {
	const message = String((error as any)?.message || error || "").toLowerCase();
	return (
		message.includes("already") ||
		message.includes("exists") ||
		message.includes("409") ||
		message.includes("duplicate")
	);
};

const loginExistingAuthUser = async (params: {
	email: string;
	passwordCandidates: string[];
	authToken?: string;
}): Promise<{ userId: string; usedLegacyFallback: boolean; password: string }> => {
	if (!config.idpEnabled) {
		throw new Error("Existing-auth login fallback is unavailable when IDP is disabled");
	}

	let lastError: any = null;
	const candidates = params.passwordCandidates.filter(
		(candidate) => typeof candidate === "string" && candidate.length > 0,
	);
	if (candidates.length === 0) {
		throw new Error("Missing password candidates for auth login fallback");
	}

	for (let i = 0; i < candidates.length; i++) {
		const response = await fetch(`${config.authBaseUrl}/api/auth/login`, {
			method: "POST",
			headers: buildAuthHeaders(params.authToken),
			body: JSON.stringify({ email: params.email, password: candidates[i] }),
		});

		if (!response.ok) {
			const text = await response.text();
			lastError = new Error(`Auth login failed: ${response.status} ${text}`);
			continue;
		}

		const body = await response.json();
		const userId = body?.data?.id || body?.user?.id || body?.id;
		if (!userId) {
			lastError = new Error("Auth login response missing user id");
			continue;
		}

		return {
			userId: String(userId),
			usedLegacyFallback: i > 0,
			password: candidates[i],
		};
	}

	throw lastError || new Error("Auth login failed for all password candidates");
};

const patchAuthUserMetadata = async (params: {
	authToken?: string;
	userId: string;
	employee: any;
	organizationId: string;
}): Promise<void> => {
	if (!params.authToken) {
		throw new Error("Missing auth token for metadata patch");
	}

	const personalInfo = (params.employee.person?.personalInfo || {}) as Record<string, any>;
	const reportToPersonalInfo = (params.employee.reportTo?.person?.personalInfo ||
		{}) as Record<string, any>;
	const reportToContactInfo = (params.employee.reportTo?.person?.contactInfo ||
		{}) as Record<string, any>;

	const payload = {
		metadata: {
			employee: {
				id: params.employee.id,
				personalInfo: {
					firstName: String(personalInfo.firstName || ""),
					lastName: String(personalInfo.lastName || ""),
				},
				department: params.employee.department
					? {
							id: params.employee.department.id,
							name: params.employee.department.name,
							code: params.employee.department.code,
						}
					: undefined,
				position: params.employee.position
					? {
							id: params.employee.position.id,
							title: params.employee.position.title,
							code: params.employee.position.code,
						}
					: undefined,
				level: params.employee.level
					? {
							id: params.employee.level.id,
							name: params.employee.level.name,
							rank: params.employee.level.rank ?? null,
						}
					: undefined,
				reportTo: params.employee.reportTo
					? {
							id: params.employee.reportTo.id,
							firstName: String(reportToPersonalInfo.firstName || ""),
							lastName: String(reportToPersonalInfo.lastName || ""),
							email: reportToContactInfo.email || null,
						}
					: undefined,
			},
			device: {
				access: {
					status: "unenrolled",
				},
			},
			isFirstLogin: true,
			requirePasswordChange: true,
		},
	};

	const response = await fetch(`${config.authBaseUrl}/api/user/${params.userId}`, {
		method: "PATCH",
		headers: buildAuthHeaders(params.authToken),
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Metadata patch failed: ${response.status} ${text}`);
	}
};

const updateDeviceMetadata = async (params: {
	authToken?: string;
	userId: string;
	deviceEmpId: string;
}): Promise<void> => {
	if (!params.authToken) throw new Error("Missing auth token for device metadata update");

	const getResp = await fetch(`${config.authBaseUrl}/api/user/${params.userId}`, {
		method: "GET",
		headers: buildAuthHeaders(params.authToken),
	});

	if (!getResp.ok) {
		const text = await getResp.text();
		throw new Error(`Failed to read user metadata: ${getResp.status} ${text}`);
	}

	const getBody = await getResp.json();
	const user = getBody?.data || getBody?.user || getBody || {};
	const metadata = (user.metadata || {}) as Record<string, any>;
	const device = (metadata.device || {}) as Record<string, any>;

	const mergedMetadata = {
		...metadata,
		device: {
			...device,
			access: {
				empId: params.deviceEmpId,
				status: "enrolled",
			},
		},
	};

	const patchResp = await fetch(`${config.authBaseUrl}/api/user/${params.userId}`, {
		method: "PATCH",
		headers: buildAuthHeaders(params.authToken),
		body: JSON.stringify({ metadata: mergedMetadata }),
	});

	if (!patchResp.ok) {
		const text = await patchResp.text();
		throw new Error(`Failed to patch device metadata: ${patchResp.status} ${text}`);
	}
};

const upsertBirthdayCalendarItem = async (params: {
	prisma: PrismaClient;
	employeeId: string;
	organizationId: string;
	dateOfBirth?: Date | string | null;
	personName: string;
}): Promise<boolean> => {
	if (!params.dateOfBirth) return false;

	const dob = new Date(params.dateOfBirth);
	if (Number.isNaN(dob.getTime())) return false;

	const currentYear = new Date().getFullYear();
	const birthdayThisYear = new Date(
		Date.UTC(currentYear, dob.getUTCMonth(), dob.getUTCDate(), 0, 0, 0, 0),
	);

	const existing = await params.prisma.calendarItem.findFirst({
		where: {
			organizationId: params.organizationId,
			year: currentYear,
			type: "BIRTHDAY",
			assignedEmployeeId: params.employeeId,
		},
	});

	if (existing) {
		await params.prisma.calendarItem.update({
			where: { id: existing.id },
			data: {
				title: `${params.personName}'s Birthday`,
				description: `Happy Birthday to ${params.personName}!`,
				startDate: birthdayThisYear,
				endDate: birthdayThisYear,
				year: currentYear,
				isAllDay: true,
				status: "ACTIVE",
			},
		});
		return true;
	}

	await params.prisma.calendarItem.create({
		data: {
			organizationId: params.organizationId,
			year: currentYear,
			title: `${params.personName}'s Birthday`,
			description: `Happy Birthday to ${params.personName}!`,
			type: "BIRTHDAY",
			startDate: birthdayThisYear,
			endDate: birthdayThisYear,
			isAllDay: true,
			timezone: "UTC",
			status: "ACTIVE",
			assignedEmployeeId: params.employeeId,
			tags: ["birthday", "celebration"],
		},
	});

	return true;
};

const addWarning = (
	warnings: PostActionWarning[],
	employeeId: string,
	stage: PostActionStage,
	message: string,
	row?: number,
) => {
	warnings.push({
		...(typeof row === "number" && Number.isFinite(row) ? { row } : {}),
		employeeId,
		stage,
		message,
	});
};

export const runEmployeePostActions = async (
	params: RunEmployeePostActionsParams,
): Promise<PostActionsResult> => {
	const summary = createEmptySummary();
	const warnings: PostActionWarning[] = [];
	const failures: PostActionFailure[] = [];
	const credentialExports: PostActionsResult["credentialExports"] = [];
	const strictMode = params.strictMode === true;
	const failureIndexByEmployeeId = new Map<string, number>();
	const retryDelaysMs = [300, 900];
	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	summary.strictMode = strictMode;

	const addFailure = (
		item: CreatedEmployeePostActionInput,
		stage: Extract<PostActionStage, "auth" | "email">,
		code: PostActionFailureCode,
		message: string,
	) => {
		if (failureIndexByEmployeeId.has(item.employeeId)) return;

		const failure: PostActionFailure = {
			employeeId: item.employeeId,
			stage,
			code,
			message,
		};
		if (typeof item.sourceRow === "number" && Number.isFinite(item.sourceRow)) {
			failure.row = item.sourceRow;
		}

		failures.push(failure);
		failureIndexByEmployeeId.set(item.employeeId, failures.length - 1);
		addWarning(warnings, item.employeeId, stage, message);
	};

	if (params.enablePostActions === false || params.createdEmployees.length === 0) {
		summary.warningsCount = warnings.length;
		summary.strictRowsFailed = failures.length;
		return { summary, warnings, failures, credentialExports };
	}

	const helpers = createEmployeeHelpers(params.prisma, postActionLogger);
	const mockReq = buildMockRequest({
		authToken: params.authToken,
		actorUserId: params.actorUserId,
		requestPath: params.requestPath,
	});

	const concurrency = Math.max(1, Math.min(5, params.maxConcurrency ?? 3));
	const canSendCredentialsEmail = isEmployeeEmailConfigured;
	const authRoleIdByName = new Map<string, string>();

	if (config.idpEnabled && params.authToken) {
		const response = await fetch(`${config.authBaseUrl}/api/role?document=true&limit=200`, {
			method: "GET",
			headers: buildAuthHeaders(params.authToken),
		});

		if (!response.ok) {
			const text = await response.text();
			addWarning(
				warnings,
				"*",
				"auth",
				`Failed to fetch auth roles: ${response.status} ${text}`,
			);
		} else {
			const result = await response.json();
			const roles = extractRoleDocuments(result);
			roles.forEach((role: any) => {
				const roleName = normalizeRoleName(role?.name);
				const roleId =
					typeof role?.id === "string"
						? role.id
						: typeof role?._id === "string"
							? role._id
							: "";
				if (roleName && roleId) {
					authRoleIdByName.set(roleName, roleId);
				}
			});
		}
	}

	if (!canSendCredentialsEmail) {
		addWarning(
			warnings,
			"*",
			"email",
			"Credential email sending is disabled. Configure EMPLOYEE_EMAIL_USER/EMPLOYEE_EMAIL_PASS (or EMAIL_USER/EMAIL_PASS, SMTP_USER/APP_PASSWORD).",
		);
	}

	const sendCredentialsEmailWithRetry = async (payload: {
		to: string;
		employeeId: string;
		email: string;
		userName: string;
		password: string;
		fullName: string;
	}): Promise<{ sent: boolean; reason?: string }> => {
		let lastReason = "";

		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const emailResult = await sendEmployeeCredentialsEmail(payload);
				if (emailResult.sent) return { sent: true };
				lastReason =
					emailResult.reason ||
					`Email provider returned unsuccessful status on attempt ${attempt + 1}`;
			} catch (error: any) {
				lastReason = `Attempt ${attempt + 1} failed: ${error?.message || String(error)}`;
			}

			if (attempt < retryDelaysMs.length) {
				await sleep(retryDelaysMs[attempt]);
			}
		}

		return {
			sent: false,
			reason: lastReason || "Credentials email failed after retries",
		};
	};

	const processEmployee = async (item: CreatedEmployeePostActionInput) => {
		summary.attempted += 1;

		try {
			const employee = await params.prisma.employee.findUnique({
				where: { id: item.employeeDbId },
				include: {
					person: true,
					department: true,
					position: true,
					level: true,
					documents: {
						where: { isDeleted: false },
					},
					reportTo: {
						include: {
							person: true,
						},
					},
				},
			});

			if (!employee) {
				addFailure(item, "auth", "AUTH_LINK_FAILED", "Employee no longer exists");
				return;
			}

			const personInfo = (employee.person?.personalInfo || {}) as Record<string, any>;
			const contactInfo = (employee.person?.contactInfo || {}) as Record<string, any>;
			const firstName = String(personInfo.firstName || "");
			const lastName = String(personInfo.lastName || "");
			const personName = `${firstName} ${lastName}`.trim() || employee.employeeId;
			const email = (contactInfo.email || item.email || "").toString().trim();
			const sourceLabel = [
				item.sourceWorkbook ? `workbook ${item.sourceWorkbook}` : "DM3.1 Employees",
				item.sourceSheet ? `sheet ${item.sourceSheet}` : "",
				typeof item.sourceRow === "number" && Number.isFinite(item.sourceRow)
					? `row ${item.sourceRow}`
					: "",
			]
				.filter(Boolean)
				.join(", ");
			const reportProgress = (stage: PostActionStage, message: string) => {
				params.onProgress?.({
					...(typeof item.sourceRow === "number" && Number.isFinite(item.sourceRow)
						? { row: item.sourceRow }
						: {}),
					employeeId: employee.employeeId,
					fullName: personName,
					stage,
					message: `${sourceLabel}: ${message}`,
				});
			};

			let linkedUserId = employee.userId || undefined;
			let credentialsForEmail:
				| {
						email: string;
						userName: string;
						password: string;
				  }
				| null = null;
			let authSatisfied = Boolean(linkedUserId);
			let emailSatisfied = false;

			// Stage: Auth create/link
			if (linkedUserId) {
				authSatisfied = true;
			} else if (!email) {
				const message =
					"Employee email is required for account provisioning; employee record was imported without a linked user account.";
				if (strictMode) {
					addFailure(item, "auth", "AUTH_REGISTER_FAILED", message);
				} else {
					addWarning(warnings, item.employeeId, "auth", message, item.sourceRow);
				}
			} else if (config.idpEnabled && !params.authToken) {
				addFailure(
					item,
					"auth",
					"AUTH_REGISTER_FAILED",
					"Missing auth token. Cannot provision/link auth account during migration.",
				);
			} else {
				try {
					const credentials = helpers.generateUserCredentials(
						{
							organizationId: params.organizationId,
							personalInfo: { firstName, lastName },
							contactInfo: { email },
						},
						{ employeeId: employee.employeeId },
					);
					const passwordCandidates = buildBulkPasswordCandidates(
						lastName,
						employee.employeeId,
					);
					const roleName = normalizeRoleName(item.role || employee.role);
					const roleId = authRoleIdByName.get(roleName);
					if (config.idpEnabled && !roleId) {
						addFailure(
							item,
							"auth",
							"AUTH_REGISTER_FAILED",
							`Auth role "${item.role || employee.role}" not found in live auth role list.`,
						);
						return;
					}
					let resolvedPassword = passwordCandidates[0];
					const registerPayload = {
						email: credentials.email,
						userName: credentials.userName,
						password: resolvedPassword,
						roleId,
						role: item.role || employee.role,
						organizationId: params.organizationId,
						personId: item.personId,
						status: "active",
						loginMethod: "email",
					};
					let authLinked = false;

					try {
						const created = await helpers.createUserAccount(registerPayload, mockReq);
						linkedUserId = created.userId;
						postActionLogger.info("bulk_password_strategy=normalized");
						summary.authCreated += 1;
						authLinked = true;
					} catch (registerError) {
						if (!config.idpEnabled || !isExistingAuthUserError(registerError)) {
							addFailure(
								item,
								"auth",
								"AUTH_REGISTER_FAILED",
								`Failed to create auth user: ${
									(registerError as any)?.message || String(registerError)
								}`,
							);
						} else {
							try {
								const login = await loginExistingAuthUser({
									email: credentials.email,
									passwordCandidates,
									authToken: params.authToken,
								});
								if (login.usedLegacyFallback) {
									postActionLogger.info("bulk_password_fallback=legacy");
								}
								resolvedPassword = login.password;
								linkedUserId = login.userId;
								summary.authLinkedExisting += 1;
								authLinked = true;
							} catch (loginError: any) {
								addFailure(
									item,
									"auth",
									"AUTH_EXISTING_ACCOUNT_PASSWORD_UNKNOWN",
									`Auth account exists but generated password candidates failed; reset API unavailable. ${
										loginError?.message || String(loginError)
									}`,
								);
							}
						}
					}

					if (authLinked && linkedUserId) {
						try {
							await params.prisma.person.update({
								where: { id: item.personId },
								data: { userId: linkedUserId },
							});
							await params.prisma.employee.update({
								where: { id: item.employeeDbId },
								data: { userId: linkedUserId },
							});
							credentialsForEmail = {
								email: credentials.email,
								userName: credentials.userName,
								password: resolvedPassword,
							};
							authSatisfied = true;
							reportProgress("auth", "auth account linked to Person.userId and Employee.userId");
						} catch (linkError: any) {
							addFailure(
								item,
								"auth",
								"AUTH_LINK_FAILED",
								`Failed to link auth user to employee/person: ${
									linkError?.message || String(linkError)
								}`,
							);
						}
					} else if (authLinked && !linkedUserId) {
						addFailure(
							item,
							"auth",
							"AUTH_LINK_FAILED",
							"Auth account linkage failed: missing user id from auth service response.",
						);
					}
				} catch (authError: any) {
					addFailure(
						item,
						"auth",
						"AUTH_REGISTER_FAILED",
						`Failed to create/link auth user: ${authError?.message || String(authError)}`,
					);
				}
			}

			if (authSatisfied && credentialsForEmail && item.role) {
				credentialExports.push({
					...(typeof item.sourceRow === "number" && Number.isFinite(item.sourceRow)
						? { row: item.sourceRow }
						: {}),
					employeeId: employee.employeeId,
					fullName: personName,
					email: credentialsForEmail.email,
					userName: credentialsForEmail.userName,
					password: credentialsForEmail.password,
					role: item.role,
				});
			}

			// Stage: Credentials email
			if (authSatisfied && credentialsForEmail) {
				if (!canSendCredentialsEmail) {
					summary.credentialsEmailFailed += 1;
					addFailure(
						item,
						"email",
						"EMAIL_CONFIG_MISSING",
						"Credential email sending is disabled. Configure EMPLOYEE_EMAIL_USER/EMPLOYEE_EMAIL_PASS (or EMAIL_USER/EMAIL_PASS, SMTP_USER/APP_PASSWORD).",
					);
				} else {
					const emailResult = await sendCredentialsEmailWithRetry({
						to: credentialsForEmail.email,
						employeeId: employee.employeeId,
						email: credentialsForEmail.email,
						userName: credentialsForEmail.userName,
						password: credentialsForEmail.password,
						fullName: personName,
					});

					if (emailResult.sent) {
						summary.credentialsEmailSent += 1;
						emailSatisfied = true;
						reportProgress("email", "credentials email sent");
					} else {
						summary.credentialsEmailFailed += 1;
						addFailure(
							item,
							"email",
							"EMAIL_SEND_FAILED",
							emailResult.reason || "Failed to send credentials email",
						);
					}
				}
			}

			if (strictMode && !(authSatisfied && emailSatisfied)) {
				if (!failureIndexByEmployeeId.has(item.employeeId)) {
					addFailure(
						item,
						"auth",
						"AUTH_LINK_FAILED",
						"Strict mode failed: account provisioning and credentials email are required.",
					);
				}
				return;
			}

			// Stage: Metadata patch
			if (linkedUserId) {
				try {
					await helpers.syncUserMetadataFromEmployee(linkedUserId, employee.id, mockReq);
					summary.metadataPatched += 1;
					reportProgress("metadata", "user metadata synced from employee source of truth");
				} catch (metadataError: any) {
					addWarning(
						warnings,
						item.employeeId,
						"metadata",
						`Failed metadata sync: ${metadataError?.message || String(metadataError)}`,
						item.sourceRow,
					);
				}
			}

			// Stage: Device metadata
			if (linkedUserId && employee.deviceEmpId) {
				try {
					if (config.idpEnabled) {
						if (!params.authToken) {
							throw new Error("Missing auth token for IDP device metadata patch");
						}
						await updateDeviceMetadata({
							authToken: params.authToken,
							userId: linkedUserId,
							deviceEmpId: employee.deviceEmpId,
						});
					} else {
						const localUser = await params.prisma.user.findUnique({
							where: { id: linkedUserId },
							select: { metadata: true },
						});
						const existingMetadata =
							(localUser?.metadata as Record<string, any> | null) || {};
						const existingDevice = (existingMetadata.device || {}) as Record<string, any>;
						await helpers.updateUserAccount(
							linkedUserId,
							{
								metadata: {
									...existingMetadata,
									device: {
										...existingDevice,
										access: {
											empId: employee.deviceEmpId,
											status: "enrolled",
										},
									},
								},
							},
							mockReq,
						);
					}
				} catch (deviceError: any) {
					addWarning(
						warnings,
						item.employeeId,
						"device",
						`Failed device metadata sync: ${deviceError?.message || String(deviceError)}`,
						item.sourceRow,
					);
				}
			}

			// Stage: Calendar (birthday)
			try {
				const createdBirthday = await upsertBirthdayCalendarItem({
					prisma: params.prisma,
					employeeId: employee.id,
					organizationId: params.organizationId,
					dateOfBirth: personInfo.dateOfBirth as Date | string | null | undefined,
					personName,
				});
				if (createdBirthday) {
					summary.calendarUpserted += 1;
					reportProgress("calendar", "birthday CalendarItem upserted");
				}
			} catch (calendarError: any) {
				addWarning(
					warnings,
					item.employeeId,
					"calendar",
					`Failed birthday calendar upsert: ${calendarError?.message || String(calendarError)}`,
					item.sourceRow,
				);
			}

			// Stage: Boarding process/checklist
			if (params.enableOnboardingReconciliation === true) {
				try {
					const reconciliation = await reconcileEmployeeOnboardingState({
						prisma: params.prisma,
						organizationId: params.organizationId,
						employeeId: employee.id,
						targetDate: employee.employmentHireDate || new Date(),
						departmentId: employee.departmentId,
						role: employee.role,
					});
					if (reconciliation?.processId) {
						summary.boardingCreated += 1;
						reportProgress("boarding", "onboarding checklist reconciliation completed");
					}
				} catch (boardingError: any) {
					addWarning(
						warnings,
						item.employeeId,
						"boarding",
						`Failed boarding setup: ${boardingError?.message || String(boardingError)}`,
						item.sourceRow,
					);
				}
			}

			// Stage: Attendance obligations
			if (params.enableAttendanceObligationRefresh !== false) {
				try {
					const results = await backfillOpenPayrollPeriodAttendanceObligations(params.prisma, {
						organizationId: params.organizationId,
						employeeId: employee.id,
					});
					const touchedObligations = results.reduce(
						(total, result: any) => total + Number(result?.touched || 0),
						0,
					);
					summary.attendanceObligationsRefreshed += touchedObligations;
					const timesheet = await ensureCurrentPayrollPeriodDraftTimesheet(params.prisma, {
						organizationId: params.organizationId,
						employeeId: employee.id,
						date: employee.employmentStartDate || employee.employmentHireDate || new Date(),
					});
					if (timesheet?.id) {
						summary.draftTimesheetsEnsured += 1;
					}
					reportProgress(
						"attendance",
						`${touchedObligations.toLocaleString()} open-period AttendanceObligation rows refreshed; current draft timesheet ${timesheet?.id ? "ready" : "not applicable"}`,
					);
				} catch (attendanceError: any) {
					addWarning(
						warnings,
						item.employeeId,
						"attendance",
						`Failed attendance obligation refresh: ${attendanceError?.message || String(attendanceError)}`,
						item.sourceRow,
					);
				}
			} else {
				reportProgress(
					"attendance",
					"AttendanceObligation refresh deferred to DM3 batch repair",
				);
			}

			// Stage: Logging
			try {
				helpers.logEmployeeCreation(mockReq, employee);
			} catch (logError: any) {
				addWarning(
					warnings,
					item.employeeId,
					"logging",
					`Failed activity/audit logging: ${logError?.message || String(logError)}`,
					item.sourceRow,
				);
			}
		} catch (error: any) {
			if (strictMode) {
				addFailure(
					item,
					"auth",
					"AUTH_LINK_FAILED",
					`Unexpected post-action error: ${error?.message || String(error)}`,
				);
			} else {
				addWarning(
					warnings,
					item.employeeId,
					"auth",
					`Unexpected post-action error: ${error?.message || String(error)}`,
					item.sourceRow,
				);
			}
		} finally {
			summary.completed += 1;
		}
	};

	for (let i = 0; i < params.createdEmployees.length; i += concurrency) {
		const chunk = params.createdEmployees.slice(i, i + concurrency);
		await Promise.all(chunk.map((item) => processEmployee(item)));
	}

	// One batch-level cache invalidation after all post actions.
	try {
		await invalidateCache.byPattern("cache:employee:list:*");
		await invalidateCache.byPattern("cache:schedule:list:*");
	} catch (cacheError: any) {
		addWarning(
			warnings,
			"*",
			"cache",
			`Failed batch cache invalidation: ${cacheError?.message || String(cacheError)}`,
		);
	}

	summary.warningsCount = warnings.length;
	summary.strictRowsFailed = failures.length;
	return { summary, warnings, failures, credentialExports };
};
