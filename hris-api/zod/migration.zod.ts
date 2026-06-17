import { z } from "zod";

// ─── Role Level Mapping ──────────────────────────────────
// Used to auto-assign roleLevel based on role name patterns
export const RoleLevelMap: Record<string, number> = {
	// Level 1 - Directors / Heads
	CTO: 1,
	"HR Director": 1,
	"Head of Sales": 1,
	"Marketing Director": 1,

	// Level 2 - Managers / Leads
	"Tech Lead": 2,
	PM: 2,
	"Sales Manager": 2,
	"HR Manager": 2,
	"Marketing Manager": 2,

	// Level 3 - Senior
	"Senior Developer": 3,
	"Senior Sales Exec": 3,
	"HR Officer": 3,
	"Senior Marketer": 3,

	// Level 4 - Regular
	Developer: 4,
	"Sales Executive": 4,
	"HR Assistant": 4,
	Marketer: 4,

	// Level 5 - Interns / Junior
	Intern: 5,
	"Junior Dev": 5,
	"Sales Intern": 5,
	"HR Intern": 5,
	"Marketing Intern": 5,
};

/**
 * Infer role level from role name using pattern matching.
 * Follows the B-tree hierarchy: 1 (top) → 5 (bottom)
 */
export function inferRoleLevel(role: string): number {
	// Exact match first
	if (RoleLevelMap[role] !== undefined) return RoleLevelMap[role];

	const normalized = role.toLowerCase().trim();

	// Level 1 patterns
	if (
		normalized.includes("director") ||
		normalized.includes("head of") ||
		normalized.includes("cto") ||
		normalized.includes("ceo") ||
		normalized.includes("cfo") ||
		normalized.includes("coo") ||
		normalized.includes("vp") ||
		normalized.includes("vice president") ||
		normalized.includes("chief")
	)
		return 1;

	// Level 2 patterns
	if (
		normalized.includes("manager") ||
		normalized.includes("lead") ||
		normalized.includes("supervisor") ||
		normalized === "pm"
	)
		return 2;

	// Level 3 patterns
	if (
		normalized.includes("senior") ||
		normalized.includes("sr.") ||
		normalized.includes("officer")
	)
		return 3;

	// Level 5 patterns (check before level 4)
	if (
		normalized.includes("intern") ||
		normalized.includes("junior") ||
		normalized.includes("jr.") ||
		normalized.includes("trainee") ||
		normalized.includes("apprentice")
	)
		return 5;

	// Level 4 - default regular staff
	return 4;
}

// ─── Department Schemas ──────────────────────────────────

export const DepartmentSchema = z.object({
	name: z.string().min(1, "Department name is required"),
	code: z.string().min(1, "Department code is required"),
	description: z.string().optional(),
	parentCode: z.string().optional(), // Reference parent department by code
});

export type DepartmentInput = z.infer<typeof DepartmentSchema>;

// ─── Position Schemas ────────────────────────────────────

export const PositionSchema = z.object({
	title: z.string().min(1, "Position title is required"),
	code: z.string().min(1, "Position code is required"),
	description: z.string().optional(),
	departmentCode: z.string().optional(), // Link to department by code
	minSalary: z.number().optional(),
	maxSalary: z.number().optional(),
});

export type PositionInput = z.infer<typeof PositionSchema>;

// ─── Level Schemas ───────────────────────────────────────

export const LevelSchema = z.object({
	name: z.string().min(1, "Level name is required"),
	rank: z.number().int().min(1).max(10),
	description: z.string().optional(),
});

export type LevelInput = z.infer<typeof LevelSchema>;

// ─── Single Employee Row Schema ──────────────────────────

export const EmployeeRowSchema = z.object({
	employeeId: z.string().min(1, "Employee ID is required"),
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
	middleName: z.string().optional(),
	email: z.string().email("Invalid email format"),
	role: z.string().min(1, "Role is required"),
	departmentCode: z.string().min(1, "Department code is required"),
	departmentName: z.string().optional(),
	positionCode: z.string().min(1, "Position code is required"),
	positionTitle: z.string().optional(),
	levelName: z.string().optional(),
	levelRank: z.coerce.number().int().min(1).max(10).optional(),
	basicSalary: z.coerce.number().positive("Salary must be positive"),
	currency: z.string().default("PHP"),
	payFrequency: z
		.enum(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"])
		.default("SEMI_MONTHLY"),
	employmentType: z
		.enum(["REGULAR", "PROBATIONARY", "CONTRACTUAL", "PART_TIME", "CONSULTANT", "INTERN"])
		.default("PROBATIONARY"),
	employmentStatus: z
		.enum([
			"ACTIVE",
			"RESIGNATION_REQUESTED",
			"SERVING_NOTICE",
			"OFFBOARDING",
			"ONBOARDING",
			"INACTIVE",
			"TERMINATED",
			"RESIGNED",
			"FORMER_EMPLOYEE",
			"RETIRED",
			"ON_LEAVE",
		])
		.default("ACTIVE"),
	workLocation: z.enum(["ONSITE", "REMOTE", "HYBRID"]).default("ONSITE"),
	employmentHireDate: z.coerce.date().optional(),
	reportToEmployeeId: z.string().optional(), // Reference manager by employee ID
});

export type EmployeeRowInput = z.infer<typeof EmployeeRowSchema>;

// ─── Bulk Migration Request Schema ──────────────────────

export const MigrationConfigSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	batchSize: z.number().int().min(50).max(2000).default(500),
	maxParallelBatches: z.number().int().min(1).max(20).default(6),
	skipDuplicates: z.boolean().default(true),
	dryRun: z.boolean().default(false),
});

export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;

// ─── Migration via JSON body ─────────────────────────────

export const BulkMigrationSchema = z.object({
	config: MigrationConfigSchema,
	departments: z.array(DepartmentSchema).optional(),
	positions: z.array(PositionSchema).optional(),
	levels: z.array(LevelSchema).optional(),
	employees: z.array(EmployeeRowSchema).min(1, "At least one employee record is required"),
});

export type BulkMigrationInput = z.infer<typeof BulkMigrationSchema>;

export const EnterpriseMigrationStageEnum = z.enum([
	"PRE_MIGRATION_CONTROLS",
	"FOUNDATION_MASTER",
	"CORE_CONFIGURATION",
	"WORK_PATTERN_MASTER",
	"ORG_STRUCTURE_SKELETON",
	"IDENTITY_MASTER",
	"EMPLOYMENT_BASE",
	"EMPLOYMENT_RELATIONSHIP_PATCH",
	"EMPLOYEE_ATTACHMENT_OPENING_BALANCE",
	"CLOSED_HISTORICAL_OPERATIONAL_LEDGER",
	"OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY",
	"POST_MIGRATION_RECONCILIATION",
]);

export type EnterpriseMigrationStage = z.infer<typeof EnterpriseMigrationStageEnum>;

export const ENTERPRISE_MIGRATION_STAGE_ORDER: EnterpriseMigrationStage[] =
	EnterpriseMigrationStageEnum.options;

export const resolveEnterpriseMigrationStageOrder = (
	requestedStages?: EnterpriseMigrationStage[] | null,
): EnterpriseMigrationStage[] => {
	if (!requestedStages?.length) return [...ENTERPRISE_MIGRATION_STAGE_ORDER];

	const requestedSet = new Set(requestedStages);
	return ENTERPRISE_MIGRATION_STAGE_ORDER.filter((stage) => requestedSet.has(stage));
};

const DateLikeSchema = z.union([z.string(), z.date()]).transform((value) =>
	value instanceof Date ? value : new Date(value),
);

const JsonRecordSchema: z.ZodType<Record<string, any>> = z.record(z.any());
const JsonArraySchema = z.array(z.any());

const EnterpriseOrganizationSchema = z.object({
	code: z.string().min(1, "Organization code is required"),
	name: z.string().min(1, "Organization name is required"),
	description: z.string().optional(),
	branding: JsonRecordSchema.optional(),
	branches: JsonArraySchema.optional(),
	sites: JsonArraySchema.optional(),
	currencies: z.array(z.string()).optional(),
	workforceSources: z.array(z.string()).optional(),
});

const PayrollCycleConfigSchema = z.object({
	defaultPayFrequency: z
		.enum(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"])
		.default("SEMI_MONTHLY"),
	payDateOffsetDays: z.number().int().min(0).max(31).default(5),
	businessDayRule: z.enum(["NONE", "NEXT_BUSINESS_DAY"]).default("NEXT_BUSINESS_DAY"),
	includeHolidaysInBusinessDayCheck: z.boolean().default(true),
	cycleRules: z.any().optional(),
});

const CalculatorMigrationSchema = z.object({
	code: z.string().optional(),
	name: z.string().min(1, "Calculator name is required"),
	description: z.string().optional(),
	type: z.enum(["BASIC", "GROSS_TO_NET", "NET_TO_GROSS", "THIRTEENTH_MONTH", "CUSTOM"]).default("BASIC"),
	taxRates: z.any().optional(),
	sssRates: z.any().optional(),
	philHealthRates: z.any().optional(),
	pagibigRates: z.any().optional(),
	rateMultipliers: z.any().optional(),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
});

const PayrollPeriodMigrationSchema = z.object({
	name: z.string().min(1),
	code: z.string().optional(),
	payFrequency: z
		.enum(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"])
		.optional(),
	periodNumber: z.number().int().optional(),
	startDate: DateLikeSchema,
	endDate: DateLikeSchema,
	payDate: DateLikeSchema,
	calculatorCode: z.string().optional(),
	status: z.enum(["DRAFT", "OPEN", "PROCESSING", "COMPLETED", "CLOSED"]).optional(),
	cutoffDay: z.number().int().optional(),
	notes: z.string().optional(),
	generationMetadata: z.any().optional(),
});

const LeavePolicyMigrationSchema = z.object({
	leaveType: z.string().min(1),
	enabled: z.boolean().default(true),
	isPaid: z.boolean().default(true),
	requiresApproval: z.boolean().default(true),
	minAdvanceNoticeDays: z.number().int().min(0).default(0),
	maxDaysPerRequest: z.number().min(0).default(5),
	allowHalfDay: z.boolean().default(true),
	requireAttachment: z.boolean().default(false),
	allowedEmploymentTypes: z.array(z.string()).default([]),
});

const TimesheetConfigMigrationSchema = z.object({
	enableAutoApprove: z.boolean().default(false),
	enableEditBeforeSubmission: z.boolean().default(true),
	rejectBehavior: z.enum(["REVISE", "RESET_TO_DRAFT"]).default("REVISE"),
	overtimeFlagThresholdMinutes: z.number().int().min(0).default(60),
});

const WorkflowConfigMigrationSchema = z.object({
	code: z.string().min(1),
	name: z.string().optional(),
	description: z.string().optional(),
	domain: z.enum(["REQUEST", "RECRUITMENT", "PAYROLL"]).optional(),
	requestType: z.string().optional().nullable(),
	states: z.array(z.any()).default([]),
	steps: z.array(z.any()).default([]),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
});

const DocumentTypeMigrationSchema = z.object({
	code: z.string().min(1),
	name: z.string().min(1),
	category: z.string().optional(),
	uploadBy: z.string().default("HR"),
	isRequired: z.boolean().default(false),
	isEmployeeVisible: z.boolean().default(true),
	isActive: z.boolean().default(true),
	displayOrder: z.number().int().default(0),
	fields: z.any().default([]),
	metadata: z.any().optional(),
});

const BenefitTypeMigrationSchema = z.object({
	code: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	category: z.string().default("OTHER"),
	provider: z.string().optional(),
	coverage: z.number().optional(),
	minAmount: z.number().optional(),
	maxAmount: z.number().optional(),
	fixedAmount: z.number().optional(),
	percentage: z.number().optional(),
	minServiceMonths: z.number().int().optional(),
	isTaxable: z.boolean().default(false),
	defaultInstallments: z.number().int().default(6),
	payrollCycleDays: z.number().int().default(15),
	requireTermsAgreement: z.boolean().default(true),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
});

const LoanTypeMigrationSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	category: z.string().default("OTHER"),
	maxAmount: z.number().optional(),
	minAmount: z.number().optional(),
	interestRate: z.number().default(0),
	maxTermMonths: z.number().int().default(12),
	minServiceMonths: z.number().int().optional(),
	isActive: z.boolean().default(true),
});

const AgencyMigrationSchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	status: z.string().optional(),
});

const CalendarItemMigrationSchema = z.object({
	title: z.string().min(1),
	description: z.string().optional(),
	type: z.enum(["HOLIDAY", "EVENT", "COMPANY_EVENT", "MEETING", "DEADLINE", "REMINDER", "BIRTHDAY"]).default("HOLIDAY"),
	startDate: DateLikeSchema,
	endDate: DateLikeSchema,
	isAllDay: z.boolean().default(true),
	timezone: z.string().default("UTC"),
	year: z.number().int().optional(),
	tags: z.array(z.string()).default([]),
	status: z.enum(["ACTIVE", "CANCELLED", "COMPLETED", "DRAFT"]).default("ACTIVE"),
	recurrence: z.any().optional(),
	metadata: z.any().optional(),
});

const ShiftTypeMigrationSchema = z.object({
	code: z.string().min(1),
	name: z.string().min(1),
	isOvernight: z.boolean().default(false),
	isOff: z.boolean().default(false),
	timeSlots: z.any().default([]),
	isActive: z.boolean().default(true),
});

const ScheduleTemplateMigrationSchema = z.object({
	code: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	cycleDays: z.number().int().positive(),
	graceLateMinutes: z.number().int().min(0).default(0),
	graceEarlyOutMinutes: z.number().int().min(0).default(0),
	pattern: z.any(),
	isActive: z.boolean().default(true),
});

const PositionLevelMigrationSchema = z.object({
	positionCode: z.string().min(1),
	levelName: z.string().min(1),
});

const DepartmentScheduleLinkMigrationSchema = z.object({
	departmentCode: z.string().min(1),
	scheduleTemplateCode: z.string().min(1),
	source: z.enum(["department_default", "department_head_created", "department_head_linked"]).default("department_default"),
	isActive: z.boolean().default(true),
});

const PersonMigrationSchema = z.object({
	sourcePersonKey: z.string().optional(),
	employeeId: z.string().optional(),
	userId: z.string().optional(),
	personalInfo: JsonRecordSchema.default({}),
	contactInfo: JsonRecordSchema.default({}),
	identification: JsonRecordSchema.optional(),
	metadata: JsonRecordSchema.optional(),
});

const EmployeeBaseMigrationSchema = z.object({
	employeeId: z.string().min(1),
	personReference: z.string().optional(),
	personEmployeeId: z.string().optional(),
	role: z.string().min(1),
	departmentCode: z.string().min(1),
	positionCode: z.string().min(1),
	levelName: z.string().optional(),
	basicSalary: z.number().positive("Salary must be positive"),
	currency: z.string().default("PHP"),
	payFrequency: z
		.enum(["DAILY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY"])
		.default("SEMI_MONTHLY"),
	employmentType: z.string().default("PROBATIONARY"),
	employmentStatus: z.string().default("ACTIVE"),
	workLocation: z.string().default("ONSITE"),
	employmentHireDate: DateLikeSchema.optional(),
	employmentStartDate: DateLikeSchema.optional(),
	employmentTerminationDate: DateLikeSchema.optional(),
	deviceEmpId: z.string().optional(),
	agencyCode: z.string().optional(),
	leaveBalances: z.array(z.any()).optional(),
	employmentHistory: z.array(z.any()).optional(),
	metadata: z.any().optional(),
});

const ReportingLineMigrationSchema = z.object({
	employeeId: z.string().min(1),
	reportToEmployeeId: z.string().min(1),
});

const DepartmentManagerMigrationSchema = z.object({
	departmentCode: z.string().min(1),
	managerEmployeeId: z.string().min(1),
});

const ScheduleOverrideMigrationSchema = z.object({
	employeeId: z.string().min(1),
	date: DateLikeSchema,
	shiftTypeCode: z.string().min(1),
	reason: z.string().optional(),
	createdByEmployeeId: z.string().optional(),
});

const EmployeeScheduleHistoryMigrationSchema = z.object({
	employeeId: z.string().min(1),
	action: z.string().min(1),
	effectiveAt: DateLikeSchema.optional(),
	actorEmployeeId: z.string().optional(),
	reason: z.string().optional(),
	beforeSchedule: z.any().optional(),
	afterSchedule: z.any().optional(),
	metadata: z.any().optional(),
});

const DocumentFolderMigrationSchema = z.object({
	employeeId: z.string().min(1),
	name: z.string().min(1),
});

const DocumentMigrationSchema = z.object({
	employeeId: z.string().min(1),
	name: z.string().min(1),
	type: z.string().min(1),
	number: z.string().min(1),
	issueDate: DateLikeSchema,
	expiryDate: DateLikeSchema.optional().nullable(),
	fileUrl: z.string().optional().nullable(),
	ext: z.string().optional().nullable(),
	documentTypeCode: z.string().optional(),
	fieldValues: z.any().optional(),
	reviewStatus: z.string().optional().nullable(),
	reviewSubmittedAt: DateLikeSchema.optional(),
	reviewSubmittedByEmployeeId: z.string().optional(),
	reviewApprovedAt: DateLikeSchema.optional(),
	reviewApprovedByEmployeeId: z.string().optional(),
	reviewRejectedAt: DateLikeSchema.optional(),
	reviewRejectedByEmployeeId: z.string().optional(),
	reviewRejectionReason: z.string().optional(),
	reviewSource: z.string().optional(),
	metadata: z.any().optional(),
});

const LeaveBalanceMigrationSchema = z.object({
	employeeId: z.string().min(1),
	leaveType: z.string().min(1),
	balance: z.number(),
	asOfDate: DateLikeSchema,
	carryover: z.number().optional(),
	metadata: z.any().optional(),
});

const EmployeeBenefitMigrationSchema = z.object({
	sourceBenefitKey: z.string().optional(),
	employeeId: z.string().min(1),
	benefitTypeName: z.string().min(1),
	name: z.string().optional(),
	description: z.string().optional(),
	totalAmount: z.number(),
	currency: z.string().default("USD"),
	totalInstallments: z.number().int().default(6),
	installmentAmount: z.number(),
	remainingBalance: z.number(),
	amount: z.number().optional(),
	startDate: DateLikeSchema.optional(),
	endDate: DateLikeSchema.optional(),
	startPayrollCutOff: DateLikeSchema.optional(),
	endPayrollCutOff: DateLikeSchema.optional(),
	agreedToTerms: z.boolean().default(false),
	agreedAt: DateLikeSchema.optional(),
	agreedByIp: z.string().optional(),
	status: z.string().default("PENDING"),
	isActive: z.boolean().default(true),
	approvedByEmployeeId: z.string().optional(),
	approvedAt: DateLikeSchema.optional(),
	notes: z.string().optional(),
	remarks: z.string().optional(),
});

const EmployeeBenefitInstallmentMigrationSchema = z.object({
	sourceBenefitKey: z.string().optional(),
	employeeId: z.string().min(1),
	benefitTypeName: z.string().min(1),
	installmentNumber: z.number().int().positive(),
	amount: z.number(),
	scheduledDate: DateLikeSchema,
	processedDate: DateLikeSchema.optional(),
	payrollCutOffId: z.string().optional(),
	payrollRunId: z.string().optional(),
	status: z.string().default("SCHEDULED"),
	failureReason: z.string().optional(),
});

const EmployeeLoanMigrationSchema = z.object({
	sourceLoanKey: z.string().optional(),
	employeeId: z.string().min(1),
	loanTypeName: z.string().min(1),
	principalAmount: z.number(),
	interestRate: z.number().default(0),
	totalAmount: z.number(),
	termMonths: z.number().int().positive(),
	monthlyPayment: z.number(),
	startDate: DateLikeSchema,
	endDate: DateLikeSchema,
	amountPaid: z.number().default(0),
	balance: z.number(),
	status: z.string().default("PENDING"),
	approvedByEmployeeId: z.string().optional(),
	approvedAt: DateLikeSchema.optional(),
	notes: z.string().optional(),
});

const AttendanceMigrationSchema = z.object({
	employeeId: z.string().min(1),
	date: DateLikeSchema,
	timeIn: DateLikeSchema.optional().nullable(),
	timeBreak: DateLikeSchema.optional().nullable(),
	timeOut: DateLikeSchema.optional().nullable(),
	status: z.string().optional(),
	notes: z.string().optional(),
	deviceEmpId: z.string().optional(),
	metadata: z.any().optional(),
	scheduleSnapshot: z.any().optional(),
});

const TimesheetMigrationSchema = z.object({
	employeeId: z.string().min(1),
	payrollPeriodCode: z.string().optional(),
	payrollPeriodRange: z.object({
		startDate: DateLikeSchema,
		endDate: DateLikeSchema,
	}).optional(),
	code: z.string().optional(),
	status: z.string().default("DRAFT"),
	submittedAt: DateLikeSchema.optional(),
	submittedBy: z.string().optional(),
	approvedBy: z.string().optional(),
	approvalDate: DateLikeSchema.optional(),
	rejectionReason: z.string().optional(),
	notes: z.string().optional(),
	metadata: z.any().optional(),
});

const TimesheetLineMigrationSchema = z.object({
	employeeId: z.string().min(1),
	payrollPeriodCode: z.string().optional(),
	payrollPeriodRange: z.object({
		startDate: DateLikeSchema,
		endDate: DateLikeSchema,
	}).optional(),
	timesheetCode: z.string().optional(),
	date: DateLikeSchema,
	revisionNo: z.number().int().min(1).default(1),
	attendanceDate: DateLikeSchema.optional(),
	status: z.string().default("NOT_CLOCKED_IN"),
	timeIn: DateLikeSchema.optional().nullable(),
	timeBreak: DateLikeSchema.optional().nullable(),
	timeOut: DateLikeSchema.optional().nullable(),
	behaviorFlags: z.array(z.string()).default([]),
	scheduleSnapshot: z.any().optional(),
	hoursWorked: z.string().optional(),
	regularHours: z.string().optional(),
	overtimeHours: z.string().optional(),
	undertimeHours: z.string().optional(),
	lateHours: z.string().optional(),
	earlyOutHours: z.string().optional(),
	breakMinutes: z.number().int().optional(),
	notes: z.string().optional(),
	metadata: z.any().optional(),
});

const EmployeePayrollMigrationSchema = z.object({
	employeeId: z.string().min(1),
	payrollPeriodCode: z.string().optional(),
	payrollPeriodRange: z.object({
		startDate: DateLikeSchema,
		endDate: DateLikeSchema,
	}).optional(),
	timesheetCode: z.string().optional(),
	basicPay: z.number().default(0),
	overtimePay: z.number().default(0),
	nightDiffPay: z.number().default(0),
	holidayPay: z.number().default(0),
	allowances: z.number().default(0),
	bonuses: z.number().default(0),
	taxAmount: z.number().default(0),
	sssContribution: z.number().default(0),
	philHealthContribution: z.number().default(0),
	pagibigContribution: z.number().default(0),
	loanDeductions: z.number().default(0),
	absentDeduction: z.number().default(0),
	lateDeduction: z.number().default(0),
	earlyOutDeduction: z.number().default(0),
	otherDeductions: z.number().default(0),
	grossPay: z.number().default(0),
	totalDeductions: z.number().default(0),
	netPay: z.number().default(0),
	regularHours: z.number().default(0),
	overtimeHours: z.number().default(0),
	isPaid: z.boolean().default(false),
	paidAt: DateLikeSchema.optional(),
	paymentMethod: z.string().optional(),
	referenceNumber: z.string().optional(),
	notes: z.string().optional(),
	metadata: z.any().optional(),
});

const StatementOfAccountMigrationSchema = z.object({
	soaNumber: z.string().min(1),
	name: z.string().min(1),
	startDate: DateLikeSchema,
	endDate: DateLikeSchema,
	dueDate: DateLikeSchema.optional(),
	payrollPeriodIds: z.array(z.string()).default([]),
	totalEmployeeShare: z.number().default(0),
	totalEmployerShare: z.number().default(0),
	totalTax: z.number().default(0),
	totalAmount: z.number().default(0),
	totalRemitted: z.number().default(0),
	totalOutstanding: z.number().default(0),
	eppReferenceId: z.string().optional(),
	eppBillingId: z.string().optional(),
	eppReconciled: z.boolean().default(false),
	eppReconciledAt: DateLikeSchema.optional(),
	eppReconciledByEmployeeId: z.string().optional(),
	remitteeName: z.string().optional(),
	remitteeAccount: z.string().optional(),
	remitteeDetails: z.any().optional(),
	status: z.string().default("DRAFT"),
	notes: z.string().optional(),
	description: z.string().optional(),
	metadata: z.any().optional(),
	lineItems: z.array(z.any()).optional(),
});

const SOARemittanceMigrationSchema = z.object({
	soaNumber: z.string().min(1),
	amount: z.number(),
	paymentMethod: z.string().optional(),
	referenceNumber: z.string().optional(),
	paymentDate: DateLikeSchema,
	category: z.string().optional(),
	status: z.string().default("PENDING"),
	notes: z.string().optional(),
	metadata: z.any().optional(),
});

const WorkflowInstanceMigrationSchema = z.object({
	sourceWorkflowKey: z.string().optional(),
	domain: z.string().min(1),
	domainRecordId: z.string().optional(),
	requestType: z.string().optional().nullable(),
	code: z.string().optional(),
	name: z.string().optional(),
	description: z.string().optional(),
	steps: z.array(z.any()).default([]),
	states: z.array(z.any()).optional(),
	currentStateKey: z.string().default("OPEN"),
	stateHistory: z.array(z.any()).default([]),
});

const RequestMigrationSchema = z.object({
	sourceRequestKey: z.string().optional(),
	code: z.string().optional(),
	type: z.string().min(1),
	currentWorkflowStateKey: z.string().default("OPEN"),
	startDate: DateLikeSchema.optional(),
	endDate: DateLikeSchema.optional(),
	description: z.string().min(1),
	attachments: z.array(z.any()).default([]),
	requesterEmployeeId: z.string().min(1),
	targetEmployeeId: z.string().optional(),
	workflowCode: z.string().optional(),
	currentStepNumber: z.number().int().optional(),
	lastCompletedStepNumber: z.number().int().optional(),
	notes: z.string().optional(),
	metadata: z.any().optional(),
});

const WorkflowStepExecutionMigrationSchema = z.object({
	workflowCode: z.string().optional(),
	workflowSourceKey: z.string().optional(),
	requestCode: z.string().optional(),
	requestSourceKey: z.string().optional(),
	stepNumber: z.number().int().positive(),
	stepName: z.string().min(1),
	stepType: z.string().min(1),
	assigneeType: z.string().min(1),
	assigneeRole: z.string().optional(),
	assigneeEmployeeId: z.string().optional(),
	status: z.string().default("PENDING"),
	completedAt: DateLikeSchema.optional(),
	comments: z.string().optional(),
	metadata: z.any().optional(),
	isRequired: z.boolean().default(true),
});

const RequestTransactionMigrationSchema = z.object({
	requestCode: z.string().optional(),
	requestSourceKey: z.string().optional(),
	workflowCode: z.string().optional(),
	stepNumber: z.number().int().optional(),
	actorEmployeeId: z.string().optional(),
	sequenceNumber: z.number().int().positive(),
	eventCategory: z.string().min(1),
	eventKey: z.string().min(1),
	eventSource: z.string().optional(),
	actorType: z.string().default("UNKNOWN"),
	actorRole: z.string().optional(),
	actorDisplayName: z.string().optional(),
	title: z.string().min(1),
	description: z.string().optional(),
	comments: z.string().optional(),
	fromStateKey: z.string().optional(),
	toStateKey: z.string().optional(),
	fieldChanges: z.any().optional(),
	metadata: z.any().optional(),
	visibility: z.string().default("SHARED"),
	isSystemGenerated: z.boolean().default(false),
	occurredAt: DateLikeSchema.optional(),
});

const TerminationMigrationSchema = z.object({
	terminationNumber: z.string().min(1),
	employeeId: z.string().min(1),
	initiatedByEmployeeId: z.string().min(1),
	terminationType: z.string().min(1),
	status: z.string().default("DRAFT"),
	terminationDate: DateLikeSchema,
	lastWorkingDay: DateLikeSchema,
	reason: z.string().min(1),
	severancePackage: z.string().optional(),
	supportingDocuments: z.array(z.any()).default([]),
	hrDirectorEmployeeId: z.string().optional(),
	hrDirectorApprovedAt: DateLikeSchema.optional(),
	hrDirectorComments: z.string().optional(),
	legalApprovalRequired: z.boolean().default(false),
	legalApproverEmployeeId: z.string().optional(),
	legalApprovedAt: DateLikeSchema.optional(),
	legalComments: z.string().optional(),
	processingStartedAt: DateLikeSchema.optional(),
	processingCompletedAt: DateLikeSchema.optional(),
	finalPayCalculated: z.boolean().default(false),
	clearanceCompleted: z.boolean().default(false),
	terminationLetterPath: z.string().optional(),
});

export const EnterpriseMigrationConfigSchema = MigrationConfigSchema.extend({
	stageBatchSize: z.number().int().min(1).max(5000).default(500),
	stopOnStageFailure: z.boolean().default(true),
});

export type EnterpriseMigrationConfig = z.infer<typeof EnterpriseMigrationConfigSchema>;

export const EnterpriseMigrationManifestSchema = z.object({
	runLabel: z.string().min(1, "runLabel is required"),
	sourceSystem: z.string().min(1, "sourceSystem is required"),
	cutoffAt: DateLikeSchema,
	freezeApprovedBy: z.string().optional(),
	operator: z.string().optional(),
	dryRun: z.boolean().default(false),
	hashTotals: JsonRecordSchema.optional(),
	baselineCounts: JsonRecordSchema.optional(),
	assumptions: z.array(z.string()).default([]),
});

export type EnterpriseMigrationManifest = z.infer<typeof EnterpriseMigrationManifestSchema>;

export const EnterpriseMigrationDataSchema = z.object({
	organization: EnterpriseOrganizationSchema.optional(),
	payrollCycleConfig: PayrollCycleConfigSchema.optional(),
	calculators: z.array(CalculatorMigrationSchema).default([]),
	payrollPeriods: z.array(PayrollPeriodMigrationSchema).default([]),
	leavePolicies: z.array(LeavePolicyMigrationSchema).default([]),
	timesheetConfigs: z.array(TimesheetConfigMigrationSchema).default([]),
	workflowConfigs: z.array(WorkflowConfigMigrationSchema).default([]),
	documentTypes: z.array(DocumentTypeMigrationSchema).default([]),
	benefitTypes: z.array(BenefitTypeMigrationSchema).default([]),
	loanTypes: z.array(LoanTypeMigrationSchema).default([]),
	agencies: z.array(AgencyMigrationSchema).default([]),
	calendarItems: z.array(CalendarItemMigrationSchema).default([]),
	shiftTypes: z.array(ShiftTypeMigrationSchema).default([]),
	scheduleTemplates: z.array(ScheduleTemplateMigrationSchema).default([]),
	departments: z.array(DepartmentSchema).default([]),
	levels: z.array(LevelSchema).default([]),
	positions: z.array(PositionSchema).default([]),
	positionLevels: z.array(PositionLevelMigrationSchema).default([]),
	departmentScheduleLinks: z.array(DepartmentScheduleLinkMigrationSchema).default([]),
	persons: z.array(PersonMigrationSchema).default([]),
	employees: z.array(EmployeeBaseMigrationSchema).default([]),
	reportingLines: z.array(ReportingLineMigrationSchema).default([]),
	departmentManagers: z.array(DepartmentManagerMigrationSchema).default([]),
	scheduleOverrides: z.array(ScheduleOverrideMigrationSchema).default([]),
	employeeScheduleHistories: z.array(EmployeeScheduleHistoryMigrationSchema).default([]),
	documentFolders: z.array(DocumentFolderMigrationSchema).default([]),
	documents: z.array(DocumentMigrationSchema).default([]),
	leaveBalances: z.array(LeaveBalanceMigrationSchema).default([]),
	employeeBenefits: z.array(EmployeeBenefitMigrationSchema).default([]),
	employeeBenefitInstallments: z.array(EmployeeBenefitInstallmentMigrationSchema).default([]),
	employeeLoans: z.array(EmployeeLoanMigrationSchema).default([]),
	attendances: z.array(AttendanceMigrationSchema).default([]),
	timesheets: z.array(TimesheetMigrationSchema).default([]),
	timesheetLines: z.array(TimesheetLineMigrationSchema).default([]),
	employeePayrolls: z.array(EmployeePayrollMigrationSchema).default([]),
	statementsOfAccount: z.array(StatementOfAccountMigrationSchema).default([]),
	soaRemittances: z.array(SOARemittanceMigrationSchema).default([]),
	workflowInstances: z.array(WorkflowInstanceMigrationSchema).default([]),
	requests: z.array(RequestMigrationSchema).default([]),
	workflowStepExecutions: z.array(WorkflowStepExecutionMigrationSchema).default([]),
	requestTransactions: z.array(RequestTransactionMigrationSchema).default([]),
	terminations: z.array(TerminationMigrationSchema).default([]),
});

export type EnterpriseMigrationData = z.infer<typeof EnterpriseMigrationDataSchema>;

export const EnterpriseMigrationRequestSchema = z.object({
	config: EnterpriseMigrationConfigSchema,
	manifest: EnterpriseMigrationManifestSchema,
	data: EnterpriseMigrationDataSchema,
	options: z
		.object({
			stages: z.array(EnterpriseMigrationStageEnum).optional(),
			strictIntegrity: z.boolean().default(true),
			allowFallbackSchedule: z.boolean().default(false),
			fallbackShiftTypeCode: z.string().optional(),
		})
		.optional(),
});

export type EnterpriseMigrationRequest = z.infer<typeof EnterpriseMigrationRequestSchema>;

// ─── Credentials Test Email Schema ───────────────────────────────────────────

export const TestCredentialsEmailSchema = z.object({
	to: z.string().email("Recipient email is invalid"),
	employeeId: z.string().min(1, "employeeId is required"),
	email: z.string().email("Employee email is invalid"),
	userName: z.string().min(1, "userName is required"),
	password: z.string().min(1, "password is required"),
	fullName: z.string().optional(),
	dryRun: z.boolean().default(false),
});

export type TestCredentialsEmailInput = z.infer<typeof TestCredentialsEmailSchema>;
