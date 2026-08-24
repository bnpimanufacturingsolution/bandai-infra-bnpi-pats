import { getErrorMessage } from "~/lib/utils/error-formatter";
import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type { CreateEmployeeWithAccountRequest } from "./types/api.types";
// Re-export types so consumers can import from "~/services/employees.service"
export type { CreateEmployeeWithAccountRequest } from "./types/api.types";
// Define Employee interface to match API response structure
export interface Employee {
	id: string;
	organizationId: string;
	employeeId: string;
	personId: string;
	userId: string;
	user?: {
		id?: string;
		email?: string;
		userName?: string;
		avatar?: string;
		status?: string;
		loginMethod?: string;
		roleId?: string;
		organizationId?: string;
		metadata?: Record<string, unknown>;
	};
	employmentHireDate: string;
	employmentStartDate?: string;
	employmentTerminationDate?: string;
	employmentStatus:
		| "ACTIVE"
		| "INACTIVE"
		| "TERMINATED"
		| "RESIGNED"
		| "RETIRED"
		| "ON_LEAVE"
		| "ONBOARDING"
		| "OFFBOARDING";
	employmentType:
		| "REGULAR"
		| "PROBATIONARY"
		| "CONTRACTUAL"
		| "PART_TIME"
		| "CONSULTANT"
		| "INTERN";
	probationEndDate?: string;
	leaveBalances?: Array<{
		leaveType: string;
		totalEntitled: number;
		used: number;
		pending: number;
		available: number;
		carriedOver: number | null;
		maxCarryOver: number | null;
		periodStart: string;
		periodEnd: string;
	}>;
	departmentId: string;
	sectionId?: string | null;
	positionId: string;
	levelId?: string | null;
	deviceEmpId?: string | null;
	deviceId?: string | null;
	reportToId?: string | null;
	defaultScheduleId?: string;
	workLocation: "ONSITE" | "REMOTE" | "HYBRID";
	workforceSource?: "DIRECT" | "AGENCY";
	agencyId?: string | null;
	agency?: {
		id: string;
		name: string;
		code?: string | null;
	} | null;
	basicSalary: number;
	currency: string;
	payFrequency:
		| "DAILY"
		| "WEEKLY"
		| "SEMI_MONTHLY"
		| "BIWEEKLY"
		| "MONTHLY"
		| "QUARTERLY"
		| "ANNUALLY";
	isDeleted: boolean;
	isTour: boolean;
	isManager?: boolean;
	isHrManager?: boolean;
	createdAt: string;
	updatedAt: string;
	role?: string;
	metadata?: any;
	// Optional related documents
	department?: {
		id: string;
		organizationId: string;
		name: string;
		code: string;
		description?: string;
		managerId: string;
		parentId?: string;
		isActive: boolean;
		isDefault: boolean;
		isDeleted: boolean;
		createdAt: string;
		updatedAt: string;
	};
	section?: {
		id: string;
		name: string;
		code?: string;
		departmentId?: string | null;
	} | null;
	position?: {
		id: string;
		organizationId: string;
		title: string;
		code: string;
		description?: string;
		departmentId: string;
		minSalary?: number;
		maxSalary?: number;
		isActive: boolean;
		isDeleted: boolean;
		isOffer?: boolean;
		createdAt: string;
		updatedAt: string;
	};
	level?: {
		id: string;
		name: string;
		rank?: number;
		description?: string;
		isManager?: boolean | string | null;
	};
	activeSchedule?: {
		scheduleCode: string;
		scheduleName: string;
		startDate: string;
		endDate?: string | null;
		gracePeriodMinutes?: number;
		shifts: Array<{
			label: string;
			isRestDay?: boolean;
			timeSlots: Array<{
				type: "work" | "break" | "other";
				label?: string;
				startTime: string;
				endTime: string;
			}>;
		}>;
	};
	embeddedSchedule?: {
		templateId?: string | null;
		templateCode?: string | null;
		templateName?: string | null;
		cycleDays: number;
		graceLateMinutes?: number | null;
		graceEarlyOutMinutes?: number | null;
		pattern: Array<{
			day: number;
			shiftTypeId?: string | null;
			shiftSnapshot?: {
				name?: string | null;
				code?: string | null;
				description?: string | null;
				startTime?: string | null;
				endTime?: string | null;
				breakMinutes?: number | null;
				graceLateMinutes?: number | null;
				graceEarlyOutMinutes?: number | null;
				isOvernight?: boolean;
				isOff?: boolean;
				timeSlots?: Array<{
					type: string;
					label?: string | null;
					startTime: string;
					endTime: string;
				}>;
			} | null;
		}>;
		effectiveStartDate?: string | null;
		assignedAt?: string | null;
		assignedByEmployeeId?: string | null;
		reason?: string | null;
		version?: number | null;
	};
	// Canonical read-path schedule timeline (embedded-schedule derived).
	schedules?: EmployeeScheduleAssignment[];
	documents: Array<{
		id?: string;
		documentId?: string | null;
		name?: string;
		type: string;
		documentTypeId?: string | null;
		documentType?: {
			id: string;
			code: string;
			name: string;
		} | null;
		number?: string;
		issueDate?: string;
		expiryDate?: string;
		fileUrl?: string;
		ext?: string;
		fieldValues?: Record<string, unknown> | null;
		metadata?: Record<string, unknown> | null;
	}>;
	boardingProcesses?: Array<{
		id: string;
		type: "ONBOARDING" | "OFFBOARDING";
		status: string;
		isShow?: boolean;
		checklistItems: Array<any>; // Define stricter type if avail
	}>;
	person: {
		personalInfo: {
			prefix?: string;
			firstName: string;
			middleName?: string;
			lastName: string;
			dateOfBirth: string;
			placeOfBirth?: string;
			age?: number;
			nationality?: string;
			primaryLanguage?: string;
			gender?:
				| "male"
				| "female"
				| "other"
				| "prefer_not_to_say"
				| "unknown"
				| "not_applicable";
			currency?: string;
			vipCode?: string;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: "mobile" | "home" | "work" | "emergency" | "fax" | "pager" | "main" | "other";
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			fax?: string;
			address: Array<{
				street: string;
				address2?: string;
				city: string;
				state: string;
				country: string;
				postalCode: string;
				zipCode: string;
				houseNumber: string;
				emergencyContactName?: string;
			}>;
		};
		identification: {
			type:
				| "passport"
				| "drivers_license"
				| "national_id"
				| "postal_id"
				| "voters_id"
				| "senior_citizen_id"
				| "company_id"
				| "school_id";
			number: string;
			issuingCountry: string;
			expiryDate: string;
		};
		metadata?: any;
		id: string;
		organizationId: string;
		createdAt: string;
		updatedAt: string;
		isDeleted: boolean;
	};
}

export interface EmployeeScheduleAssignment {
	id: string;
	organizationId?: string;
	employeeId?: string;
	scheduleTemplateId?: string;
	startDate: string;
	endDate?: string | null;
	createdByEmployeeId?: string | null;
	departmentId?: string | null;
	createdAt?: string;
	updatedAt?: string;
	scheduleTemplate?: {
		id: string;
		name: string;
		code: string;
		cycleDays?: number;
		pattern?: Array<{
			day: number;
			shiftTypeId: string;
		}>;
	} | null;
}

export interface EmployeeScheduleEntry {
	id: string;
	scheduleCode: string;
	scheduleName: string;
	resolvedSchedule?: {
		scheduleId?: string | null;
		code: string;
		name: string;
		shifts: Array<{
			label: string;
			isRestDay?: boolean;
			timeSlots: Array<{
				type: "work" | "break" | "other" | string;
				label?: string;
				startTime: string;
				endTime: string;
			}>;
		}>;
		gracePeriodMinutes: number;
		source?: string | null;
	};
	shifts?: Array<{
		label: string;
		isRestDay?: boolean;
		timeSlots: Array<{
			type: "work" | "break" | "other" | string;
			label?: string;
			startTime: string;
			endTime: string;
		}>;
	}>;
	gracePeriodMinutes?: number;
	startDate: string;
	effectiveDate: string;
	endDate?: string | null;
	status: "SCHEDULED" | "ACTIVE" | "SUPERSEDED" | "CANCELLED";
	reason?: string | null;
	changedByEmployeeId?: string | null;
	changedBy?: {
		employeeId?: string;
		name?: string;
	} | null;
	summary?: {
		previous?: {
			scheduleCode: string;
			scheduleName: string;
		} | null;
		current: {
			scheduleCode: string;
			scheduleName: string;
		};
	};
}

export interface SetActiveEmployeeScheduleRequest {
	scheduleCode: string;
	startDate?: string;
	endDate?: string | null;
	reason?: string;
}

export interface EmployeeSchedulesResponse {
	employeeId: string;
	activeSchedule?: Employee["activeSchedule"] | null;
	schedules: EmployeeScheduleEntry[];
}

export interface TeamScheduleCalendarItem {
	scheduleEntryId: string;
	employeeId: string;
	employeeCode?: string | null;
	employeeName: string;
	departmentId?: string | null;
	managerId?: string | null;
	scheduleCode: string;
	scheduleName: string;
	startDate: string;
	effectiveDate: string;
	endDate?: string | null;
	status: "SCHEDULED" | "ACTIVE" | "SUPERSEDED" | "CANCELLED";
}

export interface TeamScheduleCalendarResponse {
	from: string;
	to: string;
	scope: {
		departmentId?: string | null;
		roleScope: "department" | "organization";
	};
	managedDepartments?: Array<{
		id: string;
		name: string;
		code: string;
		canManage: boolean;
	}>;
	allowedSchedules: Array<{
		id: string;
		code: string;
		name: string;
		source: "department_default" | "department_head_created" | "department_head_linked";
		collectionId?: string;
		isActive?: boolean;
	}>;
	items: TeamScheduleCalendarItem[];
}

export interface TeamScheduleCalendarGridCell {
	date: string;
	scheduleEntryId?: string | null;
	status: "SCHEDULED" | "ACTIVE" | "SUPERSEDED" | "CANCELLED" | "UNASSIGNED";
	scheduleId?: string | null;
	scheduleCode?: string | null;
	scheduleName?: string | null;
	gracePeriodMinutes: number;
	shift?: {
		label: string;
		isRestDay?: boolean;
		timeSlots?: Array<{
			type: string;
			label?: string;
			startTime: string;
			endTime: string;
		}>;
	} | null;
	timeSlots: Array<{
		type: string;
		label?: string;
		startTime: string;
		endTime: string;
	}>;
	isRestDay: boolean;
	profilePath?: string | null;
	startDate?: string | null;
	effectiveDate?: string | null;
	endDate?: string | null;
	snapshotSource?: string | null;
}

export interface TeamScheduleCalendarGridRow {
	employeeId: string;
	employeeCode?: string | null;
	employeeName: string;
	profilePath?: string | null;
	departmentId?: string | null;
	departmentName?: string | null;
	departmentCode?: string | null;
	managerId?: string | null;
	scheduleEntries?: Array<{
		scheduleEntryId: string;
		scheduleId?: string | null;
		scheduleCode: string;
		scheduleName: string;
		startDate: string;
		endDate?: string | null;
		status: "SCHEDULED" | "ACTIVE" | "SUPERSEDED" | "CANCELLED";
	}>;
	cells: TeamScheduleCalendarGridCell[];
}

export interface TeamScheduleCalendarGridResponse {
	from: string;
	to: string;
	dates: string[];
	scope: {
		departmentId?: string | null;
		roleScope: "department" | "organization";
	};
	managedDepartments?: Array<{
		id: string;
		name: string;
		code: string;
		canManage: boolean;
	}>;
	scheduleSummaries?: Array<{
		scheduleId?: string | null;
		scheduleCode: string;
		scheduleName: string;
		startDate?: string | null;
		endDate?: string | null;
		source?: string | null;
		departmentId?: string | null;
		departmentName?: string | null;
		employeeCount: number;
		scheduleEntryCount: number;
		requiredHeadcount?: number | null;
		rotationConfig?: {
			cycleLength: number;
			repeats?: boolean;
			pattern: Array<{
				dayIndex: number;
				scheduleCode?: string;
				isOff?: boolean;
			}>;
		} | null;
	}>;
	coverageHeatmap?: Array<{
		date: string;
		scheduleCode: string;
		scheduleName: string;
		required: number;
		assigned: number;
		delta: number;
		status: "UNDERSTAFFED" | "FULLY_STAFFED" | "OVERSTAFFED";
	}>;
	stats?: {
		totalEmployees: number;
		coveragePercent: number;
		understaffedDays: number;
		openSlots: number;
	};
	actionNeeded?: {
		understaffedDates: Array<{ date: string; scheduleCode: string; missing: number }>;
		consecutiveWorkDaysExceeded: Array<{
			employeeId: string;
			employeeName: string;
			consecutiveDays: number;
			limit: number;
		}>;
		emptyShifts: Array<{ date: string; scheduleCode: string; scheduleName: string }>;
	};
	rows: TeamScheduleCalendarGridRow[];
}

export interface DepartmentScheduleCollectionItem {
	id: string;
	code: string;
	name: string;
	description?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	shifts?: Array<{
		label: string;
		isRestDay?: boolean;
		timeSlots?: Array<{
			type: string;
			label?: string;
			startTime: string;
			endTime: string;
		}>;
	}>;
	gracePeriodMinutes?: number;
	totalHours?: number | null;
	requiredHeadcount?: number | null;
	rotationConfig?: {
		cycleLength: number;
		repeats?: boolean;
		pattern: Array<{
			dayIndex: number;
			scheduleCode?: string;
			isOff?: boolean;
		}>;
	} | null;
	source: "department_default" | "department_head_created" | "department_head_linked";
	collectionId?: string;
	isActive?: boolean;
}

export interface TeamScheduleCollectionDepartment {
	id: string;
	name: string;
	code: string;
	canManage: boolean;
	schedules: DepartmentScheduleCollectionItem[];
}

export interface TeamScheduleCollectionsResponse {
	departments: TeamScheduleCollectionDepartment[];
	canManageAny: boolean;
}

export interface TeamScheduleTemplatePayload {
	departmentId: string;
	name: string;
	code: string;
	description?: string | null;
	startDate: string;
	endDate: string;
	shifts: Array<{
		label: string;
		isRestDay?: boolean;
		timeSlots?: Array<{
			type: string;
			label?: string;
			startTime: string;
			endTime: string;
		}>;
	}>;
	gracePeriodMinutes?: number;
	totalHours?: number | null;
	requiredHeadcount?: number | null;
	rotationConfig?: {
		cycleLength: number;
		repeats?: boolean;
		pattern: Array<{
			dayIndex: number;
			scheduleCode?: string;
			isOff?: boolean;
		}>;
	} | null;
}

export interface ApplyTeamRotationPayload {
	departmentId: string;
	rotationTemplateCode: string;
	employeeIds: string[];
	startDate: string;
	endDate: string;
}

export interface TeamScheduleOverridePayload {
	departmentId: string;
	targetScheduleCode?: string | null;
	overrides: Array<{
		employeeId: string;
		date: string;
		scheduleCode?: string | null;
		isOff?: boolean;
	}>;
}

// Use central type defined in ./types/api.types

export interface CreateEmployeeRequest {
	firstName: string;
	lastName: string;
	email: string;
	phone?: string;
	departmentId?: string;
	positionId?: string;
	employmentHireDate?: string;
	salary?: number;
	status?: "active" | "inactive" | "terminated";
	personalInfo?: {
		dateOfBirth?: string;
		address?: string;
		emergencyContact?: {
			name: string;
			phone: string;
			relationship: string;
		};
	};
}

export interface UpdateEmployeeRequest {
	[key: string]: any;
	firstName?: string;
	lastName?: string;
	email?: string;
	phone?: string;
	departmentId?: string;
	positionId?: string;
	employmentHireDate?: string;
	salary?: number;
	status?: "active" | "inactive" | "terminated";
	isTour?: boolean;
	personalInfo?: {
		dateOfBirth?: string;
		address?: string;
		emergencyContact?: {
			name: string;
			phone: string;
			relationship: string;
		};
	};
	metadata?: any;
	person?: any;
	user?: any;
	employee?: any;
	avatar?: File | null;
	avatarFile?: File | null;
	files?: Record<string, File | null | undefined>;
}

export type EmployeeDocumentPayload = Employee["documents"][number];

export interface UpdateEmployeeDocumentsRequest {
	documents: EmployeeDocumentPayload[];
	files?: Record<string, File | null | undefined>;
}

export interface EmployeeDocumentActor {
	id: string;
	employeeId: string;
	person?: {
		personalInfo?: {
			firstName?: string;
			middleName?: string;
			lastName?: string;
		};
	};
	department?: { id: string; name: string; code?: string | null };
	position?: { id: string; title: string; code?: string | null };
}

export interface EmployeeDocumentApprovalRecord {
	id: string;
	name: string;
	type: string;
	number?: string | null;
	issueDate?: string | null;
	expiryDate?: string | null;
	fileUrl?: string | null;
	ext?: string | null;
	reviewStatus?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | null;
	reviewSubmittedAt?: string | null;
	reviewSubmittedById?: string | null;
	reviewApprovedAt?: string | null;
	reviewApprovedById?: string | null;
	reviewRejectedAt?: string | null;
	reviewRejectedById?: string | null;
	reviewRejectionReason?: string | null;
	reviewSource?: string | null;
	createdAt?: string;
	updatedAt?: string;
	employee: EmployeeDocumentActor;
	documentType?: {
		id: string;
		code?: string | null;
		name: string;
		metadata?: Record<string, unknown> | null;
	} | null;
}

export interface EmployeeDocumentReviewEvent {
	id: string;
	organizationId: string;
	documentId: string;
	employeeId: string;
	actorEmployeeId?: string | null;
	eventType:
		| "SUBMITTED"
		| "APPROVED"
		| "REJECTED"
		| "RESUBMITTED"
		| "SUPERSEDED"
		| "SYSTEM_SYNCED";
	fromStatus?: string | null;
	toStatus?: string | null;
	reason?: string | null;
	comments?: string | null;
	source: string;
	fileUrl?: string | null;
	fieldChanges?: Record<string, unknown> | null;
	occurredAt: string;
	createdAt: string;
	document?: EmployeeDocumentApprovalRecord;
}

export interface EmployeeDocumentListResponse<T> {
	documents?: T[];
	events?: T[];
	actors?: Record<string, EmployeeDocumentActor>;
	count: number;
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}

export type EmployeeDocumentPriorityState =
	| "missing_required"
	| "rejected"
	| "pending_approval"
	| "expired"
	| "needs_update"
	| "ready"
	| "optional";
export type EmployeeDocumentPriorityLevel = "high" | "medium" | "low";

export interface EmployeeDocumentPriorityItem {
	key: string;
	type: string;
	documentTypeId?: string | null;
	category?: string | null;
	displayName: string;
	name?: string | null;
	number?: string | null;
	issueDate?: string | null;
	expiryDate?: string | null;
	fileUrl?: string | null;
	ext?: string | null;
	documentId?: string | null;
	priorityState: EmployeeDocumentPriorityState;
	actionLabel?: "Upload" | "Fill up" | "Update" | null;
	actionDescription?: string | null;
	isActionable: boolean;
	isVirtual: boolean;
	isExpired: boolean;
	priorityLevel?: EmployeeDocumentPriorityLevel;
	isMandated?: boolean;
	requiredForPayroll?: boolean;
	requiredForOnboarding?: boolean;
	requireFileForCompliance?: boolean;
}

export interface EmployeeDocumentPriorityResponse {
	summary: {
		totalActionable: number;
		missingRequired: number;
		rejected: number;
		expired: number;
		needsUpdate: number;
		ready: number;
		optional: number;
	};
	categories: Array<{
		key: string;
		label: string;
		total: number;
		missingRequired: number;
		rejected: number;
		expired: number;
		needsUpdate: number;
		optional: number;
	}>;
	items: EmployeeDocumentPriorityItem[];
}

// Employee Attendance Types
export interface EmployeeAttendanceRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	date: string;
	timeIn?: string;
	timeOut?: string;
	status:
		| "PRESENT"
		| "ABSENT"
		| "NOT_CLOCKED_IN"
		| "LATE"
		| "HALF_DAY"
		| "REST_DAY"
		| "LEAVE"
		| "HOLIDAY"
		| "ON_LEAVE";
	leaveType?: string | null;
	leaveEntries?: Array<{
		requestId?: string;
		leaveType: string;
		label: string;
		durationUnit?: string;
		halfDaySession?: string;
		startDate?: string;
		endDate?: string;
	}>;
	holidayEntries?: Array<{
		calendarItemId: string;
		title: string;
		startDate: string;
		endDate: string;
		tags?: string[];
	}>;
	primaryMarker?: "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";
	timeInLocation?: {
		lat: number;
		lng: number;
	};
	timeOutLocation?: {
		lat: number;
		lng: number;
	};
	deviceInfo?: any;
	isManualEntry: boolean;
	approvedBy?: string;
	notes?: string;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	isPreStart?: boolean;
	effectiveStartDate?: string | null;
	employmentStartDate?: string | null;
	employmentHireDate?: string | null;
	metadata?: {
		rawLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		withinGrace?: boolean | null;
		[key: string]: unknown;
	};
	scheduleSnapshot?: {
		isOvernight?: boolean | null;
		startTime?: string | null;
		endTime?: string | null;
		timeSlots?: Array<{
			type: string;
			label?: string;
			startTime: string;
			endTime: string;
		}>;
	} | null;
	nightShift?: {
		isNightShiftDay: boolean;
		scheduledWindow?: {
			startTime: string;
			endTime: string;
			isOvernight: boolean;
		};
		actualNightHours?: string;
	} | null;
	employee?: {
		id: string;
		employeeId: string;
		personId: string;
	};
}

export interface EmployeeAttendanceResponse {
	attendances: EmployeeAttendanceRecord[];
	employment?: {
		employmentHireDate?: string | null;
		employmentStartDate?: string | null;
		effectiveStartDate?: string | null;
		isPreStartToday?: boolean;
	};
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface EmployeeAttendanceQueryParams extends ApiQueryParams {
	dateFrom?: string;
	dateTo?: string;
}

export interface DebugAttendanceResetResult {
	businessDate: string;
	attendanceDeleted: number;
	attendanceObligationsDeleted: number;
}

export interface MarkAttendanceRequest {
	date?: string;
	timeIn?: string;
	timeOut?: string;
	status?: string;
	location?: {
		lat: number;
		lng: number;
	};
	notes?: string;
}

export interface UpdateAttendanceRequest {
	timeIn?: string;
	timeOut?: string;
	status?: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY";
	location?: {
		lat: number;
		lng: number;
	};
	notes?: string;
}

const MANILA_TIME_ZONE = "Asia/Manila";

export const getManilaAttendanceDateKey = (value: Date = new Date()) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: MANILA_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(value);
	const valueFor = (type: string) => parts.find((part) => part.type === type)?.value || "";
	return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
};

// Employee Managed Departments Types
export interface ManagedDepartment {
	id: string;
	organizationId: string;
	name: string;
	code: string;
	description?: string;
	managerId: string;
	parentId?: string;
	isActive: boolean;
	isDefault: boolean;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	employeeCount?: number;
	employees?: Array<{
		id: string;
		employeeId: string;
		employmentStatus: string;
		person: {
			personalInfo: {
				firstName: string;
				lastName: string;
				middleName?: string;
			};
		};
	}>;
	positions?: Array<{
		id: string;
		title: string;
		code: string;
		description?: string;
		minSalary?: number;
		maxSalary?: number;
	}>;
	manager?: {
		id: string;
		employeeId: string;
		person: {
			personalInfo: {
				firstName: string;
				lastName: string;
				middleName?: string;
			};
		};
	};
	parent?: {
		id: string;
		name: string;
		code: string;
		description?: string;
	};
	children?: Array<{
		id: string;
		name: string;
		code: string;
		description?: string;
		isActive: boolean;
	}>;
}

export interface MigrationExtractedValueEntry {
	value: string;
	count: number;
}

export type MigrationTransformFieldKey =
	| "EMP_ID"
	| "NAME"
	| "DEPARTMENT"
	| "POSITION"
	| "LEVEL"
	| "SCHEDULE"
	| "REPORT_TO_EMP_ID";

export interface MigrationSheetColumnSummary {
	header: string;
	nonEmptyCount: number;
	sampleValues: string[];
}

export interface MigrationSplitRule {
	targetField: MigrationTransformFieldKey;
	sourceColumn: string;
	delimiter: string;
	segmentIndex: number;
}

export interface MigrationSheetExtraction {
	sheetName: string;
	rowCount: number;
	headers: string[];
	columns: MigrationSheetColumnSummary[];
	sampleRows: Record<string, any>[];
	previewRows: Record<string, any>[];
	normalizedRows: Record<string, any>[];
	detectedColumns: Partial<
		Record<
			"employeeId" | "name" | "department" | "position" | "level" | "schedule" | "reportTo",
			string
		>
	>;
	extractedValues: {
		departments: MigrationExtractedValueEntry[];
		positions: MigrationExtractedValueEntry[];
		levels: MigrationExtractedValueEntry[];
		schedules: MigrationExtractedValueEntry[];
		reportTo: MigrationExtractedValueEntry[];
	};
	stats: {
		blankCounts: Partial<
			Record<
				| "employeeId"
				| "name"
				| "department"
				| "position"
				| "level"
				| "schedule"
				| "reportTo",
				number
			>
		>;
		duplicateCounts: Partial<
			Record<
				| "employeeId"
				| "name"
				| "department"
				| "position"
				| "level"
				| "schedule"
				| "reportTo",
				number
			>
		>;
	};
}

export interface MigrationTransformResponse {
	fileName: string;
	sheetName: string;
	headers: MigrationTransformFieldKey[];
	rowCount: number;
	populatedRowCount: number;
	previewRows: Record<string, string>[];
	normalizedRows: Record<string, string>[];
	fieldMapping: Partial<Record<MigrationTransformFieldKey, string>>;
	splitRules: MigrationSplitRule[];
}

export interface MigrationExtractedFile {
	fileName: string;
	mimeType: string;
	size: number;
	sheets: MigrationSheetExtraction[];
}

export interface MigrationExtractorResponse {
	files: MigrationExtractedFile[];
	merged: {
		departments: MigrationExtractedValueEntry[];
		positions: MigrationExtractedValueEntry[];
		levels: MigrationExtractedValueEntry[];
		schedules: MigrationExtractedValueEntry[];
	};
}

export interface ManagedDepartmentsResponse {
	departments: ManagedDepartment[];
	count?: number;
}

export interface EmployeesResponse {
	employees: Employee[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
	// Legacy support for nested data structure
	data?:
		| Employee[]
		| {
				employees: Employee[];
				count?: number;
				pagination?: {
					total: number;
					page: number;
					limit: number;
					totalPages?: number;
					hasNext?: boolean;
					hasPrev?: boolean;
				};
		  };
}

export interface EligibilityCandidate {
	employeeId: string;
	employeeName: string;
	avatar?: string | null;
	department: string;
	position: string;
	currentEmploymentStatus: string;
	hireDate: string;
	tenureMonths: number;
	eligibleFor: "PROMOTION" | "REGULARIZATION" | "TERMINATION" | "TRANSFER";
	eligibilityReason: string;
	matchScore: number;
	id: string;
	metrics?: {
		attendanceRate: number;
		presentDays: number;
		absentDays: number;
		leaveDays: number;
		totalWorkingDays: number;
		lates: number;
		records?: Array<{
			date: string;
			status: string;
			type: "ACTUAL" | "VIRTUAL";
		}>;
	};
}

export interface EmployeeEligibilityResponse {
	metrics: {
		total: number;
		termination: number;
		promotion: number;
		regularization: number;
		transfer: number;
	};
	filters: {
		eligibleFor: string | null;
		department: string | null;
		position: string | null;
		employmentStatus: string;
		dateRange: {
			from: string | null;
			to: string | null;
		};
		minTenure: number | null;
		maxTenure: number | null;
		minAttendanceRate: number | null;
		maxAttendanceRate: number | null;
	};
	pagination: {
		page: number;
		limit: number;
		totalRecords: number;
		totalPages: number;
	};
	data: EligibilityCandidate[];
}

export interface ReserveEmployeeIdResponse {
	employeeId: string;
	sequence?: number;
	organizationId?: string;
	source?: string;
}

export const ORG_REPORTING_CONTRACT = {
	fields: "id",
	countOnly: {
		page: 1,
		limit: 1,
		document: "false",
		pagination: "false",
		count: "true",
	},
	filters: {
		withoutImmediateSupervisor: "reportToId:null",
		withDirectReports: "directReports:exists",
	},
} as const;

export type OrganizationReportingCountKey =
	| "totalEmployees"
	| "withDirectReports"
	| "withoutImmediateSupervisor";

export interface OrganizationReportingCountsResponse {
	totalEmployees: number;
	withDirectReports: number;
	withoutImmediateSupervisor: number;
}

const extractEmployeeCount = (response: EmployeesResponse): number => {
	const nestedData = !Array.isArray(response.data) ? response.data : undefined;
	return Number(response.count ?? nestedData?.count ?? response.pagination?.total ?? 0) || 0;
};

export const buildOrganizationReportingDeepLink = (
	key: OrganizationReportingCountKey,
	params?: { departmentId?: string | null },
) => {
	const query = new URLSearchParams();
	const departmentId = String(params?.departmentId || "").trim();

	if (key === "withoutImmediateSupervisor") {
		query.set("view", "list");
		query.set("filter", ORG_REPORTING_CONTRACT.filters.withoutImmediateSupervisor);
		if (departmentId && departmentId !== "all") {
			query.set("departmentId", departmentId);
		}
		return `/hr/employees?${query.toString()}`;
	}

	if (key === "withDirectReports") {
		query.set("view", "list");
		query.set("filter", ORG_REPORTING_CONTRACT.filters.withDirectReports);
		if (departmentId && departmentId !== "all") {
			query.set("departmentId", departmentId);
		}
		return `/hr/employees?${query.toString()}`;
	}

	query.set("view", "organization");
	if (departmentId && departmentId !== "all") {
		query.set("departmentId", departmentId);
	}
	return `/hr/employees?${query.toString()}`;
};

const normalizeEmployeePayload = (payload: Employee): Employee => {
	const schedules = Array.isArray((payload as any)?.schedules)
		? ((payload as any).schedules as EmployeeScheduleAssignment[])
		: [];
	const documents = Array.isArray((payload as any)?.documents)
		? ((payload as any).documents as Employee["documents"]).map((document) => ({
				...document,
				documentId:
					String((document as any).documentId || "").trim() ||
					String((document as any).id || "").trim() ||
					null,
			}))
		: (payload as any)?.documents;
	return {
		...payload,
		documents,
		schedules,
	};
};

class EmployeesService extends APIService {
	async getFilterUsers() {
		try {
			const response = await hrisApiClient.get("/api/employee/by-role");
			if (!response.data) {
				throw new Error("Failed to fetch users");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching hr user & manager:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching hr user & manager",
			);
		}
	}
	/**
	 * Get all employees with optional filtering, pagination, and sorting
	 * @returns Promise<EmployeesResponse> - Employees response with pagination
	 */
	async getEmployees(
		document: boolean = false,
		count: boolean = true,
	): Promise<EmployeesResponse> {
		try {
			// Set the auth token for HRIS API client

			// Build query parameters - merge existing with required defaults
			const mergedParams = new URLSearchParams();

			// 1) Start with any existing query params from APIService
			const existingQueryString = this.getQueryString();
			if (existingQueryString) {
				const existingParams = new URLSearchParams(existingQueryString.substring(1));
				existingParams.forEach((value, key) => {
					mergedParams.set(key, value);
				});
			}

			// 2) Apply required defaults only if not already provided
			if (document && !mergedParams.has("document")) {
				mergedParams.set("document", "true");
			}
			if (!mergedParams.has("pagination")) {
				mergedParams.set("pagination", "true");
			}
			if (!mergedParams.has("count")) {
				mergedParams.set("count", count.toString());
			}

			const queryString = mergedParams.toString() ? `?${mergedParams.toString()}` : "";
			const endpoint = `/api/employee${queryString}`;

			console.log("Fetching employees from HRIS API:", endpoint);

			const response = await hrisApiClient.get<EmployeesResponse>(endpoint);
			if (!response.data) {
				throw new Error("Failed to fetch employees");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching employees:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching employees",
			);
		}
	}

	/**
	 * Get employee by ID with optional field selection and query params
	 * @param employeeId MongoDB _id (e.g., "690ac9737c4d2e503d8bab75"), not the employeeId field (e.g., "EMP234")
	 * @param fields Optional fields to select (comma-separated string or array of strings)
	 * @param params Optional query parameters (e.g. filters)
	 * @returns Promise<Employee> - Employee data
	 */
	async getEmployeeById(
		employeeId: string,
		fields?: string | string[],
		params?: ApiQueryParams,
	): Promise<Employee> {
		try {
			// Set the auth token for HRIS API client

			// Clear any existing query params
			this.clearQueryParams();

			// Set fields if provided
			if (fields) {
				this.select(fields);
			}

			// Set additional params if provided
			if (params) {
				this.setParams(params);
			}

			// Ensure document=true is included to get full employee data with user info
			this.document(true);

			const queryString = this.getQueryString();

			// Uses MongoDB _id in the URL path
			const response = await hrisApiClient.get<Employee>(
				`/api/employee/${employeeId}${queryString}`,
			);

			console.log("=== getEmployeeById API Response ===");
			console.log("Full response:", response);
			console.log("response.data:", response.data);

			// Handle nested data structure if API returns { data: { ... } }
			let employeeData = response.data;
			if (employeeData && typeof employeeData === "object" && "data" in employeeData) {
				console.log("Response has nested data structure, unwrapping...");
				employeeData = (employeeData as any).data;
			}

			if (!employeeData) {
				throw new Error("Employee not found");
			}

			console.log("Returning employee data:", employeeData);
			return normalizeEmployeePayload(employeeData as Employee);
		} catch (error: any) {
			console.error("Error fetching employee:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching employee",
			);
		}
	}

	/**
	 * Create a new employee
	 * @param data Employee creation data
	 * @returns Promise<Employee> - Created employee data
	 */
	async createEmployee(data: CreateEmployeeRequest): Promise<Employee> {
		try {
			// Set the auth token for HRIS API client

			const response = await hrisApiClient.post<Employee>("/api/employee", data);
			if (!response.data) {
				throw new Error("Failed to create employee");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating employee:", error);
			const errorMessage = getErrorMessage(error) || "Error creating employee";
			throw new Error(errorMessage);
		}
	}

	async reserveEmployeeId(organizationId: string): Promise<ReserveEmployeeIdResponse> {
		try {
			const response = await hrisApiClient.post<any>("/api/employee/reserve-id", {
				organizationId,
			});
			const payload = response?.data?.data || response?.data;
			if (!payload?.employeeId) {
				throw new Error("Failed to reserve employee ID");
			}
			return payload as ReserveEmployeeIdResponse;
		} catch (error: any) {
			console.error("Error reserving employee ID:", error);
			const errorMessage = getErrorMessage(error) || "Error reserving employee ID";
			throw new Error(errorMessage);
		}
	}

	/**
	 * Create employee with account using HRIS API
	 * @param employeeData Employee data with account creation
	 * @returns Promise<Employee> - Created employee data
	 */
	async createEmployeeWithAccount(
		employeeData: CreateEmployeeWithAccountRequest | any,
	): Promise<Employee> {
		try {
			// Set the auth token for HRIS API client

			console.log("Creating employee with account using HRIS API");
			console.log("Employee data:", employeeData);

			// Check if files are included
			const hasFiles = employeeData.files && Object.keys(employeeData.files).length > 0;

			if (hasFiles) {
				// Build FormData for multipart/form-data submission
				const formData = new FormData();

				// Append files first
				const files = employeeData.files;
				Object.entries(files).forEach(([docType, file]) => {
					if (file) {
						formData.append("documents", file as File);
						// Add metadata to identify which document type this file is for
						formData.append("documentTypes", docType);
					}
				});

				// Remove files from payload before stringifying
				const { files: _, ...payloadWithoutFiles } = employeeData;

				// Append JSON data as a string field
				formData.append("data", JSON.stringify(payloadWithoutFiles));

				console.log("Sending FormData with files");
				const response = await hrisApiClient.post<Employee>("/api/employee", formData);
				if (!response.data) {
					throw new Error("Failed to create employee");
				}
				return response.data;
			} else {
				// Send as regular JSON
				console.log("Sending JSON (no files)");
				console.log("Employee data.user.roleId:", employeeData.user?.roleId);

				const response = await hrisApiClient.post<Employee>("/api/employee", employeeData);
				if (!response.data) {
					throw new Error("Failed to create employee");
				}
				return response.data;
			}
		} catch (error: any) {
			console.error("Error creating employee with account:", error);
			// Preserve structured API error payload (status/message/errors[]) for toast formatters
			if (error && typeof error === "object" && ("status" in error || "errors" in error)) {
				throw error;
			}
			const errorMessage = getErrorMessage(error) || "Error creating employee with account";
			throw {
				message: errorMessage,
			};
		}
	}

	/**
	 * Update an existing employee
	 * @param employeeId Employee ID
	 * @param data Employee update data
	 * @returns Promise<Employee> - Updated employee data
	 */
	async updateEmployee(employeeId: string, data: UpdateEmployeeRequest): Promise<Employee> {
		try {
			const avatarFile =
				data.avatar instanceof File
					? data.avatar
					: data.avatarFile instanceof File
						? data.avatarFile
						: null;
			const documentFiles = data.files || null;
			const hasDocumentFiles = Object.values(documentFiles || {}).some(
				(file) => file instanceof File,
			);

			const response =
				avatarFile || hasDocumentFiles
					? await (() => {
							const formData = new FormData();
							if (avatarFile) {
								formData.append("avatar", avatarFile);
							}
							if (documentFiles) {
								Object.entries(documentFiles).forEach(([documentType, file]) => {
									if (!(file instanceof File)) return;
									formData.append("documents", file);
									formData.append("documentTypes", documentType);
								});
							}

							const {
								avatar: _avatar,
								avatarFile: _avatarFile,
								files: _files,
								...payloadWithoutFiles
							} = data;
							formData.append("data", JSON.stringify(payloadWithoutFiles));
							return hrisApiClient.patchForm<Employee>(
								`/api/employee/${employeeId}`,
								formData,
							);
						})()
					: await hrisApiClient.patch<Employee>(`/api/employee/${employeeId}`, data);
			if (!response.data) {
				throw new Error("Failed to update employee");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating employee:", error);
			const errorMessage = getErrorMessage(error) || "Error updating employee";
			throw new Error(errorMessage);
		}
	}

	async setActiveEmployeeSchedule(
		employeeId: string,
		payload: SetActiveEmployeeScheduleRequest,
	): Promise<{
		entry: EmployeeScheduleEntry;
		activeSchedule?: Employee["activeSchedule"] | null;
		schedules?: EmployeeScheduleEntry[];
	}> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/employee/${employeeId}/schedules/set-active`,
				payload,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error setting active employee schedule:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error setting active employee schedule",
			);
		}
	}

	async getEmployeeSchedules(employeeId: string): Promise<EmployeeSchedulesResponse> {
		try {
			const response = await hrisApiClient.get<any>(`/api/employee/${employeeId}/schedules`);
			return (response.data?.data || response.data) as EmployeeSchedulesResponse;
		} catch (error: any) {
			console.error("Error fetching employee schedules:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee schedules",
			);
		}
	}

	async deactivateEmployeeSchedule(employeeId: string, entryId: string): Promise<any> {
		try {
			const response = await hrisApiClient.patch<any>(
				`/api/employee/${employeeId}/schedules/${entryId}/deactivate`,
				{},
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error deactivating employee schedule:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error deactivating employee schedule",
			);
		}
	}

	async getTeamScheduleCalendar(params: {
		from: string;
		to: string;
		departmentId?: string;
		managerId?: string;
		employeeId?: string;
	}): Promise<TeamScheduleCalendarResponse> {
		try {
			const query = new URLSearchParams({
				from: params.from,
				to: params.to,
			});
			if (params.departmentId) query.set("departmentId", params.departmentId);
			if (params.managerId) query.set("managerId", params.managerId);
			if (params.employeeId) query.set("employeeId", params.employeeId);
			const response = await hrisApiClient.get<any>(
				`/api/employee/team/schedule-calendar?${query.toString()}`,
			);
			const payload = (response.data?.data || response.data) as any;
			const items = Array.isArray(payload?.items)
				? payload.items.map((item: any) => ({
						...item,
						scheduleEntryId: item?.scheduleEntryId || item?.assignmentId || "",
					}))
				: [];
			return {
				...payload,
				items,
			} as TeamScheduleCalendarResponse;
		} catch (error: any) {
			console.error("Error fetching team schedule calendar:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching team schedule calendar",
			);
		}
	}

	async getTeamScheduleCalendarGrid(params: {
		from: string;
		to: string;
		departmentId?: string;
		employeeId?: string;
		consecutiveLimit?: number;
	}): Promise<TeamScheduleCalendarGridResponse> {
		try {
			const query = new URLSearchParams({
				from: params.from,
				to: params.to,
			});
			if (params.departmentId) query.set("departmentId", params.departmentId);
			if (params.employeeId) query.set("employeeId", params.employeeId);
			if (typeof params.consecutiveLimit === "number") {
				query.set("consecutiveLimit", String(params.consecutiveLimit));
			}
			const response = await hrisApiClient.get<any>(
				`/api/employee/team/schedule-calendar-grid?${query.toString()}`,
			);
			const payload = (response.data?.data || response.data) as any;
			const rows = Array.isArray(payload?.rows)
				? payload.rows.map((row: any) => ({
						...row,
						scheduleEntries: Array.isArray(row?.scheduleEntries)
							? row.scheduleEntries
							: Array.isArray(row?.assignments)
								? row.assignments.map((entry: any) => ({
										...entry,
										scheduleEntryId:
											entry?.scheduleEntryId || entry?.assignmentId || "",
									}))
								: [],
						cells: Array.isArray(row?.cells)
							? row.cells.map((cell: any) => ({
									...cell,
									scheduleEntryId:
										cell?.scheduleEntryId || cell?.assignmentId || null,
								}))
							: [],
					}))
				: [];
			const scheduleSummaries = Array.isArray(payload?.scheduleSummaries)
				? payload.scheduleSummaries.map((summary: any) => ({
						...summary,
						scheduleEntryCount:
							typeof summary?.scheduleEntryCount === "number"
								? summary.scheduleEntryCount
								: Number(summary?.assignmentCount || 0),
					}))
				: [];
			return {
				...payload,
				rows,
				scheduleSummaries,
			} as TeamScheduleCalendarGridResponse;
		} catch (error: any) {
			console.error("Error fetching team schedule calendar grid:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching team schedule calendar grid",
			);
		}
	}

	async getTeamScheduleCollections(
		departmentId?: string,
	): Promise<TeamScheduleCollectionsResponse> {
		try {
			const query = new URLSearchParams();
			if (departmentId) query.set("departmentId", departmentId);
			const suffix = query.toString() ? `?${query.toString()}` : "";
			const response = await hrisApiClient.get<any>(
				`/api/employee/team/schedule-collections${suffix}`,
			);
			return (response.data?.data || response.data) as TeamScheduleCollectionsResponse;
		} catch (error: any) {
			console.error("Error fetching team schedule collections:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching team schedule collections",
			);
		}
	}

	async createTeamScheduleCollection(payload: TeamScheduleTemplatePayload): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/employee/team/schedule-collections`,
				payload,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error creating team schedule collection:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error creating team schedule collection",
			);
		}
	}

	async updateTeamScheduleCollection(
		collectionId: string,
		payload: Partial<Omit<TeamScheduleTemplatePayload, "departmentId">> & {
			isActive?: boolean;
		},
	): Promise<any> {
		try {
			const response = await hrisApiClient.patch<any>(
				`/api/employee/team/schedule-collections/${collectionId}`,
				payload,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error updating team schedule collection:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating team schedule collection",
			);
		}
	}

	async archiveTeamScheduleCollection(collectionId: string): Promise<any> {
		try {
			const response = await hrisApiClient.patch<any>(
				`/api/employee/team/schedule-collections/${collectionId}/archive`,
				{},
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error archiving team schedule collection:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error archiving team schedule collection",
			);
		}
	}

	async applyTeamScheduleRotation(payload: ApplyTeamRotationPayload): Promise<any> {
		try {
			const response = await hrisApiClient.post<any>(
				`/api/employee/team/schedule-ledger/apply-rotation`,
				payload,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error applying team rotation:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error applying team rotation",
			);
		}
	}

	async overrideTeamScheduleLedger(payload: TeamScheduleOverridePayload): Promise<any> {
		try {
			const response = await hrisApiClient.patch<any>(
				`/api/employee/team/schedule-ledger/override`,
				payload,
			);
			return response.data?.data || response.data;
		} catch (error: any) {
			console.error("Error overriding team schedule ledger:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error overriding team schedule ledger",
			);
		}
	}

	/**
	 * Update employee with account using HRIS API (full update)
	 * @param employeeId MongoDB _id (e.g., "690ac9737c4d2e503d8bab75"), not the employeeId field (e.g., "EMP234")
	 * @param employeeData Employee data with account update
	 * @returns Promise<Employee> - Updated employee data
	 */
	async updateEmployeeWithAccount(
		employeeId: string,
		employeeData: CreateEmployeeWithAccountRequest | any,
	): Promise<Employee> {
		try {
			// Set the auth token for HRIS API client

			console.log("Updating employee with account using HRIS API");
			console.log("Employee MongoDB ID:", employeeId);
			console.log("Employee data:", employeeData);

			// Check if files are included
			const hasFiles = employeeData.files && Object.keys(employeeData.files).length > 0;

			if (hasFiles) {
				// Build FormData for multipart/form-data submission
				const formData = new FormData();

				// Append files first
				const files = employeeData.files;
				Object.entries(files).forEach(([docType, file]) => {
					if (file) {
						formData.append("documents", file as File);
						// Add metadata to identify which document type this file is for
						formData.append("documentTypes", docType);
					}
				});

				// Remove files from payload before stringifying
				const { files: _, ...payloadWithoutFiles } = employeeData;

				// Append JSON data as a string field
				formData.append("data", JSON.stringify(payloadWithoutFiles));

				console.log("Sending FormData with files for update");
				const response = await hrisApiClient.patchForm<Employee>(
					`/api/employee/${employeeId}`,
					formData,
				);
				if (!response.data) {
					throw new Error("Failed to update employee");
				}
				return response.data;
			} else {
				// Send as regular JSON - handle both nested payload and direct payload
				const payload = employeeData.payload || employeeData;

				// Uses MongoDB _id in the URL path and PATCH for partial updates
				const response = await hrisApiClient.patch<Employee>(
					`/api/employee/${employeeId}`,
					payload,
				);
				if (!response.data) {
					throw new Error("Failed to update employee");
				}
				return response.data;
			}
		} catch (error: any) {
			console.error("Error updating employee with account:", error);
			// Preserve structured API error payload (status/message/errors[]) for toast formatters
			if (error && typeof error === "object" && ("status" in error || "errors" in error)) {
				throw error;
			}
			const errorMessage = getErrorMessage(error) || "Error updating employee with account";
			throw {
				message: errorMessage,
			};
		}
	}

	/**
	 * Delete an employee
	 * @param employeeId Employee ID
	 * @returns Promise<void>
	 */
	async deleteEmployee(employeeId: string): Promise<void> {
		try {
			// Set the auth token for HRIS API client

			await hrisApiClient.delete(`/api/employee/${employeeId}`);
		} catch (error: any) {
			console.error("Error deleting employee:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting employee",
			);
		}
	}

	/**
	 * Get employee profile (legacy method for backward compatibility)
	 * @param employeeId Employee ID
	 * @returns Promise<Employee> - Employee data
	 */
	async getEmployeeProfile(employeeId: string): Promise<Employee> {
		return this.getEmployeeById(employeeId);
	}

	/**
	 * Update employee status
	 * @param employeeId Employee ID
	 * @param status New status
	 * @returns Promise<Employee> - Updated employee data
	 */
	async updateEmployeeStatus(
		employeeId: string,
		status: "active" | "inactive" | "terminated",
	): Promise<Employee> {
		return this.updateEmployee(employeeId, { status });
	}

	/**
	 * Get employees by department ID
	 * @param departmentId Department ID
	 * @param params Optional query parameters
	 * @returns Promise<EmployeesResponse> - Employees response
	 */
	async getEmployeesByDepartment(
		departmentId: string,
		params?: ApiQueryParams,
	): Promise<EmployeesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<EmployeesResponse>(
				`/api/employee?departmentId=${departmentId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("Failed to fetch department employees");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching department employees:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching department employees",
			);
		}
	}

	/**
	 * Get employees with specific parameters
	 * @param params Query parameters
	 * @returns Promise<EmployeesResponse> - Employees response
	 */
	async getEmployeesWithParams(params: ApiQueryParams): Promise<EmployeesResponse> {
		return this.setParams(params).getEmployees();
	}

	async getOrganizationReportingCounts(params?: {
		departmentId?: string | null;
	}): Promise<OrganizationReportingCountsResponse> {
		const departmentId = String(params?.departmentId || "").trim();
		const withDepartmentFilter = (filter?: string) =>
			[filter, departmentId && departmentId !== "all" ? `departmentId:${departmentId}` : null]
				.filter(Boolean)
				.join(",");
		const getCount = async (filter?: string) => {
			const response = await this.clearQueryParams()
				.setParams({
					...ORG_REPORTING_CONTRACT.countOnly,
					fields: ORG_REPORTING_CONTRACT.fields,
					filter: withDepartmentFilter(filter),
				})
				.getEmployees(false, true);
			return extractEmployeeCount(response);
		};

		const [totalEmployees, withDirectReports, withoutImmediateSupervisor] =
			await Promise.all([
				getCount(),
				getCount(ORG_REPORTING_CONTRACT.filters.withDirectReports),
				getCount(ORG_REPORTING_CONTRACT.filters.withoutImmediateSupervisor),
			]);

		return {
			totalEmployees,
			withDirectReports,
			withoutImmediateSupervisor,
		};
	}

	/**
	 * Get employee eligibility candidates and metrics
	 * @param params Query parameters
	 * @returns Promise<EmployeeEligibilityResponse> - Eligibility data and metrics
	 */
	async getEmployeeEligibility(params?: ApiQueryParams): Promise<EmployeeEligibilityResponse> {
		try {
			const mergedParams = new URLSearchParams();

			if (params) {
				if (params.page) mergedParams.set("page", params.page.toString());
				if (params.limit) mergedParams.set("limit", params.limit.toString());
				if (params.document !== undefined)
					mergedParams.set("document", params.document.toString());
			} else {
				// Defaults if no params
				mergedParams.set("limit", "20");
				mergedParams.set("page", "1");
			}

			const endpoint = `/api/metrics/eligibility`;

			console.log("Fetching employee eligibility (POST):", endpoint);

			const payload = {
				pagination: {
					page: params?.page || 1,
					limit: params?.limit || 20,
				},
				filter: {
					// Map any relevant query params to filter object if needed
					// For example if you support filtering by eligibleFor via params
					...(params as any), // Pass valid params like suitable filters
				},
				// If document param is needed it should be handled, but currently endpoint doesn't seem to use it explicitly for include logic
			};

			const response = await hrisApiClient.post<EmployeeEligibilityResponse>(
				endpoint,
				payload,
			);

			if (!response.data) {
				throw new Error("Failed to fetch employee eligibility");
			}

			return response.data;
		} catch (error: any) {
			console.error("Error fetching employee eligibility:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee eligibility",
			);
		}
	}

	/**
	 * Search employees by name or email
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<EmployeesResponse> - Employees response
	 */
	async searchEmployees(query: string, params?: ApiQueryParams): Promise<EmployeesResponse> {
		return this.search(query)
			.setParams(params || {})
			.getEmployees();
	}

	/**
	 * Get employees grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<EmployeesResponse> - Employees response
	 */
	async getEmployeesGrouped(
		groupBy: string,
		params?: ApiQueryParams,
	): Promise<EmployeesResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getEmployees();
	}

	// Legacy method for backward compatibility
	async getEmployee(id: string): Promise<Employee> {
		return this.getEmployeeById(id);
	}

	// Employee Attendance Methods

	/**
	 * Mark attendance for an employee (clock in/out)
	 * @param employeeId Employee ID
	 * @param data Attendance data
	 * @returns Promise<EmployeeAttendanceRecord> - Created attendance record
	 */
	async markEmployeeAttendance(
		employeeId: string,
		data: MarkAttendanceRequest,
	): Promise<EmployeeAttendanceRecord> {
		try {
			// Set the auth token for HRIS API client

			const response = await hrisApiClient.post<EmployeeAttendanceRecord>(
				`/api/employee/${employeeId}/attendance`,
				data,
			);
			return (response.data || response) as EmployeeAttendanceRecord;
		} catch (error: any) {
			console.error("Error marking attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error marking attendance",
			);
		}
	}

	/**
	 * Get employee's attendance records with optional filtering and pagination
	 * @param employeeId Employee ID
	 * @param params Query parameters for filtering and pagination
	 * @returns Promise<EmployeeAttendanceResponse> - Attendance response with pagination
	 */
	async getEmployeeAttendance(
		employeeId: string,
		params?: EmployeeAttendanceQueryParams,
	): Promise<EmployeeAttendanceResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<EmployeeAttendanceResponse>(
				`/api/employee/${employeeId}/attendance${queryString}`,
			);
			return (response.data || response) as EmployeeAttendanceResponse;
		} catch (error: any) {
			console.error("Error fetching employee attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee attendance",
			);
		}
	}

	/**
	 * Get today's attendance status for an employee
	 * @param employeeId Employee ID
	 * @returns Promise<EmployeeAttendanceRecord | null> - Today's attendance record or null
	 */
	async getTodayAttendance(employeeId: string): Promise<EmployeeAttendanceRecord | null> {
		try {
			// Set the auth token for HRIS API client

			const response = await hrisApiClient.get<{ attendance: EmployeeAttendanceRecord }>(
				`/api/employee/${employeeId}/attendance/today`,
			);
			if (!response.data) {
				throw new Error("Attendance not found");
			}
			return response.data.attendance;
		} catch (error: any) {
			console.error("Error fetching today's attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching today's attendance",
			);
		}
	}

	/**
	 * Get specific attendance record for an employee
	 * @param employeeId Employee ID
	 * @param attendanceId Attendance record ID
	 * @returns Promise<EmployeeAttendanceRecord> - Specific attendance record
	 */
	async getAttendanceRecord(
		employeeId: string,
		attendanceId: string,
	): Promise<EmployeeAttendanceRecord> {
		try {
			// Set the auth token for HRIS API client

			const response = await hrisApiClient.get<EmployeeAttendanceRecord>(
				`/api/employee/${employeeId}/attendance/${attendanceId}`,
			);
			return (response.data || response) as EmployeeAttendanceRecord;
		} catch (error: any) {
			console.error("Error fetching attendance record:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance record",
			);
		}
	}

	/**
	 * Update attendance record for an employee
	 * @param employeeId Employee ID
	 * @param attendanceId Attendance record ID
	 * @param data Update data
	 * @returns Promise<EmployeeAttendanceRecord> - Updated attendance record
	 */
	async updateAttendanceRecord(
		employeeId: string,
		attendanceId: string,
		data: UpdateAttendanceRequest,
	): Promise<EmployeeAttendanceRecord> {
		try {
			// Set the auth token for HRIS API client

			const response = await hrisApiClient.patch<EmployeeAttendanceRecord>(
				`/api/employee/${employeeId}/attendance/${attendanceId}`,
				data,
			);
			return (response.data || response) as EmployeeAttendanceRecord;
		} catch (error: any) {
			console.error("Error updating attendance record:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating attendance record",
			);
		}
	}

	/**
	 * Delete attendance record for an employee
	 * @param employeeId Employee ID
	 * @param attendanceId Attendance record ID
	 * @returns Promise<void>
	 */
	async deleteAttendanceRecord(employeeId: string, attendanceId: string): Promise<void> {
		try {
			// Set the auth token for HRIS API client

			await hrisApiClient.delete(`/api/employee/${employeeId}/attendance/${attendanceId}`);
		} catch (error: any) {
			console.error("Error deleting attendance record:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error deleting attendance record",
			);
		}
	}

	async debugDeleteTodayAttendance(employeeId: string): Promise<DebugAttendanceResetResult> {
		try {
			const response = await hrisApiClient.delete<{
				data?: DebugAttendanceResetResult;
			}>(`/api/employee/${employeeId}/attendance/debug/today?debug=true`);
			return (
				(response.data as any)?.data ||
				response.data ||
				{}
			) as DebugAttendanceResetResult;
		} catch (error: any) {
			console.error("Error resetting today's attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error resetting today's attendance",
			);
		}
	}

	/**
	 * Clock in for an employee (convenience method)
	 * @param employeeId Employee ID
	 * @param location Optional location coordinates
	 * @param notes Optional notes
	 * @returns Promise<EmployeeAttendanceRecord> - Created attendance record
	 */
	async clockIn(
		employeeId: string,
		location?: { lat: number; lng: number },
		notes?: string,
	): Promise<EmployeeAttendanceRecord> {
		return this.markEmployeeAttendance(employeeId, {
			date: getManilaAttendanceDateKey(),
			timeIn: new Date().toISOString(),
			status: "PRESENT",
			location,
			notes,
		});
	}

	/**
	 * Clock out for an employee (convenience method)
	 * @param employeeId Employee ID
	 * @param location Optional location coordinates
	 * @param notes Optional notes
	 * @returns Promise<EmployeeAttendanceRecord> - Updated attendance record
	 */
	async clockOut(
		employeeId: string,
		location?: { lat: number; lng: number },
		notes?: string,
	): Promise<EmployeeAttendanceRecord> {
		try {
			// Set the auth token for HRIS API client

			// First get today's attendance to get the attendance ID
			const todayAttendance = await this.getTodayAttendance(employeeId);
			if (!todayAttendance) {
				throw new Error("No attendance record found for today");
			}

			// Update the attendance record with clock out time
			const response = await hrisApiClient.patch<EmployeeAttendanceRecord>(
				`/api/employee/${employeeId}/attendance/${todayAttendance.id}`,
				{
					timeOut: new Date().toISOString(),
					timeOutLocation: location,
					notes,
				},
			);

			if (!response.data) {
				throw new Error("Failed to clock out");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error clocking out:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error clocking out",
			);
		}
	}

	// Employee Managed Departments Methods

	/**
	 * Get the department an employee belongs to
	 * @param employeeId Employee ID
	 * @param params Optional query parameters
	 * @returns Promise<ManagedDepartment> - Department details
	 */
	async getEmployeeDepartment(
		employeeId: string,
		params?: ApiQueryParams,
	): Promise<ManagedDepartment> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<{ department: ManagedDepartment }>(
				`/api/employee/${employeeId}/department${queryString}`,
			);
			if (!response.data) {
				throw new Error("Employee department not found");
			}
			return response.data.department;
		} catch (error: any) {
			console.error("Error fetching employee department:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching employee department",
			);
		}
	}

	/**
	 * Get all departments managed by an employee
	 * @param employeeId Employee ID
	 * @param params Optional query parameters
	 * @returns Promise<ManagedDepartmentsResponse> - Managed departments response
	 */
	async getManagedDepartments(
		employeeId: string,
		params?: ApiQueryParams,
	): Promise<ManagedDepartmentsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<ManagedDepartmentsResponse>(
				`/api/employee/${employeeId}/managed-departments${queryString}`,
			);
			if (!response.data) {
				throw new Error("Failed to fetch managed departments");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching managed departments:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching managed departments",
			);
		}
	}

	/**
	 * Get specific managed department details
	 * @param employeeId Employee ID
	 * @param departmentId Department ID
	 * @param params Optional query parameters
	 * @returns Promise<ManagedDepartment> - Managed department details
	 */
	async getManagedDepartmentById(
		employeeId: string,
		departmentId: string,
		params?: ApiQueryParams,
	): Promise<ManagedDepartment> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.setParams(params || {}).getQueryString();
			const response = await hrisApiClient.get<{ department: ManagedDepartment }>(
				`/api/employee/${employeeId}/managed-departments/${departmentId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("Managed department not found");
			}
			return response.data.department;
		} catch (error: any) {
			console.error("Error fetching managed department:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching managed department",
			);
		}
	}

	// removed getDefaultManagedDepartment

	/**
	 * Upload a document for an employee
	 */
	async uploadDocument(
		employeeId: string,
		formData: {
			file?: File;
			type: string;
			documentTypeId?: string;
			number?: string;
			issueDate?: string;
			expiryDate?: string;
			fieldValues?: Record<string, unknown>;
		},
	) {
		const form = new FormData();
		if (formData.file) form.append("file", formData.file);
		form.append("type", formData.type);
		if (formData.documentTypeId) form.append("documentTypeId", formData.documentTypeId);
		if (formData.number) form.append("number", formData.number);
		if (formData.issueDate) form.append("issueDate", formData.issueDate);
		if (formData.expiryDate) form.append("expiryDate", formData.expiryDate);
		if (formData.fieldValues) {
			form.append("fieldValues", JSON.stringify(formData.fieldValues));
		}

		const response = await hrisApiClient.post<any>(
			`/api/employee/${employeeId}/upload-document`,
			form,
		);

		return response.data;
	}

	/**
	 * Update a document for an employee
	 */
	async updateDocument(
		documentNumber: string,
		formData: {
			file?: File;
			type?: string;
			documentTypeId?: string;
			number?: string;
			issueDate?: string;
			expiryDate?: string;
			fieldValues?: Record<string, unknown>;
		},
	) {
		const form = new FormData();
		if (formData.file) form.append("file", formData.file);
		if (formData.type) form.append("type", formData.type);
		if (formData.documentTypeId) form.append("documentTypeId", formData.documentTypeId);
		if (formData.number) form.append("number", formData.number);
		if (formData.issueDate) form.append("issueDate", formData.issueDate);
		if (formData.fieldValues) {
			form.append("fieldValues", JSON.stringify(formData.fieldValues));
		}
		// Always append expiryDate even if empty to allow clearing
		form.append("expiryDate", formData.expiryDate || "");

		const response = await hrisApiClient.patchForm<any>(
			`/api/employee/documents/${documentNumber}`,
			form,
		);

		return response.data;
	}

	/**
	 * Delete a document for an employee by either Document.id or Document.number.
	 */
	async deleteDocument(employeeId: string, documentKey: string) {
		const params = new URLSearchParams();
		if (employeeId) params.set("employeeId", employeeId);
		const query = params.toString() ? `?${params.toString()}` : "";
		const response = await hrisApiClient.delete<any>(
			`/api/employee/documents/${encodeURIComponent(documentKey)}${query}`,
		);

		return response.data;
	}

	async reviewDocument(
		documentId: string,
		payload: {
			action: "approve" | "reject";
			rejectionReason?: string;
			comments?: string;
		},
	) {
		const response = await hrisApiClient.patch<any>(
			`/api/employee/documents/${documentId}/review`,
			payload,
		);

		return response.data;
	}

	async getDocumentApprovals(params: ApiQueryParams = {}) {
		const response = await hrisApiClient.get<
			EmployeeDocumentListResponse<EmployeeDocumentApprovalRecord>
		>("/api/employee-documents/approvals", params as any);

		return response.data;
	}

	async getDocumentReviewEvents(params: ApiQueryParams = {}) {
		const response = await hrisApiClient.get<
			EmployeeDocumentListResponse<EmployeeDocumentReviewEvent>
		>("/api/employee-documents/review-events", params as any);

		return response.data;
	}

	async updateEmployeeDocuments(
		employeeId: string,
		data: UpdateEmployeeDocumentsRequest,
	): Promise<Employee> {
		try {
			const hasFiles = Object.values(data.files || {}).some((file) => file instanceof File);

			if (hasFiles) {
				const formData = new FormData();
				Object.entries(data.files || {}).forEach(([documentTypeId, file]) => {
					if (file) {
						formData.append("documents", file);
						formData.append("documentTypes", documentTypeId);
					}
				});
				formData.append("data", JSON.stringify({ documents: data.documents }));

				const response = await hrisApiClient.patchForm<Employee>(
					`/api/employee/${employeeId}`,
					formData,
				);
				if (!response.data) {
					throw new Error("Failed to update employee documents");
				}
				return response.data;
			}

			const response = await hrisApiClient.patch<Employee>(`/api/employee/${employeeId}`, {
				documents: data.documents,
			});
			if (!response.data) {
				throw new Error("Failed to update employee documents");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating employee documents:", error);
			const errorMessage = getErrorMessage(error) || "Error updating employee documents";
			throw new Error(errorMessage);
		}
	}

	/**
	 * Import employees from XLSX file
	 */
	async importEmployees(
		file: File,
		options?: {
			autoCreate?: boolean;
			applyDefaultLeaveBalances?: boolean;
			importMode?: "fast" | "full";
			enableAccountProvisioning?: boolean;
			enableCredentialEmails?: boolean;
			enablePostActions?: boolean;
		},
	): Promise<any> {
		try {
			// Set the auth token for HRIS API client

			const formData = new FormData();
			formData.append("file", file);
			if (options?.autoCreate !== undefined) {
				formData.append("autoCreate", String(options.autoCreate));
			}
			if (options?.applyDefaultLeaveBalances !== undefined) {
				formData.append(
					"applyDefaultLeaveBalances",
					String(options.applyDefaultLeaveBalances),
				);
			}
			if (options?.importMode) {
				formData.append("importMode", options.importMode);
			}
			if (options?.enableAccountProvisioning !== undefined) {
				formData.append(
					"enableAccountProvisioning",
					String(options.enableAccountProvisioning),
				);
			}
			if (options?.enableCredentialEmails !== undefined) {
				formData.append("enableCredentialEmails", String(options.enableCredentialEmails));
			}
			if (options?.enablePostActions !== undefined) {
				formData.append("enablePostActions", String(options.enablePostActions));
			}

			const response = await hrisApiClient.post<any>("/api/employee/import", formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
			});

			return response.data;
		} catch (error: any) {
			console.error("Error importing employees:", error);
			// If the error response contains structured import results (failures), pass it through
			if (error.data && (error.data.results || error.data.summary)) {
				throw error.data;
			}
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error importing employees",
			);
		}
	}

	/**
	 * Get import job progress
	 */
	async getImportProgress(jobId: string): Promise<any> {
		try {
			const response = await hrisApiClient.get<any>(`/api/employee/import/progress/${jobId}`);

			if (!response.data) {
				throw new Error("Failed to get import progress");
			}

			// Handle both nested (response.data.data) and direct (response.data) structures
			const progressData = response.data.data || response.data;
			return progressData;
		} catch (error: any) {
			if (error.response?.status === 404 || error.status === 404) {
				return null; // Job not found or expired
			}
			console.error("Error getting import progress:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error getting import progress",
			);
		}
	}

	/**
	 * Migrate employees via the migration API (POST /api/migration/upload-csv).
	 * Unlike importEmployees(), this is synchronous — it returns the full migration
	 * result directly (no jobId / polling needed). Best for bulk operations with
	 * thousands of employees.
	 */
	async migrateEmployees(
		file: File,
		options?: { autoCreate?: boolean; dryRun?: boolean },
	): Promise<any> {
		try {
			const formData = new FormData();
			formData.append("file", file);
			if (options?.autoCreate) {
				formData.append("autoCreate", "true");
			}
			if (options?.dryRun) {
				formData.append("dryRun", "true");
			}

			const response = await hrisApiClient.post<any>("/api/migration/upload-csv", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});

			return response.data;
		} catch (error: any) {
			console.error("Error migrating employees:", error);
			if (error.data && (error.data.results || error.data.summary)) {
				throw error.data;
			}
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error migrating employees",
			);
		}
	}

	async extractMigrationSources(files: File[]): Promise<MigrationExtractorResponse> {
		try {
			const formData = new FormData();
			files.forEach((file) => {
				formData.append("files", file);
			});

			const response = await hrisApiClient.post<any>(
				"/api/migration/extract-sources",
				formData,
				{
					headers: { "Content-Type": "multipart/form-data" },
				},
			);

			return (response.data?.data || response.data) as MigrationExtractorResponse;
		} catch (error: any) {
			console.error("Error extracting migration sources:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error extracting migration sources",
			);
		}
	}

	async transformMigrationSource(options: {
		file: File;
		sheetName: string;
		fieldMapping: Partial<Record<MigrationTransformFieldKey, string>>;
		splitRules?: MigrationSplitRule[];
	}): Promise<MigrationTransformResponse> {
		try {
			const formData = new FormData();
			formData.append("file", options.file);
			formData.append("sheetName", options.sheetName);
			formData.append("fieldMapping", JSON.stringify(options.fieldMapping || {}));
			formData.append("splitRules", JSON.stringify(options.splitRules || []));

			const response = await hrisApiClient.post<any>(
				"/api/migration/transform-sources",
				formData,
				{
					headers: { "Content-Type": "multipart/form-data" },
				},
			);

			return (response.data?.data || response.data) as MigrationTransformResponse;
		} catch (error: any) {
			console.error("Error transforming migration source:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error transforming migration source",
			);
		}
	}
	// --- Document Folders ---
	async getCustomDocumentFolders(employeeId: string) {
		const response = await hrisApiClient.get<any>(
			`/api/document-folder/employee/${employeeId}`,
		);
		return response.data?.data?.folders || [];
	}

	async createCustomDocumentFolder(employeeId: string, name: string) {
		const response = await hrisApiClient.post<any>("/api/document-folder", {
			employeeId,
			name,
		});
		return response.data?.data || response.data;
	}

	async deleteCustomDocumentFolder(folderId: string) {
		const response = await hrisApiClient.delete<any>(`/api/document-folder/${folderId}`);
		return response.data?.data || response.data;
	}
}

// Export singleton instance
const employeesService = new EmployeesService();
export default employeesService;
