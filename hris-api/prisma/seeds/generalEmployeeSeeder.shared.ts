import * as fs from "fs";
import * as path from "path";
import { PrismaClient, Prisma } from "../../generated/prisma";
import {
	DEFAULT_COMPANY_PROFILE,
	seedProjectDefaults,
	type SeedProjectDefaultsResult,
} from "./defaultProjectSeeder";
import {
	calculateTimekeeping,
	determineAttendanceStatus,
	formatMinutesAsTime,
} from "../../helper/timekeeping.helper";
import {
	applyOvertimeApprovalPolicyToTimekeepingFields,
	deriveOvertimeAwareBehaviorFlags,
	readOvertimeCandidateFromMetadata,
} from "../../helper/overtime-approval.helper";
import { createOvertimeRequestForTimesheetLine } from "../../app/timesheet/overtime-request.service";
import {
	appendEmployeeScheduleHistory,
	copyTemplateToEmployeeEmbeddedSchedule,
	resolveEffectiveShift,
	toShiftTypeSnapshot,
	type EmployeeScheduleSnapshot,
} from "../../helper/employee-schedule.helper";
import {
	calculateScheduleTemplateTotals,
	calculateShiftHour,
} from "../../helper/schedule-normalization.helper";
import {
	generateTimesheetForPayrollPeriod,
	refreshTimesheetForAttendanceDate,
} from "../../helper/timesheet.helper";
import { HRIS_AUTH_ROLE_KEYS, type SeedAuthRoleKey } from "../../helper/seed-auth.helper";
import {
	createSeedAuthModeAdapter,
	type SeedAuthModeAdapter,
	type SeedAuthOrganization,
} from "./seedAuthModeAdapter";
import { seedWorkflowInstanceTemplates } from "./workflowInstanceTemplateSeeder";
import { ensureDefaultLeaveBalances } from "../../helper/default-leave-balances.helper";
import {
	completeTaskStep,
	createRequestStepExecutions,
	getDefaultRequestWorkflow,
	updateRequestStepProgress,
} from "../../helper/request-runtime.helper";
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
import { reconcileEmployeeOnboardingState } from "../../helper/boarding-documents.helper";
import { generateCertificateOfEmployment } from "../../helper/generate-document.helper";
import {
	backfillOpenPayrollPeriodAttendanceObligations,
	materializeTimesheetLinesFromObligations,
} from "../../helper/attendance-obligation.helper";

let prisma = new PrismaClient();
let seedAuthAdapter: SeedAuthModeAdapter | null = null;
let hasLoggedDocumentCollectionCapWarning = false;

const isCollectionCapError = (error: unknown) => {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
	if (error.code !== "P2010") return false;
	const message = String(error.meta?.message || "").toLowerCase();
	return (
		message.includes("cannot create a new collection") && message.includes("500 collections")
	);
};

// Concurrency control for request creation to prevent write conflicts
let requestCreationQueue: (() => Promise<any>)[] = [];
let isRequestCreationRunning = false;

const executeRequestCreationSequentially = async <T>(operation: () => Promise<T>): Promise<T> => {
	return new Promise((resolve, reject) => {
		requestCreationQueue.push(async () => {
			try {
				const result = await operation();
				resolve(result);
			} catch (error) {
				reject(error);
			}
		});

		if (!isRequestCreationRunning) {
			processRequestCreationQueue();
		}
	});
};

const processRequestCreationQueue = async () => {
	if (isRequestCreationRunning || requestCreationQueue.length === 0) {
		return;
	}

	isRequestCreationRunning = true;
	while (requestCreationQueue.length > 0) {
		const operation = requestCreationQueue.shift();
		if (operation) {
			try {
				await operation();
			} catch (error) {
				console.error("Error processing request creation:", error);
			}
		}
	}
	isRequestCreationRunning = false;
};

export type LevelDefinition = {
	name: string;
	rank: number;
	description: string;
	isManager: boolean;
};

export type DepartmentDefinition = {
	name: string;
	code: string;
	description: string;
	isHr: boolean;
};

export type SectionDefinition = {
	name: string;
	code: string;
	description: string;
	departmentCode: string;
	isHr: boolean;
};

export type PositionDefinition = {
	title: string;
	code: string;
	description: string;
	departmentCode: string;
	sectionCode: string;
	levelNames: string[];
	minSalary?: number;
	maxSalary?: number;
};

export type SeedEmployeeDefinition = {
	firstName: string;
	lastName: string;
	email: string;
	employeeCode: string;
	role: SeedAuthRoleKey;
	departmentCode: string;
	sectionCode: string;
	positionCode: string;
	levelName: string;
	salary: number;
	reportsToEmail?: string;
	isDepartmentManager?: boolean;
	includeOvertime?: boolean;
	/**
	 * When true, seed on-time attendance every scheduled workday (no late/undertime/early-out,
	 * no virtual AWOL). Used so demo accounts like ceo@seed.local show on Perfect Attendance reports.
	 */
	perfectAttendance?: boolean;
};

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
	{ name: "Entry", rank: 1, description: "Entry-level role", isManager: false },
	{ name: "Junior", rank: 2, description: "Junior-level role", isManager: false },
	{ name: "Mid", rank: 3, description: "Mid-level role", isManager: false },
	{
		name: "Staff",
		rank: 3,
		description: "Legacy sample-pack individual contributor level",
		isManager: false,
	},
	{ name: "Senior", rank: 4, description: "Senior-level role", isManager: false },
	{ name: "Manager", rank: 5, description: "People manager role", isManager: true },
	{ name: "Director", rank: 6, description: "Director role", isManager: true },
];

export const DEPARTMENT_DEFINITIONS: DepartmentDefinition[] = [
	{ name: "Executive", code: "EXEC", description: "Executive leadership", isHr: false },
	{ name: "Human Resources", code: "HR", description: "HR department", isHr: true },
	{
		name: "Software Development",
		code: "SW",
		description: "Software development department",
		isHr: false,
	},
	{
		name: "Production/Administration",
		code: "PROD-ADMIN",
		description: "Production and administrative operations",
		isHr: false,
	},
	{
		name: "Project Engineering",
		code: "PROJ-ENG",
		description: "Project engineering department",
		isHr: false,
	},
	{
		name: "Production Planning",
		code: "PROD-PLAN",
		description: "Production planning department",
		isHr: false,
	},
	{
		name: "Product Assurance",
		code: "PROD-ASSUR",
		description: "Product assurance department",
		isHr: false,
	},
	{ name: "Assembly", code: "ASM", description: "Assembly operations department", isHr: false },
	{ name: "Decoration", code: "DECOR", description: "Decoration operations department", isHr: false },
	{
		name: "Process Engineering",
		code: "PROC-ENG",
		description: "Process engineering department",
		isHr: false,
	},
	{
		name: "Injection and Mold Maintenance",
		code: "INJ-MOLD",
		description: "Injection and mold maintenance department",
		isHr: false,
	},
	{ name: "Quality Control", code: "QC", description: "Quality control department", isHr: false },
	{ name: "Accounting", code: "ACCT", description: "Accounting department", isHr: false },
	{
		name: "Product Assurance/Product Engineering/Purchasing",
		code: "PA-PE-PUR",
		description: "Cross-functional assurance and purchasing department",
		isHr: false,
	},
	{ name: "Purchasing", code: "PUR", description: "Purchasing department", isHr: false },
	{
		name: "Production Planning/Purchasing",
		code: "PP-PUR",
		description: "Shared production planning and purchasing department",
		isHr: false,
	},
	{ name: "Quality Assurance", code: "QA", description: "Quality assurance department", isHr: false },
	{
		name: "Warehouse/Facilities",
		code: "WH-FAC",
		description: "Warehouse and facilities department",
		isHr: false,
	},
	{
		name: "Strategic Planning",
		code: "STRAT-PLAN",
		description: "Strategic planning department",
		isHr: false,
	},
	{ name: "Warehouse", code: "WH", description: "Warehouse operations department", isHr: false },
	{ name: "Sales", code: "SALES", description: "Sales department", isHr: false },
	{ name: "Facilities", code: "FAC", description: "Facilities operations department", isHr: false },
	{
		name: "Quality & Compliance Unit",
		code: "QCU",
		description: "Quality and compliance unit",
		isHr: false,
	},
	{
		name: "GA/HR",
		code: "GA-HR",
		description: "General affairs and human resources department",
		isHr: true,
	},
	{
		name: "Import/Export",
		code: "IMP-EXP",
		description: "Import and export department",
		isHr: false,
	},
];

const POSITION_BEARING_SECTION_DEFINITIONS: SectionDefinition[] = [
	{
		name: "Executive Office",
		code: "EXEC-OFFICE",
		description: "Executive office leadership and governance",
		departmentCode: "EXEC",
		isHr: false,
	},
	{
		name: "HR Operations",
		code: "HR-OPS",
		description: "Human resources operations and services",
		departmentCode: "HR",
		isHr: true,
	},
	{
		name: "Employee Relations",
		code: "HR-ER",
		description: "Employee relations and HR case support",
		departmentCode: "HR",
		isHr: true,
	},
	{
		name: "Software Engineering",
		code: "SW-ENG",
		description: "Software engineering and application delivery",
		departmentCode: "SW",
		isHr: false,
	},
	{
		name: "Software QA",
		code: "SW-QA",
		description: "Software quality assurance and testing",
		departmentCode: "SW",
		isHr: false,
	},
	{
		name: "Corporate Planning",
		code: "SP-CORP",
		description: "Corporate and strategic planning",
		departmentCode: "STRAT-PLAN",
		isHr: false,
	},
	{
		name: "Project Engineering",
		code: "PE-PROJ",
		description: "Project engineering delivery",
		departmentCode: "PROJ-ENG",
		isHr: false,
	},
	{
		name: "Operations Administration",
		code: "PA-OPS",
		description: "Production and operations administration",
		departmentCode: "PROD-ADMIN",
		isHr: false,
	},
	{
		name: "Production Supervision",
		code: "PA-SUP",
		description: "Production supervision and floor leadership",
		departmentCode: "PROD-ADMIN",
		isHr: false,
	},
	{
		name: "Technical Support",
		code: "PA-TECH",
		description: "Production technical support",
		departmentCode: "PROD-ADMIN",
		isHr: false,
	},
	{
		name: "Assembly Line Operations",
		code: "ASM-LINE",
		description: "Assembly line operations",
		departmentCode: "ASM",
		isHr: false,
	},
	{
		name: "Financial Planning",
		code: "FIN-PLAN",
		description: "Financial planning and analysis",
		departmentCode: "FIN",
		isHr: false,
	},
	{
		name: "Finance Operations",
		code: "FIN-OPS",
		description: "Finance operations and controls",
		departmentCode: "FIN",
		isHr: false,
	},
	{
		name: "Service Delivery",
		code: "OPS-DELIVERY",
		description: "Operations service delivery",
		departmentCode: "OPS",
		isHr: false,
	},
	{
		name: "Operations Support",
		code: "OPS-SUPPORT",
		description: "Operations support and coordination",
		departmentCode: "OPS",
		isHr: false,
	},
];

const buildSectionDefinitions = (departmentDefinitions: DepartmentDefinition[]) => {
	const mappedDepartmentCodes = new Set(
		POSITION_BEARING_SECTION_DEFINITIONS.map((definition) => definition.departmentCode),
	);
	const requestedDepartmentCodes = new Set(departmentDefinitions.map((definition) => definition.code));
	const mappedSections = POSITION_BEARING_SECTION_DEFINITIONS.filter((definition) =>
		requestedDepartmentCodes.has(definition.departmentCode),
	);
	const fallbackSections = departmentDefinitions
		.filter((definition) => !mappedDepartmentCodes.has(definition.code))
		.map(
			(definition): SectionDefinition => ({
				name: `${definition.name} Operations`,
				code: `${definition.code}-OPS`,
				description: `${definition.name} operations section`,
				departmentCode: definition.code,
				isHr: definition.isHr,
			}),
		);

	return [...mappedSections, ...fallbackSections];
};

export const SECTION_DEFINITIONS: SectionDefinition[] =
	buildSectionDefinitions(DEPARTMENT_DEFINITIONS);

export const POSITION_DEFINITIONS: PositionDefinition[] = [
	{
		title: "Chief Executive Officer",
		code: "EXEC-CEO",
		description: "Chief Executive Officer",
		departmentCode: "EXEC",
		sectionCode: "EXEC-OFFICE",
		levelNames: ["Director"],
		minSalary: 80000,
		maxSalary: 150000,
	},
	{
		title: "Human Resources",
		code: "HR-MGR",
		description: "Human Resources role",
		departmentCode: "HR",
		sectionCode: "HR-OPS",
		levelNames: ["Manager", "Director"],
		minSalary: 30000,
		maxSalary: 55000,
	},
	{
		title: "HR Specialist",
		code: "HR-SUP",
		description: "HR services specialist role",
		departmentCode: "HR",
		sectionCode: "HR-ER",
		levelNames: ["Mid", "Senior"],
		minSalary: 24000,
		maxSalary: 42000,
	},
	{
		title: "HR Generalist",
		code: "HR-GEN",
		description: "HR support and employee services role",
		departmentCode: "HR",
		sectionCode: "HR-OPS",
		levelNames: ["Entry", "Junior", "Mid", "Senior"],
		minSalary: 20000,
		maxSalary: 36000,
	},

	{
		title: "Software Engineering",
		code: "SW-MGR",
		description: "Software engineering role",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		levelNames: ["Manager", "Director"],
		minSalary: 32000,
		maxSalary: 70000,
	},
	{
		title: "Systems Engineer",
		code: "SW-SUP",
		description: "Software systems engineering role",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		levelNames: ["Mid", "Senior"],
		minSalary: 26000,
		maxSalary: 56000,
	},

	{
		title: "Software Developer",
		code: "SW-DEV",
		description: "Software application development role",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		levelNames: ["Entry", "Junior", "Mid", "Senior"],
		minSalary: 20000,
		maxSalary: 60000,
	},
	{
		title: "Deputy GM",
		code: "DGM",
		description: "Deputy general manager",
		departmentCode: "STRAT-PLAN",
		sectionCode: "SP-CORP",
		levelNames: ["Director"],
		minSalary: 120000,
		maxSalary: 180000,
	},
	{
		title: "Senior Engineer",
		code: "SR-ENG",
		description: "Senior engineer",
		departmentCode: "PROJ-ENG",
		sectionCode: "PE-PROJ",
		levelNames: ["Senior"],
		minSalary: 70000,
		maxSalary: 120000,
	},
	{
		title: "Senior Supervisor",
		code: "SR-SUP",
		description: "Senior supervisor",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-SUP",
		levelNames: ["Senior"],
		minSalary: 50000,
		maxSalary: 85000,
	},
	{
		title: "Senior Manager",
		code: "SR-MGR",
		description: "Senior manager",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Manager"],
		minSalary: 90000,
		maxSalary: 150000,
	},
	{
		title: "Assistant Manager",
		code: "ASST-MGR",
		description: "Assistant manager",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Manager"],
		minSalary: 70000,
		maxSalary: 110000,
	},
	{
		title: "Operations Manager",
		code: "MGR",
		description: "Manager",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Manager"],
		minSalary: 65000,
		maxSalary: 105000,
	},
	{
		title: "Supervisor",
		code: "SUP",
		description: "Supervisor",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-SUP",
		levelNames: ["Senior"],
		minSalary: 45000,
		maxSalary: 75000,
	},
	{
		title: "Senior Staff",
		code: "SR-STF",
		description: "Senior staff",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Senior"],
		minSalary: 35000,
		maxSalary: 60000,
	},
	{
		title: "Junior Supervisor",
		code: "JR-SUP",
		description: "Junior supervisor",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-SUP",
		levelNames: ["Junior"],
		minSalary: 32000,
		maxSalary: 55000,
	},
	{
		title: "Operations Staff",
		code: "STF",
		description: "Staff",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Mid", "Staff"],
		minSalary: 22000,
		maxSalary: 42000,
	},
	{
		title: "Engineer",
		code: "ENG",
		description: "Engineer",
		departmentCode: "PROJ-ENG",
		sectionCode: "PE-PROJ",
		levelNames: ["Mid"],
		minSalary: 30000,
		maxSalary: 70000,
	},
	{
		title: "Senior Operator",
		code: "SR-OPR",
		description: "Senior operator",
		departmentCode: "ASM",
		sectionCode: "ASM-LINE",
		levelNames: ["Senior"],
		minSalary: 30000,
		maxSalary: 50000,
	},
	{
		title: "Staff Engineer",
		code: "STF-ENG",
		description: "Staff engineer",
		departmentCode: "PROJ-ENG",
		sectionCode: "PE-PROJ",
		levelNames: ["Mid", "Staff"],
		minSalary: 32000,
		maxSalary: 72000,
	},
	{
		title: "Operator",
		code: "OPR",
		description: "Operator",
		departmentCode: "ASM",
		sectionCode: "ASM-LINE",
		levelNames: ["Entry"],
		minSalary: 20000,
		maxSalary: 38000,
	},
	{
		title: "Junior Engineer",
		code: "JR-ENG",
		description: "Junior engineer",
		departmentCode: "PROJ-ENG",
		sectionCode: "PE-PROJ",
		levelNames: ["Junior"],
		minSalary: 24000,
		maxSalary: 50000,
	},
	{
		title: "President",
		code: "PRES",
		description: "President",
		departmentCode: "STRAT-PLAN",
		sectionCode: "SP-CORP",
		levelNames: ["Director"],
		minSalary: 150000,
		maxSalary: 220000,
	},
	{
		title: "General Manager",
		code: "GM",
		description: "General manager",
		departmentCode: "STRAT-PLAN",
		sectionCode: "SP-CORP",
		levelNames: ["Director"],
		minSalary: 130000,
		maxSalary: 190000,
	},
	{
		title: "Specialist",
		code: "SPEC",
		description: "Specialist",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Mid"],
		minSalary: 28000,
		maxSalary: 52000,
	},
	{
		title: "Junior Specialist",
		code: "JR-SPEC",
		description: "Junior specialist",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Junior"],
		minSalary: 22000,
		maxSalary: 40000,
	},
	{
		title: "Technician",
		code: "TECH",
		description: "Technician",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-TECH",
		levelNames: ["Entry"],
		minSalary: 22000,
		maxSalary: 40000,
	},
	{
		title: "Management Trainee",
		code: "MGMT-TRN",
		description: "Management trainee",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-OPS",
		levelNames: ["Entry"],
		minSalary: 18000,
		maxSalary: 32000,
	},
	{
		title: "Factory Manager",
		code: "FACT-MGR",
		description: "Factory manager",
		departmentCode: "PROD-ADMIN",
		sectionCode: "PA-SUP",
		levelNames: ["Manager"],
		minSalary: 80000,
		maxSalary: 140000,
	},
];

const BULK_ONLY_DEPARTMENT_DEFINITIONS: DepartmentDefinition[] = [
	{
		name: "Finance",
		code: "FIN",
		description: "Finance, accounting, and payroll operations",
		isHr: false,
	},
	{
		name: "Operations",
		code: "OPS",
		description: "Business operations and service delivery",
		isHr: false,
	},
];

const BULK_ONLY_POSITION_DEFINITIONS: PositionDefinition[] = [
	{
		title: "Financial Planning",
		code: "FIN-MGR",
		description: "Financial planning role",
		departmentCode: "FIN",
		sectionCode: "FIN-PLAN",
		levelNames: ["Manager", "Director"],
		minSalary: 36000,
		maxSalary: 72000,
	},
	{
		title: "Finance Lead",
		code: "FIN-SUP",
		description: "Finance team lead role",
		departmentCode: "FIN",
		sectionCode: "FIN-OPS",
		levelNames: ["Mid", "Senior"],
		minSalary: 28000,
		maxSalary: 52000,
	},
	{
		title: "Finance Analyst",
		code: "FIN-ANL",
		description: "Finance analyst role",
		departmentCode: "FIN",
		sectionCode: "FIN-OPS",
		levelNames: ["Entry", "Junior", "Mid", "Senior"],
		minSalary: 22000,
		maxSalary: 48000,
	},
	{
		title: "Service Delivery",
		code: "OPS-MGR",
		description: "Service delivery role",
		departmentCode: "OPS",
		sectionCode: "OPS-DELIVERY",
		levelNames: ["Manager", "Director"],
		minSalary: 34000,
		maxSalary: 68000,
	},
	{
		title: "Operations Lead",
		code: "OPS-SUP",
		description: "Operations team lead role",
		departmentCode: "OPS",
		sectionCode: "OPS-SUPPORT",
		levelNames: ["Mid", "Senior"],
		minSalary: 27000,
		maxSalary: 50000,
	},
	{
		title: "Operations Associate",
		code: "OPS-ASC",
		description: "Operations associate role",
		departmentCode: "OPS",
		sectionCode: "OPS-DELIVERY",
		levelNames: ["Entry", "Junior", "Mid", "Senior"],
		minSalary: 21000,
		maxSalary: 44000,
	},
];

const BULK_DEPARTMENT_DEFINITIONS = [
	...DEPARTMENT_DEFINITIONS,
	...BULK_ONLY_DEPARTMENT_DEFINITIONS,
];

const BULK_SECTION_DEFINITIONS = buildSectionDefinitions(BULK_DEPARTMENT_DEFINITIONS);

const BULK_POSITION_DEFINITIONS = [
	...POSITION_DEFINITIONS,
	...BULK_ONLY_POSITION_DEFINITIONS,
];

export const EMPLOYEE_DEFINITIONS: SeedEmployeeDefinition[] = [
	{
		// Display names only — login remains email/userName from email local-part.
		firstName: "Ramon",
		lastName: "Villanueva",
		email: "ceo@seed.local",
		employeeCode: "EMP-EXEC-CEO-001",
		role: "hris-employee-manager",
		departmentCode: "EXEC",
		sectionCode: "EXEC-OFFICE",
		positionCode: "EXEC-CEO",
		levelName: "Director",
		salary: 100000,
		isDepartmentManager: true,
		includeOvertime: false,
		// Demo CEO: clean attendance for Perfect Attendance report / QA.
		perfectAttendance: true,
	},
	{
		firstName: "Maria",
		lastName: "Santos",
		email: "hr-manager@seed.local",
		employeeCode: "EMP-HR-MGR-001",
		role: "hris-hr-manager",
		departmentCode: "HR",
		sectionCode: "HR-OPS",
		positionCode: "HR-MGR",
		levelName: "Manager",
		salary: 35000,
		reportsToEmail: "ceo@seed.local",
		isDepartmentManager: true,
		includeOvertime: true,
	},
	{
		firstName: "Ana",
		lastName: "Reyes",
		email: "hr-user@seed.local",
		employeeCode: "EMP-HR-STAFF-001",
		role: "hris-hr-user",
		departmentCode: "HR",
		sectionCode: "HR-OPS",
		positionCode: "HR-GEN",
		levelName: "Senior",
		salary: 22000,
		reportsToEmail: "hr-manager@seed.local",
		includeOvertime: true,
	},
	{
		firstName: "Carlos",
		lastName: "Dela Cruz",
		email: "manager@seed.local",
		employeeCode: "EMP-SW-MGR-001",
		role: "hris-employee-manager",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		positionCode: "SW-MGR",
		levelName: "Manager",
		salary: 40000,
		reportsToEmail: "ceo@seed.local",
		isDepartmentManager: true,
		includeOvertime: false,
	},
	{
		firstName: "Jose",
		lastName: "Garcia",
		email: "supervisor@seed.local",
		employeeCode: "EMP-SW-SUP-001",
		role: "hris-employee-manager",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		positionCode: "SW-SUP",
		levelName: "Senior",
		salary: 32000,
		reportsToEmail: "manager@seed.local",
		includeOvertime: false,
	},
	{
		firstName: "Miguel",
		lastName: "Torres",
		email: "supervisor-report@seed.local",
		employeeCode: "EMP-SW-DEV-002",
		role: "hris-employee",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		positionCode: "SW-DEV",
		levelName: "Junior",
		salary: 23000,
		reportsToEmail: "supervisor@seed.local",
		includeOvertime: true,
	},
	{
		firstName: "Juan",
		lastName: "Mendoza",
		email: "employee@seed.local",
		employeeCode: "EMP-SW-DEV-001",
		role: "hris-employee",
		departmentCode: "SW",
		sectionCode: "SW-ENG",
		positionCode: "SW-DEV",
		levelName: "Mid",
		salary: 25000,
		reportsToEmail: "manager@seed.local",
		includeOvertime: true,
	},
];

const BASELINE_SEED_EMPLOYEE_CODES = new Set(
	EMPLOYEE_DEFINITIONS.map((definition) => definition.employeeCode),
);

export const getGeneralEmployeeSeedPreview = () => ({
	levels: LEVEL_DEFINITIONS.map((definition) => ({ ...definition })),
	departments: DEPARTMENT_DEFINITIONS.map((definition) => ({ ...definition })),
	sections: SECTION_DEFINITIONS.map((definition) => ({ ...definition })),
	positions: POSITION_DEFINITIONS.map((definition) => ({ ...definition })),
	employees: EMPLOYEE_DEFINITIONS.map((definition) => ({ ...definition })),
});

type DemoRequestResetOptions = {
	organizationId: string;
	sourceLabel?: string;
	employeeCount?: number;
};

type DemoRequestResetResult = {
	sourceLabel: string;
	resolvedEmployeeCount: number;
	deletedRequestCount: number;
	deletedStepExecutionCount: number;
	clearedTimesheetEditPermissionCount: number;
	rebuilt: boolean;
};

const PH_UTC_OFFSET_MINUTES = 8 * 60;

const createDateAtHour = (base: Date, hour: number, minute: number) => {
	const date = new Date(base);
	date.setUTCHours(hour, minute, 0, 0);
	return date;
};

const createDateAtPhilippineMinutes = (base: Date, philippineTotalMinutes: number) => {
	const date = new Date(base);
	date.setUTCHours(0, 0, 0, 0);
	date.setUTCMinutes(philippineTotalMinutes - PH_UTC_OFFSET_MINUTES);
	return date;
};

const DEFAULT_SEED_PASSWORD = "Password123!";
const DEFAULT_GENERAL_SEED_TIMESHEETS_PER_EMPLOYEE = 2;
const GOVERNMENT_DOCUMENT_TYPES = ["TIN", "SSS", "PHILHEALTH", "PAGIBIG"] as const;
const SEEDED_EMPLOYEE_DOCUMENT_TYPES = [
	"CONTRACT",
	...GOVERNMENT_DOCUMENT_TYPES,
	"VALID_ID",
	"MEDICAL_CERTIFICATE",
] as const;
const SEED_201_TEMPLATE_ROOT = path.resolve(__dirname, "../../assets/201-TEMPLATES");
const SEEDED_EMPLOYEE_DOCUMENT_FOLDER = "employees/documents/seeds/201-files";
const BULK_BACKDATED_SOURCE_LABEL = "bulkBackdatedEmployeeSeeder";
const DEFAULT_BULK_SEED_EMPLOYEE_COUNT = 30;
const DEFAULT_BULK_SEED_TIMESHEETS_PER_EMPLOYEE = 3;
const MIN_BULK_DEPARTMENT_EMPLOYEE_COUNT =
	EMPLOYEE_DEFINITIONS.length + BULK_ONLY_DEPARTMENT_DEFINITIONS.length;
const parsePositiveIntEnv = (name: string, fallback: number) => {
	const raw = process.env[name];
	if (!raw) return fallback;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};
const SEED_PROVISION_CONCURRENCY = parsePositiveIntEnv("SEED_PROVISION_CONCURRENCY", 4);
const SEED_ARTIFACT_CONCURRENCY = parsePositiveIntEnv("SEED_ARTIFACT_CONCURRENCY", 2);
const SEED_REQUEST_CONCURRENCY = parsePositiveIntEnv("SEED_REQUEST_CONCURRENCY", 1);
const SEED_ATTENDANCE_DAY_BATCH_SIZE = parsePositiveIntEnv("SEED_ATTENDANCE_DAY_BATCH_SIZE", 10);
const SEED_TX_MAX_WAIT_MS = parsePositiveIntEnv("SEED_TX_MAX_WAIT_MS", 10000);
const SEED_TX_TIMEOUT_MS = parsePositiveIntEnv("SEED_TX_TIMEOUT_MS", 30000);
const conflictCounters = {
	requestCreateConflicts: 0,
	requestUpdateConflicts: 0,
	requestApprovalConflicts: 0,
};
const seedDocumentUploadCounters = {
	attempted: 0,
	succeeded: 0,
	failed: 0,
	skipped: 0,
};

type SeedDocumentAssetSpec = {
	documentTypeCode: (typeof SEEDED_EMPLOYEE_DOCUMENT_TYPES)[number];
	entryName: string;
	isDirectory: boolean;
};

type SeedDocumentAsset = {
	documentTypeCode: (typeof SEEDED_EMPLOYEE_DOCUMENT_TYPES)[number];
	assetFolderName: string;
	assetFileName: string;
	relativePath: string;
	absolutePath: string;
	ext: string | null;
};

let seededEmployeeDocumentAssetsPromise: Promise<Map<string, SeedDocumentAsset[]>> | null = null;

const SEED_DOCUMENT_ASSET_SPECS: SeedDocumentAssetSpec[] = [
	{ documentTypeCode: "CONTRACT", entryName: "Company Contract.png", isDirectory: false },
	{ documentTypeCode: "TIN", entryName: "TIN ID", isDirectory: true },
	{ documentTypeCode: "SSS", entryName: "SSS ID", isDirectory: true },
	{ documentTypeCode: "PHILHEALTH", entryName: "Philhealth ID", isDirectory: true },
	{ documentTypeCode: "PAGIBIG", entryName: "PAG IBIG ID", isDirectory: true },
	{ documentTypeCode: "VALID_ID", entryName: "National ID", isDirectory: true },
	{ documentTypeCode: "MEDICAL_CERTIFICATE", entryName: "MEDICAL CERT.png", isDirectory: false },
];

const sanitizeSeedStorageSegment = (value: string) =>
	String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "") || "seed";

const getSeedFileExtension = (fileName: string): string | null => {
	const ext = path.extname(fileName || "").replace(/^\./, "").trim().toLowerCase();
	return ext || null;
};

const collectAssetFilesRecursively = (targetPath: string): string[] => {
	const entries = fs.readdirSync(targetPath, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const absolutePath = path.join(targetPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectAssetFilesRecursively(absolutePath));
			continue;
		}
		if (entry.isFile()) {
			files.push(absolutePath);
		}
	}
	return files;
};

const loadSeededEmployeeDocumentAssets = async (): Promise<Map<string, SeedDocumentAsset[]>> => {
	if (!seededEmployeeDocumentAssetsPromise) {
		seededEmployeeDocumentAssetsPromise = Promise.resolve().then(() => {
			const assetMap = new Map<string, SeedDocumentAsset[]>();

			for (const spec of SEED_DOCUMENT_ASSET_SPECS) {
				const targetPath = path.join(SEED_201_TEMPLATE_ROOT, spec.entryName);
				if (!fs.existsSync(targetPath)) {
					throw new Error(
						`Missing seeded employee document asset: ${path.relative(process.cwd(), targetPath)}`,
					);
				}

				const absoluteFiles = spec.isDirectory
					? collectAssetFilesRecursively(targetPath)
					: [targetPath];
				const assets = absoluteFiles
					.filter((filePath) => fs.statSync(filePath).isFile())
					.map((absolutePath) => ({
						documentTypeCode: spec.documentTypeCode,
						assetFolderName: spec.isDirectory ? spec.entryName : "201-TEMPLATES",
						assetFileName: path.basename(absolutePath),
						relativePath: path
							.relative(SEED_201_TEMPLATE_ROOT, absolutePath)
							.replace(/\\/g, "/"),
						absolutePath,
						ext: getSeedFileExtension(absolutePath),
					}))
					.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

				if (assets.length === 0) {
					throw new Error(
						`No files found for seeded document asset entry: ${spec.entryName} (${spec.documentTypeCode})`,
					);
				}

				assetMap.set(spec.documentTypeCode, assets);
			}

			return assetMap;
		});
	}

	return seededEmployeeDocumentAssetsPromise;
};

const selectSeedDocumentAsset = (params: {
	documentTypeCode: (typeof SEEDED_EMPLOYEE_DOCUMENT_TYPES)[number];
	employeeSeedIndex: number;
	assetMap: Map<string, SeedDocumentAsset[]>;
}) => {
	const assets = params.assetMap.get(params.documentTypeCode) || [];
	if (assets.length === 0) {
		throw new Error(`No seeded asset configured for document type ${params.documentTypeCode}`);
	}

	const normalizedIndex = Math.max(0, params.employeeSeedIndex);
	return assets[normalizedIndex % assets.length];
};

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
	const size = Math.max(1, chunkSize);
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};
const BULK_FIRST_NAMES = [
	"Adrian",
	"Bea",
	"Carlo",
	"Diana",
	"Ethan",
	"Faith",
	"Gian",
	"Hanna",
	"Ian",
	"Jessa",
	"Kevin",
	"Lara",
	"Miguel",
	"Nina",
	"Owen",
	"Paula",
	"Quinn",
	"Rhea",
	"Sean",
	"Talia",
	"Uriel",
	"Vera",
	"Warren",
	"Xyra",
	"Yuri",
	"Zara",
] as const;
const BULK_LAST_NAMES = [
	"Alvarez",
	"Bautista",
	"Cruz",
	"Dela Rosa",
	"Enriquez",
	"Flores",
	"Garcia",
	"Hernandez",
	"Ilagan",
	"Jimenez",
	"Lopez",
	"Mendoza",
	"Navarro",
	"Ocampo",
	"Pascual",
	"Quebral",
	"Reyes",
	"Santos",
	"Torres",
	"Umali",
	"Valdez",
	"Wilson",
	"Yap",
	"Zamora",
] as const;

type BulkHierarchyConfig = {
	departmentCode: string;
	rootManagerEmail: string;
	managerRole: SeedAuthRoleKey;
	staffRole: SeedAuthRoleKey;
	managerPositionCode: string;
	supervisorPositionCode: string;
	staffPositionCode: string;
	staffEmployeeCodePrefix: string;
	managerEmployeeCodePrefix: string;
	supervisorEmployeeCodePrefix: string;
	managerSalaryBase: number;
	managerSalaryVariance: number;
	supervisorSalaryBase: number;
	supervisorSalaryVariance: number;
	staffSalaryBase: number;
	staffSalaryVariance: number;
	staffLevelNames: readonly string[];
	managerSpan: number;
	supervisorSpan: number;
	minEmployeesForManager: number;
	minEmployeesForSupervisor: number;
	requiresDepartmentManager?: boolean;
};

const getSeedYear = () => new Date().getUTCFullYear();
const getSeedHireDate = () => new Date(Date.UTC(getSeedYear(), 0, 1, 0, 0, 0, 0));
const getSeedStartDate = () => new Date(Date.UTC(getSeedYear(), 0, 1, 0, 0, 0, 0));
const getSeedCurrentMonthStartDate = () =>
	new Date(Date.UTC(getSeedYear(), new Date().getUTCMonth(), 1, 0, 0, 0, 0));
const getSeedBackdateEndDate = () => new Date(getSeedCurrentMonthStartDate().getTime() - 1);
const getSeedTodayDate = () => {
	const today = new Date();
	return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
};

const getMondayAnchorUtc = (date: Date): Date => {
	const anchored = new Date(date);
	anchored.setUTCHours(0, 0, 0, 0);
	const day = anchored.getUTCDay(); // 0=Sun..6=Sat
	const diffToMonday = day === 0 ? -6 : 1 - day;
	anchored.setUTCDate(anchored.getUTCDate() + diffToMonday);
	return anchored;
};

const hashSeed = (value: string): number => {
	// FNV-1a (32-bit) for better deterministic spread across similar seed strings.
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

type SeedScenarioOptions = {
	employeeCount?: number;
	timesheetsPerEmployee?: number;
	resumeFromEmployeeEmail?: string;
	resumeFromLastCheckpoint?: boolean;
	resumeFromDatabase?: boolean;
	enableProgressCheckpoint?: boolean;
	executionMode?: "perEmployee" | "phased";
	sourceLabel?: string;
	logLabel?: string;
	prismaClient?: PrismaClient;
	organizationId?: string;
	projectDefaults?: Awaited<ReturnType<typeof seedProjectDefaults>>;
	seedConfig?: {
		skipEmployeeDocumentUploads?: boolean;
		generateBackdatedOperationalData?: boolean;
		generateDemoRequests?: boolean;
		skipTodayAttendance?: boolean;
	};
};

type SeedEmployeeProvisionResult = {
	employee: Awaited<ReturnType<typeof prisma.employee.create>>;
	userName: string;
	authMode: SeedAuthModeAdapter["mode"];
	authUserSource: "created" | "existing" | "fallback";
	authUserIsNew: boolean;
	employeeAction: "created" | "updated";
};

type SeedCredentialExportRow = {
	email: string;
	userName: string;
	password: string;
	role: string;
	employeeCode: string;
	firstName: string;
	lastName: string;
	departmentCode: string;
	departmentName: string;
	positionCode: string;
	levelName: string;
	reportsToEmail: string;
	authMode: string;
	authUserSource: string;
	employeeAction: string;
	scheduleTemplateCode: string;
	scheduleTemplateName: string;
	leaveBalanceSummary: string;
};

type SeedCredentialExportPayload = {
	generatedAt: string;
	sourceLabel: string;
	totalEmployees: number;
	rows: SeedCredentialExportRow[];
};

type SeedProgressCheckpoint = {
	updatedAt: string;
	sourceLabel: string;
	status: "in_progress" | "failed" | "completed";
	executionMode: "perEmployee" | "phased";
	totalEmployees: number;
	currentPhase?: "provision" | "artifacts" | "completed";
	lastCompletedEmployeeEmail: string | null;
	lastCompletedEmployeeIndex: number;
	lastProvisionedEmployeeEmail?: string | null;
	lastProvisionedEmployeeIndex?: number;
	lastArtifactEmployeeEmail?: string | null;
	lastArtifactEmployeeIndex?: number;
	timesheetsPerEmployee: number;
};

const resolveSeedScenarioOptions = (options?: SeedScenarioOptions) => ({
	employeeCount: Math.max(
		EMPLOYEE_DEFINITIONS.length,
		options?.employeeCount ?? EMPLOYEE_DEFINITIONS.length,
	),
	timesheetsPerEmployee: Math.max(
		1,
		options?.timesheetsPerEmployee ?? DEFAULT_GENERAL_SEED_TIMESHEETS_PER_EMPLOYEE,
	),
	resumeFromEmployeeEmail: options?.resumeFromEmployeeEmail?.trim() || undefined,
	resumeFromLastCheckpoint: options?.resumeFromLastCheckpoint ?? false,
	resumeFromDatabase: options?.resumeFromDatabase ?? false,
	enableProgressCheckpoint: options?.enableProgressCheckpoint ?? false,
	executionMode: options?.executionMode || "perEmployee",
	sourceLabel: options?.sourceLabel || "generalEmployeeSeeder",
	logLabel: options?.logLabel || "General employee seeding",
	seedConfig: {
		skipEmployeeDocumentUploads: options?.seedConfig?.skipEmployeeDocumentUploads ?? false,
		generateBackdatedOperationalData:
			options?.seedConfig?.generateBackdatedOperationalData ?? true,
		generateDemoRequests: options?.seedConfig?.generateDemoRequests ?? false,
		skipTodayAttendance: options?.seedConfig?.skipTodayAttendance ?? false,
	},
});

const logSeedStep = (message: string) => {
	console.log(`[seed] ${message}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientPrismaWriteConflict = (error: unknown) => {
	if (!error || typeof error !== "object") return false;
	return (
		"code" in error &&
		["P2034", "P2028"].includes(String((error as { code?: string }).code || ""))
	);
};

const isTimesheetUniqueConstraintConflict = (error: unknown) => {
	if (!error || typeof error !== "object") return false;
	const code = String((error as { code?: string }).code || "");
	if (code !== "P2002") return false;
	const target = String((error as { meta?: { target?: unknown } }).meta?.target || "");
	return target.includes("timesheets_organizationId_employeeId_payrollPeriodId_key");
};

const deleteRegeneratingSeedTimesheet = async (params: {
	organizationId: string;
	employeeId: string;
	payrollPeriodId: string;
	timesheetId: string;
}) => {
	await prisma.attendanceObligation.updateMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: params.payrollPeriodId,
			timesheetId: params.timesheetId,
		},
		data: {
			timesheetId: null,
			timesheetlineId: null,
		},
	});

	await prisma.attendance.updateMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			timesheetId: params.timesheetId,
		},
		data: {
			timesheetId: null,
		},
	});

	await prisma.employeePayroll.updateMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: params.payrollPeriodId,
			timesheetId: params.timesheetId,
		},
		data: {
			timesheetId: null,
		},
	});

	await prisma.timesheetline.deleteMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: params.payrollPeriodId,
			timesheetId: params.timesheetId,
		},
	});

	await prisma.timesheet.deleteMany({
		where: {
			id: params.timesheetId,
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			payrollPeriodId: params.payrollPeriodId,
		},
	});
};

const isTransientSeedUploadError = (message?: string | null) => {
	const normalized = String(message || "").toLowerCase();
	return [
		"timeout",
		"request timeout",
		"econnreset",
		"etimedout",
		"socket hang up",
		"temporarily unavailable",
		"rate limit",
	].some((needle) => normalized.includes(needle));
};

const uploadSeedDocumentWithRetry = async (
	buffer: Buffer,
	options: Parameters<typeof uploadToCloudinary>[1],
	contextLabel: string,
) => {
	const retryDelaysMs = [750, 1500, 3000];
	let lastResult: Awaited<ReturnType<typeof uploadToCloudinary>> | null = null;

	seedDocumentUploadCounters.attempted += 1;
	for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
		const result = await uploadToCloudinary(buffer, options);
		lastResult = result;
		if (result.success) {
			seedDocumentUploadCounters.succeeded += 1;
			return result;
		}

		const isRetryable = isTransientSeedUploadError(result.error);
		if (!isRetryable || attempt === retryDelaysMs.length) {
			seedDocumentUploadCounters.failed += 1;
			logSeedStep(
				`Document upload failed during ${contextLabel}: ${result.error || "Unknown upload error"}.`,
			);
			return result;
		}

		logSeedStep(
			`Document upload timeout during ${contextLabel}; retrying attempt ${attempt + 2}/${retryDelaysMs.length + 1}.`,
		);
		await sleep(retryDelaysMs[attempt] + Math.floor(Math.random() * 300));
	}

	seedDocumentUploadCounters.failed += 1;
	return lastResult || { success: false, error: "Upload did not complete" };
};

const nextSeedRequestCode = () => {
	const epochMs = Date.now();
	const random = Math.random().toString(36).slice(2, 8).toUpperCase();
	return `REQ-${epochMs}-${random}`;
};

const trackSeedConflictForContext = (contextLabel: string) => {
	if (contextLabel.includes("timesheet submission request create")) {
		conflictCounters.requestCreateConflicts += 1;
		return;
	}
	if (contextLabel.includes("timesheet submission request update")) {
		conflictCounters.requestUpdateConflicts += 1;
		return;
	}
	if (contextLabel.includes("timesheet request approval")) {
		conflictCounters.requestApprovalConflicts += 1;
	}
};

const withPrismaWriteRetry = async <T>(operation: () => Promise<T>, contextLabel: string) => {
	const retryDelaysMs = [200, 500, 1000, 1800, 2800];
	let lastError: unknown;

	for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (isTransientPrismaWriteConflict(error)) {
				trackSeedConflictForContext(contextLabel);
			}
			if (!isTransientPrismaWriteConflict(error) || attempt === retryDelaysMs.length) {
				if (attempt === retryDelaysMs.length && isTransientPrismaWriteConflict(error)) {
					logSeedStep(
						`Transient write conflict persisted after ${retryDelaysMs.length + 1} attempts during ${contextLabel}.`,
					);
				}
				throw error;
			}
			const jitterMs = Math.floor(Math.random() * 250);
			logSeedStep(
				`Transient write conflict during ${contextLabel}; retrying attempt ${attempt + 2}/${retryDelaysMs.length + 1}.`,
			);
			await sleep(retryDelaysMs[attempt] + jitterMs);
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const formatLeaveBalanceSummary = (leaveBalances: unknown) => {
	if (!Array.isArray(leaveBalances) || leaveBalances.length === 0) return "";

	return leaveBalances
		.map((entry) => {
			const item = (entry || {}) as Record<string, unknown>;
			const leaveType = String(item.leaveType || "UNKNOWN");
			const available = Number(item.available ?? 0);
			const totalEntitled = Number(item.totalEntitled ?? 0);
			return `${leaveType}:${available}/${totalEntitled}`;
		})
		.join(" | ");
};

const writeSeedCredentialsJson = async (params: {
	sourceLabel: string;
	totalEmployees: number;
	rows: SeedCredentialExportRow[];
}) => {
	const outputDir = path.join(__dirname, "exports");
	await fs.promises.mkdir(outputDir, { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filePath = path.join(outputDir, `${params.sourceLabel}-credentials-${timestamp}.json`);
	const payload: SeedCredentialExportPayload = {
		generatedAt: new Date().toISOString(),
		sourceLabel: params.sourceLabel,
		totalEmployees: params.totalEmployees,
		rows: params.rows,
	};

	await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
	return filePath;
};

const getSeedProgressCheckpointPath = (sourceLabel: string) =>
	path.join(__dirname, "exports", `${sourceLabel}-progress.json`);

const readSeedProgressCheckpoint = async (
	sourceLabel: string,
): Promise<SeedProgressCheckpoint | null> => {
	try {
		const filePath = getSeedProgressCheckpointPath(sourceLabel);
		const raw = await fs.promises.readFile(filePath, "utf-8");
		return JSON.parse(raw) as SeedProgressCheckpoint;
	} catch {
		return null;
	}
};

const resolveSeedDefinitionsForRequestDemo = async (params?: {
	sourceLabel?: string;
	employeeCount?: number;
}) => {
	const sourceLabel = params?.sourceLabel || "bulkBackdatedEmployeeSeeder";
	const checkpoint =
		params?.employeeCount === undefined ? await readSeedProgressCheckpoint(sourceLabel) : null;
	const resolvedEmployeeCount = Math.max(
		EMPLOYEE_DEFINITIONS.length,
		params?.employeeCount ??
			checkpoint?.totalEmployees ??
			(sourceLabel === BULK_BACKDATED_SOURCE_LABEL
				? DEFAULT_BULK_SEED_EMPLOYEE_COUNT
				: EMPLOYEE_DEFINITIONS.length),
	);
	const seedDefinitions =
		sourceLabel === BULK_BACKDATED_SOURCE_LABEL
			? generateBulkEmployeeDefinitions(resolvedEmployeeCount)
			: [...EMPLOYEE_DEFINITIONS];

	return {
		sourceLabel,
		resolvedEmployeeCount,
		seedDefinitions,
	};
};

const writeSeedProgressCheckpoint = async (checkpoint: SeedProgressCheckpoint) => {
	const outputDir = path.join(__dirname, "exports");
	await fs.promises.mkdir(outputDir, { recursive: true });
	const filePath = getSeedProgressCheckpointPath(checkpoint.sourceLabel);
	await fs.promises.writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf-8");
	return filePath;
};

const resolveExistingProjectDefaultsForResume = async (
	options?: Pick<SeedScenarioOptions, "organizationId">,
): Promise<SeedProjectDefaultsResult> => {
	const mode = (process.env.IDP_ENABLED === "true" ? "idp" : "local") as SeedProjectDefaultsResult["mode"];
	if (mode === "idp") {
		return seedProjectDefaults(prisma, {
			organizationId: options?.organizationId,
			ensureAdminUsers: false,
		});
	}

	const organization = options?.organizationId
		? await prisma.organization.findFirst({
				where: {
					id: options.organizationId,
					isDeleted: false,
				},
		  })
		: await prisma.organization.findFirst({
				where: {
					code: DEFAULT_COMPANY_PROFILE.code,
					isDeleted: false,
				},
		  });

	if (!organization) {
		return seedProjectDefaults(prisma, {
			organizationId: options?.organizationId,
			ensureAdminUsers: false,
		});
	}

	const roleIds = Object.values(HRIS_AUTH_ROLE_KEYS).reduce(
		(acc, key) => ({ ...acc, [key]: key }),
		{} as Record<SeedAuthRoleKey, string>,
	);

	return {
		mode,
		organizationId: organization.id,
		authOrganization: {
			id: organization.id,
			name: organization.name,
			code: organization.code,
		},
		roleIds,
		calculatorId: "",
		payrollPeriodId: "",
		period1Id: "",
		period2Id: "",
	};
};

const parseTimeToMinutes = (value?: string | null): number | null => {
	if (!value || !value.includes(":")) return null;
	const [hourStr, minuteStr] = value.split(":");
	const hour = Number(hourStr);
	const minute = Number(minuteStr);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	return hour * 60 + minute;
};

const deterministicInt = (seed: string, min: number, max: number) => {
	const range = max - min + 1;
	if (range <= 0) return min;
	const value = Math.abs(hashSeed(seed)) % range;
	return min + value;
};

const buildSeedPhoneNumber = (employeeCode: string) => {
	const base = hashSeed(employeeCode);
	return `09${String(100000000 + (base % 900000000)).padStart(9, "0")}`;
};

const buildSeedAddress = (employeeCode: string) => {
	const cities = ["Quezon City", "Makati City", "Taguig City", "Pasig City", "Mandaluyong City"];
	const base = hashSeed(employeeCode);
	const city = cities[base % cities.length];
	const zip = String(1000 + (base % 9000));
	return {
		street: `${100 + (base % 900)} Seed Street`,
		address2: "",
		city,
		state: "Metro Manila",
		country: "Philippines",
		postalCode: zip,
		zipCode: zip,
		houseNumber: String(1 + (base % 999)),
	};
};

const buildSeedIdentification = (employeeCode: string) => {
	const base = hashSeed(`${employeeCode}-NATIONAL_ID`);
	const p1 = String(1000 + (base % 9000)).padStart(4, "0");
	const p2 = String(1000 + ((base * 2) % 9000)).padStart(4, "0");
	const p3 = String(1000 + ((base * 3) % 9000)).padStart(4, "0");
	return {
		type: "national_id",
		number: `${p1}-${p2}-${p3}`,
		issuingCountry: "Philippines",
		expiryDate: new Date(new Date().getFullYear() + 5, 11, 31),
	};
};

/**
 * Varied seed DOBs (month from employeeCode hash).
 * Kiosk login shows a single current-month birthday via `kioskLoginSeeder`
 * (one parent employee), not every seeded employee.
 */
const buildSeedDateOfBirth = (employeeCode: string) => {
	const base = hashSeed(employeeCode);
	const year = 1988 + (base % 10);
	const month = base % 12;
	const day = 1 + (base % 28);
	return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

const buildGovernmentDocumentNumber = (
	employeeCode: string,
	type: (typeof GOVERNMENT_DOCUMENT_TYPES)[number],
) => {
	const base = hashSeed(`${employeeCode}-${type}`);

	if (type === "TIN") {
		const p1 = String(100 + (base % 900)).padStart(3, "0");
		const p2 = String(100 + ((base * 2) % 900)).padStart(3, "0");
		const p3 = String(100 + ((base * 3) % 900)).padStart(3, "0");
		const p4 = String(100 + ((base * 4) % 900)).padStart(3, "0");
		return `${p1}-${p2}-${p3}-${p4}`;
	}

	if (type === "SSS") {
		const p1 = String(10 + (base % 90)).padStart(2, "0");
		const p2 = String(1000000 + (base % 9000000)).padStart(7, "0");
		return `${p1}-${p2}-${(base % 10).toString()}`;
	}

	const p1 = String(1000 + (base % 9000)).padStart(4, "0");
	const p2 = String(100000000 + (base % 900000000)).padStart(9, "0");
	return `${p1}-${p2}`;
};

const buildSeededEmployeeDocumentNumber = (
	employeeCode: string,
	type: (typeof SEEDED_EMPLOYEE_DOCUMENT_TYPES)[number],
) => {
	if (GOVERNMENT_DOCUMENT_TYPES.includes(type as (typeof GOVERNMENT_DOCUMENT_TYPES)[number])) {
		return buildGovernmentDocumentNumber(
			employeeCode,
			type as (typeof GOVERNMENT_DOCUMENT_TYPES)[number],
		);
	}

	const base = hashSeed(`${employeeCode}-${type}`);

	if (type === "CONTRACT") {
		return `CTR-${employeeCode.replace(/[^A-Z0-9]+/gi, "").toUpperCase()}-${String(1000 + (base % 9000)).padStart(4, "0")}`;
	}

	if (type === "VALID_ID") {
		const p1 = String(1000 + (base % 9000)).padStart(4, "0");
		const p2 = String(1000 + ((base * 2) % 9000)).padStart(4, "0");
		const p3 = String(1000 + ((base * 3) % 9000)).padStart(4, "0");
		return `${p1}-${p2}-${p3}`;
	}

	if (type === "MEDICAL_CERTIFICATE") {
		return `MED-${String(100000 + (base % 900000)).padStart(6, "0")}`;
	}

	return `${type}-${String(100000 + (base % 900000)).padStart(6, "0")}`;
};

const getDepartmentDefinitionsForSource = (sourceLabel: string) =>
	sourceLabel === BULK_BACKDATED_SOURCE_LABEL ? BULK_DEPARTMENT_DEFINITIONS : DEPARTMENT_DEFINITIONS;

const getSectionDefinitionsForSource = (sourceLabel: string) =>
	sourceLabel === BULK_BACKDATED_SOURCE_LABEL ? BULK_SECTION_DEFINITIONS : SECTION_DEFINITIONS;

const getPositionDefinitionsForSource = (sourceLabel: string) =>
	sourceLabel === BULK_BACKDATED_SOURCE_LABEL ? BULK_POSITION_DEFINITIONS : POSITION_DEFINITIONS;

const getSectionCodeForPositionCode = (
	positionCode: string,
	positionDefinitions: PositionDefinition[] = BULK_POSITION_DEFINITIONS,
) => {
	const position = positionDefinitions.find((definition) => definition.code === positionCode);
	if (!position) {
		throw new Error(`Missing seed position definition for generated position ${positionCode}.`);
	}
	return position.sectionCode;
};

const normalizeSeedCatalogName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const assertUniqueSeedCatalog = (params: {
	sourceLabel: string;
	levels: LevelDefinition[];
	departments: DepartmentDefinition[];
	sections: SectionDefinition[];
	positions: PositionDefinition[];
}) => {
	const assertUnique = <T>(
		items: T[],
		label: string,
		resolveValue: (item: T) => string,
		resolveContext: (item: T) => string,
	) => {
		const seen = new Map<string, string>();
		for (const item of items) {
			const value = resolveValue(item);
			const normalized = normalizeSeedCatalogName(value);
			const previous = seen.get(normalized);
			if (previous) {
				throw new Error(
					`Duplicate ${label} in ${params.sourceLabel}: "${value}" (${previous}; ${resolveContext(item)}).`,
				);
			}
			seen.set(normalized, resolveContext(item));
		}
	};

	assertUnique(
		params.levels,
		"level name",
		(item) => item.name,
		(item) => `rank ${item.rank}`,
	);
	assertUnique(
		params.departments,
		"department name",
		(item) => item.name,
		(item) => `code ${item.code}`,
	);
	assertUnique(
		params.departments,
		"department code",
		(item) => item.code,
		(item) => `name ${item.name}`,
	);
	assertUnique(
		params.sections,
		"section code",
		(item) => item.code,
		(item) => `name ${item.name}; department ${item.departmentCode}`,
	);
	assertUnique(
		params.positions,
		"position title",
		(item) => item.title,
		(item) => `code ${item.code}`,
	);
	assertUnique(
		params.positions,
		"position code",
		(item) => item.code,
		(item) => `title ${item.title}`,
	);

	const normalizedLevelNames = new Set(
		params.levels.map((definition) => normalizeSeedCatalogName(definition.name)),
	);
	const positionWithLevelWord = params.positions.find((definition) =>
		normalizedLevelNames.has(normalizeSeedCatalogName(definition.title)),
	);
	if (positionWithLevelWord) {
		throw new Error(
			`Redundant seed catalog label in ${params.sourceLabel}: position "${positionWithLevelWord.title}" duplicates a level name.`,
		);
	}

	const departmentCodes = new Set(params.departments.map((definition) => definition.code));
	const sectionsByCode = new Map(params.sections.map((definition) => [definition.code, definition]));
	for (const section of params.sections) {
		if (!departmentCodes.has(section.departmentCode)) {
			throw new Error(
				`Section "${section.code}" in ${params.sourceLabel} references missing department "${section.departmentCode}".`,
			);
		}
	}
	for (const position of params.positions) {
		const section = sectionsByCode.get(position.sectionCode);
		if (!section) {
			throw new Error(
				`Position "${position.code}" in ${params.sourceLabel} references missing section "${position.sectionCode}".`,
			);
		}
		if (section.departmentCode !== position.departmentCode) {
			throw new Error(
				`Position "${position.code}" in ${params.sourceLabel} references section "${section.code}" from department "${section.departmentCode}" instead of "${position.departmentCode}".`,
			);
		}
	}
};

const distributeBulkEmployeesByDepartment = (additionalEmployeesNeeded: number) => {
	const weights = [
		{ key: "hr", weight: 0.14 },
		{ key: "sw", weight: 0.42 },
		{ key: "fin", weight: 0.2 },
		{ key: "ops", weight: 0.24 },
	] as const;
	const counts = Object.fromEntries(weights.map((item) => [item.key, 0])) as Record<
		(typeof weights)[number]["key"],
		number
	>;
	if (additionalEmployeesNeeded <= 0) return counts;

	counts.fin = additionalEmployeesNeeded >= 1 ? 1 : 0;
	counts.ops = additionalEmployeesNeeded >= 2 ? 1 : 0;

	let remaining = additionalEmployeesNeeded - counts.fin - counts.ops;
	for (const item of weights) {
		const nextCount = Math.floor(additionalEmployeesNeeded * item.weight);
		const addCount = Math.min(remaining, Math.max(0, nextCount - counts[item.key]));
		counts[item.key] += addCount;
		remaining -= addCount;
	}

	let cursor = 0;
	while (remaining > 0) {
		const item = weights[cursor % weights.length];
		counts[item.key] += 1;
		remaining -= 1;
		cursor += 1;
	}

	return counts;
};

const generateBulkEmployeeDefinitions = (employeeCount: number) => {
	const definitions = [...EMPLOYEE_DEFINITIONS];
	const resolvedEmployeeCount = Math.max(employeeCount, MIN_BULK_DEPARTMENT_EMPLOYEE_COUNT);
	const additionalEmployeesNeeded = Math.max(0, resolvedEmployeeCount - definitions.length);
	let serialCounter = 1;

	const nextPerson = () => {
		serialCounter++;
		const serial = String(serialCounter - 1).padStart(4, "0");
		const firstName = BULK_FIRST_NAMES[(serialCounter - 2) % BULK_FIRST_NAMES.length];
		const lastName =
			BULK_LAST_NAMES[
				Math.floor((serialCounter - 2) / BULK_FIRST_NAMES.length) % BULK_LAST_NAMES.length
			];
		return { serial, firstName, lastName };
	};

	const appendHierarchyEmployees = (count: number, config: BulkHierarchyConfig) => {
		if (count <= 0) return;

		const departmentManagerCount = config.requiresDepartmentManager ? 1 : 0;
		const availableCount = Math.max(0, count - departmentManagerCount);
		const managerCount =
			availableCount >= config.minEmployeesForManager
				? Math.max(1, Math.floor(availableCount / config.managerSpan))
				: 0;
		const remainingAfterManagers = Math.max(0, availableCount - managerCount);
		const supervisorCount =
			remainingAfterManagers >= config.minEmployeesForSupervisor
				? Math.max(1, Math.floor(remainingAfterManagers / config.supervisorSpan))
				: 0;
		const staffCount = Math.max(0, availableCount - managerCount - supervisorCount);

		const managerEmails: string[] = [];
		for (let index = 0; index < departmentManagerCount; index++) {
			const person = nextPerson();
			const managerEmail = `seed.${config.departmentCode.toLowerCase()}.department.manager@seed.local`;
			managerEmails.push(managerEmail);
			definitions.push({
				firstName: person.firstName,
				lastName: `${person.lastName} Department Manager`,
				email: managerEmail,
				employeeCode: `${config.managerEmployeeCodePrefix}-DEPT`,
				role: config.managerRole,
				departmentCode: config.departmentCode,
				sectionCode: getSectionCodeForPositionCode(config.managerPositionCode),
				positionCode: config.managerPositionCode,
				levelName: "Manager",
				salary:
					config.managerSalaryBase +
					deterministicInt(
						`bulk-salary-${config.departmentCode}-department-manager`,
						0,
						config.managerSalaryVariance,
					),
				reportsToEmail: config.rootManagerEmail,
				isDepartmentManager: true,
				includeOvertime: false,
			});
		}

		for (let index = 0; index < managerCount; index++) {
			const person = nextPerson();
			const managerEmail = `seed.${config.departmentCode.toLowerCase()}.manager.${person.serial}@seed.local`;
			managerEmails.push(managerEmail);
			definitions.push({
				firstName: person.firstName,
				lastName: `${person.lastName} Manager`,
				email: managerEmail,
				employeeCode: `${config.managerEmployeeCodePrefix}-${person.serial}`,
				role: config.managerRole,
				departmentCode: config.departmentCode,
				sectionCode: getSectionCodeForPositionCode(config.managerPositionCode),
				positionCode: config.managerPositionCode,
				levelName: "Manager",
				salary:
					config.managerSalaryBase +
					deterministicInt(
						`bulk-salary-${config.departmentCode}-manager-${person.serial}`,
						0,
						config.managerSalaryVariance,
					),
				reportsToEmail: config.rootManagerEmail,
				isDepartmentManager: false,
				includeOvertime: false,
			});
		}

		const supervisorEmails: string[] = [];
		for (let index = 0; index < supervisorCount; index++) {
			const person = nextPerson();
			const supervisorEmail = `seed.${config.departmentCode.toLowerCase()}.supervisor.${person.serial}@seed.local`;
			supervisorEmails.push(supervisorEmail);
			definitions.push({
				firstName: person.firstName,
				lastName: `${person.lastName} Supervisor`,
				email: supervisorEmail,
				employeeCode: `${config.supervisorEmployeeCodePrefix}-${person.serial}`,
				role: config.managerRole,
				departmentCode: config.departmentCode,
				sectionCode: getSectionCodeForPositionCode(config.supervisorPositionCode),
				positionCode: config.supervisorPositionCode,
				levelName: "Senior",
				salary:
					config.supervisorSalaryBase +
					deterministicInt(
						`bulk-salary-${config.departmentCode}-supervisor-${person.serial}`,
						0,
						config.supervisorSalaryVariance,
					),
				reportsToEmail:
					managerEmails[index % Math.max(1, managerEmails.length)] ||
					config.rootManagerEmail,
				isDepartmentManager: false,
				includeOvertime: false,
			});
		}

		for (let index = 0; index < staffCount; index++) {
			const person = nextPerson();
			const reportToEmail =
				supervisorEmails[index % Math.max(1, supervisorEmails.length)] ||
				managerEmails[index % Math.max(1, managerEmails.length)] ||
				config.rootManagerEmail;
			definitions.push({
				firstName: person.firstName,
				lastName: person.lastName,
				email: `seed.${config.departmentCode.toLowerCase()}.staff.${person.serial}@seed.local`,
				employeeCode: `${config.staffEmployeeCodePrefix}-${person.serial}`,
				role: config.staffRole,
				departmentCode: config.departmentCode,
				sectionCode: getSectionCodeForPositionCode(config.staffPositionCode),
				positionCode: config.staffPositionCode,
				levelName: config.staffLevelNames[index % config.staffLevelNames.length],
				salary:
					config.staffSalaryBase +
					deterministicInt(
						`bulk-salary-${config.departmentCode}-staff-${person.serial}`,
						0,
						config.staffSalaryVariance,
					),
				reportsToEmail: reportToEmail,
				isDepartmentManager: false,
				includeOvertime: true,
			});
		}
	};

	const departmentCounts = distributeBulkEmployeesByDepartment(additionalEmployeesNeeded);

	appendHierarchyEmployees(departmentCounts.hr, {
		departmentCode: "HR",
		rootManagerEmail: "hr-manager@seed.local",
		managerRole: "hris-hr-manager",
		staffRole: "hris-hr-user",
		managerPositionCode: "HR-MGR",
		supervisorPositionCode: "HR-SUP",
		staffPositionCode: "HR-GEN",
		staffEmployeeCodePrefix: "EMP-HR-STAFF",
		managerEmployeeCodePrefix: "EMP-HR-MGR",
		supervisorEmployeeCodePrefix: "EMP-HR-SUP",
		managerSalaryBase: 32000,
		managerSalaryVariance: 12000,
		supervisorSalaryBase: 26000,
		supervisorSalaryVariance: 9000,
		staffSalaryBase: 21000,
		staffSalaryVariance: 9000,
		staffLevelNames: ["Entry", "Junior", "Mid", "Senior"],
		managerSpan: 28,
		supervisorSpan: 10,
		minEmployeesForManager: 24,
		minEmployeesForSupervisor: 8,
	});

	appendHierarchyEmployees(departmentCounts.sw, {
		departmentCode: "SW",
		rootManagerEmail: "manager@seed.local",
		managerRole: "hris-employee-manager",
		staffRole: "hris-employee",
		managerPositionCode: "SW-MGR",
		supervisorPositionCode: "SW-SUP",
		staffPositionCode: "SW-DEV",
		staffEmployeeCodePrefix: "EMP-SW-DEV",
		managerEmployeeCodePrefix: "EMP-SW-MGR",
		supervisorEmployeeCodePrefix: "EMP-SW-SUP",
		managerSalaryBase: 42000,
		managerSalaryVariance: 15000,
		supervisorSalaryBase: 30000,
		supervisorSalaryVariance: 12000,
		staffSalaryBase: 24000,
		staffSalaryVariance: 18000,
		staffLevelNames: ["Entry", "Junior", "Mid", "Senior"],
		managerSpan: 30,
		supervisorSpan: 8,
		minEmployeesForManager: 20,
		minEmployeesForSupervisor: 6,
	});

	appendHierarchyEmployees(departmentCounts.fin, {
		departmentCode: "FIN",
		rootManagerEmail: "ceo@seed.local",
		managerRole: "hris-employee-manager",
		staffRole: "hris-employee",
		managerPositionCode: "FIN-MGR",
		supervisorPositionCode: "FIN-SUP",
		staffPositionCode: "FIN-ANL",
		staffEmployeeCodePrefix: "EMP-FIN-ANL",
		managerEmployeeCodePrefix: "EMP-FIN-MGR",
		supervisorEmployeeCodePrefix: "EMP-FIN-SUP",
		managerSalaryBase: 40000,
		managerSalaryVariance: 14000,
		supervisorSalaryBase: 30000,
		supervisorSalaryVariance: 10000,
		staffSalaryBase: 23000,
		staffSalaryVariance: 12000,
		staffLevelNames: ["Entry", "Junior", "Mid", "Senior"],
		managerSpan: 24,
		supervisorSpan: 8,
		minEmployeesForManager: 18,
		minEmployeesForSupervisor: 6,
		requiresDepartmentManager: true,
	});

	appendHierarchyEmployees(departmentCounts.ops, {
		departmentCode: "OPS",
		rootManagerEmail: "ceo@seed.local",
		managerRole: "hris-employee-manager",
		staffRole: "hris-employee",
		managerPositionCode: "OPS-MGR",
		supervisorPositionCode: "OPS-SUP",
		staffPositionCode: "OPS-ASC",
		staffEmployeeCodePrefix: "EMP-OPS-ASC",
		managerEmployeeCodePrefix: "EMP-OPS-MGR",
		supervisorEmployeeCodePrefix: "EMP-OPS-SUP",
		managerSalaryBase: 38000,
		managerSalaryVariance: 14000,
		supervisorSalaryBase: 29000,
		supervisorSalaryVariance: 10000,
		staffSalaryBase: 22000,
		staffSalaryVariance: 11000,
		staffLevelNames: ["Entry", "Junior", "Mid", "Senior"],
		managerSpan: 26,
		supervisorSpan: 8,
		minEmployeesForManager: 18,
		minEmployeesForSupervisor: 6,
		requiresDepartmentManager: true,
	});

	return definitions;
};

const orderBulkEmployeeDefinitionsByHierarchy = (
	definitions: SeedEmployeeDefinition[],
	departmentDefinitions: DepartmentDefinition[] = BULK_DEPARTMENT_DEFINITIONS,
) => {
	const departmentOrder = new Map(
		departmentDefinitions.map((definition, index) => [definition.code, index]),
	);
	const originalIndex = new Map(definitions.map((definition, index) => [definition.email, index]));
	const rankDefinition = (definition: SeedEmployeeDefinition) => {
		if (definition.isDepartmentManager && !definition.reportsToEmail) return 0;
		if (definition.isDepartmentManager) return 1;
		if (definition.levelName === "Manager" || definition.positionCode.endsWith("-MGR")) {
			return 2;
		}
		if (definition.positionCode.endsWith("-SUP") || definition.levelName === "Senior") {
			return 3;
		}
		return 4;
	};

	return [...definitions].sort((left, right) => {
		const rankDelta = rankDefinition(left) - rankDefinition(right);
		if (rankDelta !== 0) return rankDelta;

		const departmentDelta =
			(departmentOrder.get(left.departmentCode) ?? Number.MAX_SAFE_INTEGER) -
			(departmentOrder.get(right.departmentCode) ?? Number.MAX_SAFE_INTEGER);
		if (departmentDelta !== 0) return departmentDelta;

		return (originalIndex.get(left.email) ?? 0) - (originalIndex.get(right.email) ?? 0);
	});
};

const resolveBackdatedTargetPeriods = async (
	organizationId: string,
	timesheetsPerEmployee: number,
) => {
	const seedYear = getSeedYear();
	const yearStart = new Date(Date.UTC(seedYear, 0, 1, 0, 0, 0, 0));
	const seedToday = getSeedTodayDate();
	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			isDeleted: false,
			startDate: { gte: yearStart, lt: seedToday },
			endDate: { lt: seedToday },
		},
		select: {
			id: true,
			code: true,
			startDate: true,
			endDate: true,
			generationMetadata: true,
		},
		orderBy: {
			startDate: "desc",
		},
		take: Math.max(timesheetsPerEmployee * 4, 24),
	});

	const preferredPeriods = periods.filter((period) =>
		isDefaultSeedPayrollPeriodPattern(period.generationMetadata),
	);
	const targetPeriods =
		preferredPeriods.length >= timesheetsPerEmployee ? preferredPeriods : periods;

	if (targetPeriods.length < timesheetsPerEmployee) {
		throw new Error(
			`Expected at least ${timesheetsPerEmployee} completed payroll periods before ${seedToday.toISOString().split("T")[0]}, received ${targetPeriods.length}.`,
		);
	}

	return targetPeriods
		.slice(0, timesheetsPerEmployee)
		.sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
};

const isDefaultSeedPayrollPeriodPattern = (metadata: unknown) => {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
	return String((metadata as { cutoffPattern?: unknown }).cutoffPattern || "") === "1-15/16-end";
};

const resolveCurrentTargetPeriod = async (organizationId: string, seedToday: Date) => {
	const targetDateKey = seedToday.toISOString().split("T")[0];
	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			startDate: true,
			endDate: true,
			generationMetadata: true,
		},
		orderBy: {
			startDate: "desc",
		},
	});

	const activePeriods = periods.filter((period) => {
		const startKey = period.startDate.toISOString().split("T")[0];
		const endKey = period.endDate.toISOString().split("T")[0];
		return startKey <= targetDateKey && endKey >= targetDateKey;
	});
	const currentPeriod =
		activePeriods.find((period) =>
			isDefaultSeedPayrollPeriodPattern(period.generationMetadata),
		) || activePeriods[0];

	if (!currentPeriod) {
		throw new Error(`Expected an active payroll period containing ${targetDateKey}.`);
	}

	return currentPeriod;
};

const ensureTimesheetWorkflow = async (organizationId: string) => {
	const fallback = await getDefaultRequestWorkflow(prisma, organizationId, "TIMESHEET");
	if (!fallback) {
		throw new Error(
			`No TIMESHEET workflow template configured for organization ${organizationId}`,
		);
	}

	return fallback;
};

const getLatestTimesheetSubmissionRequest = async (params: {
	organizationId: string;
	timesheetId: string;
	requesterId: string;
}) => {
	const requests = await prisma.request.findMany({
		where: {
			organizationId: params.organizationId,
			requesterId: params.requesterId,
			type: "TIMESHEET",
			isDeleted: false,
		},
		select: {
			id: true,
			workflowInstanceId: true,
			currentWorkflowStateKey: true,
			metadata: true,
		},
		orderBy: { createdAt: "desc" },
		take: 20,
	});

	return requests.find((request) => {
		const metadata = ((request.metadata as Record<string, unknown> | null) || {}) as Record<
			string,
			unknown
		>;
		return (
			String(metadata.timesheetAction || "").toUpperCase() === "SUBMISSION" &&
			String(metadata.timesheetId || "") === params.timesheetId
		);
	});
};

const ensureTimesheetSubmissionRequest = async (params: {
	organizationId: string;
	timesheetId: string;
	timesheetCode: string;
	payrollPeriodCode?: string | null;
	requesterId: string;
	reason?: string;
	sourceLabel?: string;
}) => {
	const sourceLabel = params.sourceLabel || "generalEmployeeSeeder";
	const workflow = await ensureTimesheetWorkflow(params.organizationId);
	const requester = await prisma.employee.findFirst({
		where: {
			id: params.requesterId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			reportToId: true,
		},
	});

	if (!requester) {
		throw new Error(`Timesheet requester not found: ${params.requesterId}`);
	}

	const existing = await getLatestTimesheetSubmissionRequest({
		organizationId: params.organizationId,
		timesheetId: params.timesheetId,
		requesterId: requester.id,
	});
	const requestOperationType = !existing || !existing.workflowInstanceId ? "create" : "update";
	const now = new Date();

	const request = await prisma
		.$transaction(
			async (tx) => {
				if (!existing || !existing.workflowInstanceId) {
					const created = await tx.request.create({
						data: {
							organizationId: params.organizationId,
							code: nextSeedRequestCode(),
							type: "TIMESHEET",
							currentWorkflowStateKey: "OPEN",
							description: "Timesheet submission request",
							startDate: now,
							endDate: now,
							requester: {
								connect: { id: requester.id },
							},
							metadata: {
								timesheetAction: "SUBMISSION",
								timesheetId: params.timesheetId,
								timesheetCode: params.timesheetCode,
								employeeId: requester.id,
								periodCode: params.payrollPeriodCode ?? null,
								source: sourceLabel,
							} as any,
							notes: params.reason || null,
						},
					});

					await createRequestStepExecutions(tx, {
						organizationId: params.organizationId,
						requestId: created.id,
						steps: workflow.steps,
						workflowStates: workflow.states,
						workflowCode: workflow.code,
						workflowName: workflow.name,
						workflowDescription: workflow.description,
						requestType: "TIMESHEET",
						requesterId: requester.id,
						reportToId: requester.reportToId,
					});

					return created;
				}

				await tx.workflowStepExecution.updateMany({
					where: {
						requestId: existing.id,
						isDeleted: false,
					},
					data: {
						isDeleted: true,
					},
				});

				const updated = await tx.request.update({
					where: { id: existing.id },
					data: {
						currentWorkflowStateKey: "OPEN",
						currentStepExecutionId: null,
						lastCompletedStepExecutionId: null,
						workflowInstanceId: existing.workflowInstanceId,
						notes: params.reason ? params.reason : undefined,
						metadata: {
							...(((existing.metadata as Record<string, unknown> | null) ||
								{}) as Record<string, unknown>),
							timesheetAction: "SUBMISSION",
							timesheetId: params.timesheetId,
							timesheetCode: params.timesheetCode,
							employeeId: requester.id,
							periodCode: params.payrollPeriodCode ?? null,
							source: sourceLabel,
						} as any,
					},
				});

				await createRequestStepExecutions(tx, {
					organizationId: params.organizationId,
					requestId: updated.id,
					steps: workflow.steps,
					workflowStates: workflow.states,
					workflowCode: workflow.code,
					workflowName: workflow.name,
					workflowDescription: workflow.description,
					requestType: "TIMESHEET",
					requesterId: requester.id,
					reportToId: requester.reportToId,
				});

				return updated;
			},
			{ maxWait: SEED_TX_MAX_WAIT_MS, timeout: SEED_TX_TIMEOUT_MS },
		)
		.catch((error) => {
			if (isTransientPrismaWriteConflict(error)) {
				if (requestOperationType === "create") {
					conflictCounters.requestCreateConflicts += 1;
				} else {
					conflictCounters.requestUpdateConflicts += 1;
				}
			}
			throw error;
		});

	return request.id;
};

const ensureApprovedTimesheetSubmissionRequest = async (params: {
	organizationId: string;
	requestId: string;
	approverEmployeeId: string;
	sourceLabel?: string;
}) => {
	const sourceLabel = params.sourceLabel || "generalEmployeeSeeder";
	const request = await prisma.request.findFirst({
		where: {
			id: params.requestId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			currentWorkflowStateKey: true,
			currentStepExecutionId: true,
		},
	});

	if (!request) {
		throw new Error(`Timesheet request not found: ${params.requestId}`);
	}

	if (
		["APPROVED", "COMPLETED"].includes(
			String(request.currentWorkflowStateKey || "").toUpperCase(),
		)
	) {
		return;
	}

	const currentStep = request.currentStepExecutionId
		? await prisma.workflowStepExecution.findFirst({
				where: {
					id: request.currentStepExecutionId,
					requestId: request.id,
					isDeleted: false,
				},
				select: {
					id: true,
					status: true,
					stepType: true,
				},
			})
		: null;

	if (!currentStep || currentStep.stepType !== "APPROVAL") {
		return;
	}

	if (currentStep.status !== "APPROVED") {
		await prisma.workflowStepExecution.update({
			where: { id: currentStep.id },
			data: {
				status: "APPROVED",
				completedAt: new Date(),
				assigneeId: params.approverEmployeeId,
				comments: `Auto-approved by ${sourceLabel}`,
			},
		});
	}

	await updateRequestStepProgress(prisma, request.id, currentStep.id, {
		changedByEmployeeId: params.approverEmployeeId,
		source: sourceLabel,
	});
};

type SeedDocumentTicketState = "SUBMITTED" | "READY_TO_GENERATE" | "COMPLETED";

const SEED_COE_TICKET_COUNT = 10;
const SEED_COE_TICKET_STATES: SeedDocumentTicketState[] = [
	"SUBMITTED",
	"SUBMITTED",
	"SUBMITTED",
	"READY_TO_GENERATE",
	"READY_TO_GENERATE",
	"READY_TO_GENERATE",
	"READY_TO_GENERATE",
	"COMPLETED",
	"COMPLETED",
	"COMPLETED",
];

const sanitizeSeedFilenameSegment = (value: string) =>
	String(value || "document")
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "") || "document";

const buildSeedDocumentRequestMetadata = (params: {
	sourceLabel: string;
	ticketKey: string;
	targetState: SeedDocumentTicketState;
	documentNumber?: string | null;
	documentUrl?: string | null;
}) => ({
	documentType: "CERTIFICATE_OF_EMPLOYMENT",
	requestedFrom: "Employee self-service",
	purpose: "Seeded HR ticket workflow sample",
	documentStatus:
		params.targetState === "COMPLETED"
			? "GENERATED"
			: params.targetState === "READY_TO_GENERATE"
				? "READY_TO_GENERATE"
				: "REQUESTED",
	seedSource: params.sourceLabel,
	seedTicketKey: params.ticketKey,
	seedTicketState: params.targetState,
	...(params.documentNumber ? { documentNumber: params.documentNumber } : {}),
	...(params.documentUrl
		? {
				documentUrl: params.documentUrl,
				generatedAt: new Date().toISOString(),
			}
		: {}),
});

const getSeedRequestEmployeeData = async (employeeId: string) => {
	return prisma.employee.findUnique({
		where: { id: employeeId },
		select: {
			id: true,
			employeeId: true,
			role: true,
			reportToId: true,
			employmentHireDate: true,
			employmentStatus: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
			position: {
				select: {
					title: true,
				},
			},
			department: {
				select: {
					name: true,
				},
			},
		},
	});
};

const ensureDocumentRequestReadyForGeneration = async (params: {
	requestId: string;
	approverEmployeeId: string;
	sourceLabel: string;
}) => {
	const request = await prisma.request.findUnique({
		where: { id: params.requestId },
		select: {
			id: true,
			currentStepExecutionId: true,
			currentWorkflowStateKey: true,
		},
	});
	if (!request) return;

	const currentStep = request.currentStepExecutionId
		? await prisma.workflowStepExecution.findFirst({
				where: {
					id: request.currentStepExecutionId,
					requestId: request.id,
					isDeleted: false,
				},
				select: {
					id: true,
					stepType: true,
					status: true,
				},
			})
		: null;

	if (currentStep?.stepType === "APPROVAL" && currentStep.status !== "APPROVED") {
		await prisma.workflowStepExecution.update({
			where: { id: currentStep.id },
			data: {
				status: "APPROVED",
				completedAt: new Date(),
				assigneeId: params.approverEmployeeId,
				comments: `Auto-approved by ${params.sourceLabel}`,
			},
		});

		await updateRequestStepProgress(prisma, request.id, currentStep.id, {
			changedByEmployeeId: params.approverEmployeeId,
			source: params.sourceLabel,
		});
	}

	const afterProgress = await prisma.request.findUnique({
		where: { id: request.id },
		select: {
			currentStepExecution: {
				select: {
					stepType: true,
				},
			},
			metadata: true,
		},
	});

	if (afterProgress?.currentStepExecution?.stepType === "TASK") {
		await prisma.request.update({
			where: { id: request.id },
			data: {
				currentWorkflowStateKey: "APPROVED",
				metadata: {
					...(((afterProgress.metadata as Record<string, unknown> | null) ||
						{}) as Record<string, unknown>),
					documentStatus: "READY_TO_GENERATE",
				} as any,
			},
		});
	}
};

const generateCompletedSeedCoeDocument = async (params: {
	organizationId: string;
	requestId: string;
	requestCode?: string | null;
	requesterId: string;
	hrEmployeeId: string;
	ticketKey: string;
	sourceLabel: string;
}) => {
	const requester = await getSeedRequestEmployeeData(params.requesterId);
	if (!requester) {
		logSeedStep(`Skipping generated COE ticket ${params.ticketKey}: requester not found.`);
		return;
	}

	const documentNumber = `COE-SEED-${params.ticketKey.split("-").pop()}`;
	const existingDocument = await prisma.document.findFirst({
		where: {
			employeeId: requester.id,
			number: documentNumber,
			isDeleted: false,
		},
		select: {
			id: true,
			fileUrl: true,
			ext: true,
		},
	});

	let documentUrl = existingDocument?.fileUrl || null;
	if (!documentUrl) {
		const buffer = await generateCertificateOfEmployment({
			id: requester.id,
			employeeId: requester.employeeId,
			person: {
				personalInfo: {
					firstName: String((requester.person?.personalInfo as any)?.firstName || ""),
					lastName: String((requester.person?.personalInfo as any)?.lastName || ""),
					middleName: String((requester.person?.personalInfo as any)?.middleName || ""),
				},
			},
			position: requester.position || undefined,
			department: requester.department || undefined,
			employmentHireDate: requester.employmentHireDate || undefined,
			employmentStatus: requester.employmentStatus || undefined,
		});
		const uploadResult = await uploadSeedDocumentWithRetry(
			buffer,
			{
				folder: `hris/employees/${requester.employeeId}/documents`,
				publicId: sanitizeSeedFilenameSegment(`${documentNumber}-${params.sourceLabel}`),
				resourceType: "raw",
				overwrite: true,
			},
			`seeded generated COE ticket ${params.ticketKey}`,
		);

		if (!uploadResult.success || !uploadResult.secureUrl) {
			logSeedStep(
				`Generated COE ticket ${params.ticketKey} could not upload a PDF; leaving it ready for manual generation.`,
			);
			return;
		}

		documentUrl = uploadResult.secureUrl;
	}

	if (!existingDocument) {
		await prisma.document.create({
			data: {
				employeeId: requester.id,
				name: `Certificate of Employment - ${params.requestCode || params.ticketKey}`,
				type: "CERTIFICATE",
				number: documentNumber,
				issueDate: new Date(),
				fileUrl: documentUrl,
				ext: "pdf",
				metadata: {
					seedSource: params.sourceLabel,
					seedTicketKey: params.ticketKey,
					documentRequestId: params.requestId,
				} as any,
			},
		});
	}

	try {
		await completeTaskStep(
			prisma,
			params.requestId,
			"HR Review & Document Generation",
			params.hrEmployeeId,
			`Generated by ${params.sourceLabel}`,
		);
	} catch (error) {
		logSeedStep(
			`Could not complete HR generation step for ${params.ticketKey}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const existingRequest = await prisma.request.findUnique({
		where: { id: params.requestId },
		select: { metadata: true },
	});
	await prisma.request.update({
		where: { id: params.requestId },
		data: {
			currentWorkflowStateKey: "COMPLETED",
			metadata: {
				...(((existingRequest?.metadata as Record<string, unknown> | null) ||
					{}) as Record<string, unknown>),
				...buildSeedDocumentRequestMetadata({
					sourceLabel: params.sourceLabel,
					ticketKey: params.ticketKey,
					targetState: "COMPLETED",
					documentNumber,
					documentUrl,
				}),
			} as any,
		},
	});
};

const ensureMixedSeedCertificateRequestTickets = async (params: {
	organizationId: string;
	seedDefinitions: SeedEmployeeDefinition[];
	sourceLabel: string;
}): Promise<boolean> => {
	const workflow = await getDefaultRequestWorkflow(
		prisma,
		params.organizationId,
		"DOCUMENT_REQUEST",
	);
	if (!workflow) {
		logSeedStep("Skipping seeded COE tickets: no DOCUMENT_REQUEST workflow configured.");
		return false;
	}

	const seedEmployees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employeeId: {
				in: params.seedDefinitions.map((definition) => definition.employeeCode),
			},
		},
		select: {
			id: true,
			employeeId: true,
			role: true,
			reportToId: true,
		},
		orderBy: {
			employeeId: "asc",
		},
	});
	const preferredBulkEmployeeCodes = new Set(
		params.seedDefinitions
			.filter((definition) => !BASELINE_SEED_EMPLOYEE_CODES.has(definition.employeeCode))
			.map((definition) => definition.employeeCode),
	);
	const eligibleRequesters =
		preferredBulkEmployeeCodes.size > 0
			? seedEmployees.filter((employee) => preferredBulkEmployeeCodes.has(employee.employeeId))
			: seedEmployees;
	if (eligibleRequesters.length === 0) {
		logSeedStep("Skipping seeded COE tickets: no seeded employees found.");
		return false;
	}
	const requesters = Array.from(
		{ length: SEED_COE_TICKET_COUNT },
		(_, index) => eligibleRequesters[index % eligibleRequesters.length],
	);

	const hrEmployee =
		seedEmployees.find((employee) => employee.role === "hris-hr-manager") ||
		seedEmployees.find((employee) => String(employee.role || "").includes("hr"));
	if (!hrEmployee) {
		logSeedStep("Skipping seeded COE tickets: no HR employee found for generated tickets.");
		return false;
	}

	const recentDocumentRequests = await prisma.request.findMany({
		where: {
			organizationId: params.organizationId,
			type: "DOCUMENT_REQUEST",
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			requesterId: true,
			metadata: true,
		},
		orderBy: { createdAt: "desc" },
		take: 200,
	});
	const existingByTicketKey = new Map<string, { id: string; code?: string | null; requesterId: string }>();
	for (const request of recentDocumentRequests) {
		const metadata = ((request.metadata as Record<string, unknown> | null) || {}) as Record<
			string,
			unknown
		>;
		const ticketKey = String(metadata.seedTicketKey || "");
		if (!ticketKey || !ticketKey.startsWith(`${params.sourceLabel}-coe-ticket-`)) continue;
		existingByTicketKey.set(ticketKey, {
			id: request.id,
			code: request.code,
			requesterId: request.requesterId,
		});
	}

	let createdCount = 0;
	let reusedCount = 0;
	let realignedCount = 0;
	let completedCount = 0;
	const ticketTotal = SEED_COE_TICKET_COUNT;
	for (let index = 0; index < ticketTotal; index++) {
		const requester = requesters[index];
		const targetState = SEED_COE_TICKET_STATES[index] || "SUBMITTED";
		const ticketKey = `${params.sourceLabel}-coe-ticket-${String(index + 1).padStart(2, "0")}`;
		let request = existingByTicketKey.get(ticketKey);

		if (!request) {
			const created = await prisma.$transaction(
				async (tx) => {
					const item = await tx.request.create({
						data: {
							organizationId: params.organizationId,
							code: nextSeedRequestCode(),
							type: "DOCUMENT_REQUEST",
							currentWorkflowStateKey: "OPEN",
							description: "Seeded Certificate of Employment request",
							startDate: new Date(),
							endDate: new Date(),
							requester: {
								connect: { id: requester.id },
							},
							metadata: buildSeedDocumentRequestMetadata({
								sourceLabel: params.sourceLabel,
								ticketKey,
								targetState,
							}) as any,
							notes: `Auto-generated mixed-state COE ticket from ${params.sourceLabel}`,
						},
					});

					await createRequestStepExecutions(tx, {
						organizationId: params.organizationId,
						requestId: item.id,
						steps: workflow.steps,
						workflowStates: workflow.states,
						workflowCode: workflow.code,
						workflowName: workflow.name,
						workflowDescription: workflow.description,
						requestType: "DOCUMENT_REQUEST",
						requesterId: requester.id,
						reportToId: requester.reportToId,
					});

					return item;
				},
				{ maxWait: SEED_TX_MAX_WAIT_MS, timeout: SEED_TX_TIMEOUT_MS },
			);
			request = {
				id: created.id,
				code: created.code,
				requesterId: requester.id,
			};
			createdCount += 1;
		} else {
			reusedCount += 1;

			if (request.requesterId !== requester.id) {
				await prisma.$transaction(
					async (tx) => {
						await tx.request.update({
							where: { id: request!.id },
							data: {
								requesterId: requester.id,
								currentStepExecutionId: null,
								lastCompletedStepExecutionId: null,
								currentWorkflowStateKey: "OPEN",
								metadata: buildSeedDocumentRequestMetadata({
									sourceLabel: params.sourceLabel,
									ticketKey,
									targetState,
								}) as any,
							},
						});

						await tx.workflowStepExecution.deleteMany({
							where: { requestId: request!.id },
						});

						await createRequestStepExecutions(tx, {
							organizationId: params.organizationId,
							requestId: request!.id,
							steps: workflow.steps,
							workflowStates: workflow.states,
							workflowCode: workflow.code,
							workflowName: workflow.name,
							workflowDescription: workflow.description,
							requestType: "DOCUMENT_REQUEST",
							requesterId: requester.id,
							reportToId: requester.reportToId,
						});
					},
					{ maxWait: SEED_TX_MAX_WAIT_MS, timeout: SEED_TX_TIMEOUT_MS },
				);
				request.requesterId = requester.id;
				realignedCount += 1;
			}
		}

		if (targetState === "SUBMITTED") continue;

		await ensureDocumentRequestReadyForGeneration({
			requestId: request.id,
			approverEmployeeId: requester.reportToId || hrEmployee.id,
			sourceLabel: params.sourceLabel,
		});

		if (targetState === "COMPLETED") {
			await generateCompletedSeedCoeDocument({
				organizationId: params.organizationId,
				requestId: request.id,
				requestCode: request.code,
				requesterId: request.requesterId,
				hrEmployeeId: hrEmployee.id,
				ticketKey,
				sourceLabel: params.sourceLabel,
			});
			completedCount += 1;
		}
	}

	logSeedStep(
		`Seeded mixed COE tickets ready: ${ticketTotal} total (${createdCount} created, ${reusedCount} reused, ${realignedCount} realigned, ${completedCount} generated/completed target).`,
	);
	return true;
};

const resetOrganizationRequests = async (organizationId: string) => {
	const workflow = await getDefaultRequestWorkflow(prisma, organizationId, "DOCUMENT_REQUEST");
	if (!workflow) {
		throw new Error(
			"Cannot rebuild demo request tickets because the DOCUMENT_REQUEST workflow is not configured.",
		);
	}

	const timesheetReset = await prisma.timesheet.updateMany({
		where: {
			organizationId,
			editPermissionRequestId: {
				not: null,
			},
		},
		data: {
			editPermissionStatus: "NONE",
			editPermissionRequestId: null,
			editPermissionRequestedAt: null,
			editPermissionGrantedAt: null,
			editPermissionGrantedBy: null,
			editPermissionRejectedAt: null,
			editPermissionRejectedBy: null,
			editPermissionRejectionReason: null,
			editPermissionConsumedAt: null,
			editPermissionExpiresAt: null,
			editPermissionReason: null,
		},
	});

	await prisma.request.updateMany({
		where: { organizationId },
		data: {
			currentStepExecutionId: null,
			lastCompletedStepExecutionId: null,
		},
	});

	const deletedStepExecutions = await prisma.workflowStepExecution.deleteMany({
		where: { organizationId },
	});
	const deletedRequests = await prisma.request.deleteMany({
		where: { organizationId },
	});

	return {
		deletedRequestCount: deletedRequests.count,
		deletedStepExecutionCount: deletedStepExecutions.count,
		clearedTimesheetEditPermissionCount: timesheetReset.count,
	};
};

export async function rebuildDemoCoeRequestTickets(params: {
	organizationId: string;
	sourceLabel?: string;
	employeeCount?: number;
}) {
	const { sourceLabel, resolvedEmployeeCount, seedDefinitions } =
		await resolveSeedDefinitionsForRequestDemo(params);
	const rebuilt = await ensureMixedSeedCertificateRequestTickets({
		organizationId: params.organizationId,
		seedDefinitions,
		sourceLabel,
	});

	return {
		sourceLabel,
		resolvedEmployeeCount,
		rebuilt,
	};
}

export async function resetDemoRequestsAndRebuildCoeTickets(
	options: DemoRequestResetOptions,
): Promise<DemoRequestResetResult> {
	const { sourceLabel, resolvedEmployeeCount } = await resolveSeedDefinitionsForRequestDemo({
		sourceLabel: options.sourceLabel,
		employeeCount: options.employeeCount,
	});
	const resetResult = await resetOrganizationRequests(options.organizationId);
	const rebuildResult = await rebuildDemoCoeRequestTickets({
		organizationId: options.organizationId,
		sourceLabel,
		employeeCount: resolvedEmployeeCount,
	});

	return {
		sourceLabel,
		resolvedEmployeeCount,
		deletedRequestCount: resetResult.deletedRequestCount,
		deletedStepExecutionCount: resetResult.deletedStepExecutionCount,
		clearedTimesheetEditPermissionCount: resetResult.clearedTimesheetEditPermissionCount,
		rebuilt: rebuildResult.rebuilt,
	};
}

const buildSeedEmployer = (sourceLabel = "generalEmployeeSeeder") => ({
	name: "Bandai Namco Entertainment Philippines",
	tin: "000-123-456-000",
	rdoCode: "042",
	branchCode: "BR-001",
	address: "Quezon City, Metro Manila, Philippines",
	isVerified: true,
	metadata: {
		source: sourceLabel,
	},
});

const ensureScheduleSchemaCompatibility = async () => {
	const statements = [
		`ALTER TABLE IF EXISTS "shift_types" ADD COLUMN IF NOT EXISTS "shiftHour" DOUBLE PRECISION NOT NULL DEFAULT 0`,
		`ALTER TABLE IF EXISTS "schedule_templates" ADD COLUMN IF NOT EXISTS "totalHour" DOUBLE PRECISION NOT NULL DEFAULT 0`,
		`ALTER TABLE IF EXISTS "schedule_templates" ADD COLUMN IF NOT EXISTS "totalDay" INTEGER NOT NULL DEFAULT 0`,
		`UPDATE "shift_types" SET "shiftHour" = 0 WHERE "shiftHour" IS NULL`,
		`UPDATE "schedule_templates" SET "totalHour" = 0 WHERE "totalHour" IS NULL`,
		`UPDATE "schedule_templates" SET "totalDay" = 0 WHERE "totalDay" IS NULL`,
	];

	for (const statement of statements) {
		try {
			await prisma.$executeRawUnsafe(statement);
		} catch (error) {
			const message = String((error as any)?.message || error);
			if (
				message.includes("not supported") ||
				message.includes("does not exist") ||
				message.includes("Raw query failed")
			) {
				logSeedStep(`Schedule schema compatibility skipped one statement: ${message}`);
				continue;
			}
			throw error;
		}
	}
};

const getSeedDocumentAssetSpec = (
	documentTypeCode: (typeof SEEDED_EMPLOYEE_DOCUMENT_TYPES)[number],
) => {
	const spec = SEED_DOCUMENT_ASSET_SPECS.find((item) => item.documentTypeCode === documentTypeCode);
	if (!spec) {
		throw new Error(`No seeded asset spec configured for document type ${documentTypeCode}`);
	}
	return spec;
};

const buildSeedDocumentAssetPlaceholder = (
	documentTypeCode: (typeof SEEDED_EMPLOYEE_DOCUMENT_TYPES)[number],
): SeedDocumentAsset => {
	const spec = getSeedDocumentAssetSpec(documentTypeCode);
	return {
		documentTypeCode,
		assetFolderName: spec.isDirectory ? spec.entryName : "201-TEMPLATES",
		assetFileName: path.basename(spec.entryName),
		relativePath: spec.entryName.replace(/\\/g, "/"),
		absolutePath: "",
		ext: getSeedFileExtension(spec.entryName),
	};
};

const ensureComplianceDocumentsForEmployee = async (params: {
	organizationId: string;
	employeeDbId: string;
	employeeCode: string;
	employeeSeedIndex: number;
	sourceLabel?: string;
	skipEmployeeDocumentUploads?: boolean;
}) => {
	const {
		organizationId,
		employeeDbId,
		employeeCode,
		employeeSeedIndex,
		sourceLabel = "generalEmployeeSeeder",
		skipEmployeeDocumentUploads = false,
	} = params;
	const fallbackIssueDate = new Date(Date.UTC(2015, 0, 1, 0, 0, 0, 0));
	const fallbackMedicalExpiryDate = new Date(Date.UTC(2016, 0, 1, 0, 0, 0, 0));
	const employee = await prisma.employee.findFirst({
		where: {
			id: employeeDbId,
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			departmentId: true,
			role: true,
			employmentHireDate: true,
		},
	});
	if (!employee) {
		throw new Error(`Seed employee not found while ensuring documents: ${employeeDbId}`);
	}

	const assetMap = skipEmployeeDocumentUploads
		? null
		: await loadSeededEmployeeDocumentAssets();
	const configuredDocumentTypes = await prisma.documentType.findMany({
		where: {
			organizationId,
			isDeleted: false,
			code: { in: [...SEEDED_EMPLOYEE_DOCUMENT_TYPES] },
		},
		select: {
			id: true,
			code: true,
			name: true,
		},
	});
	const documentTypeMap = new Map(
		configuredDocumentTypes.map((item) => [String(item.code || "").toUpperCase(), item]),
	);
	const missingDocumentTypes = SEEDED_EMPLOYEE_DOCUMENT_TYPES.filter(
		(code) => !documentTypeMap.has(code),
	);
	if (missingDocumentTypes.length > 0) {
		throw new Error(
			`Missing seeded document types for organization ${organizationId}: ${missingDocumentTypes.join(", ")}`,
		);
	}

	for (const docType of SEEDED_EMPLOYEE_DOCUMENT_TYPES) {
		const configuredDocumentType = documentTypeMap.get(docType);
		const existing = await prisma.document.findFirst({
			where: {
				employeeId: employeeDbId,
				isDeleted: false,
				OR: [
					...(configuredDocumentType?.id
						? [{ documentTypeId: configuredDocumentType.id }]
						: []),
					{ type: docType },
					{ type: docType.toLowerCase() },
				],
			},
			select: {
				id: true,
				name: true,
				type: true,
				number: true,
				issueDate: true,
				expiryDate: true,
				fileUrl: true,
				ext: true,
				documentTypeId: true,
				metadata: true,
			},
		});

		const selectedAsset = assetMap
			? selectSeedDocumentAsset({
					documentTypeCode: docType,
					employeeSeedIndex,
					assetMap,
			  })
			: buildSeedDocumentAssetPlaceholder(docType);
		const fallbackNumber = buildSeededEmployeeDocumentNumber(employeeCode, docType);
		const existingMetadata =
			existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
				? (existing.metadata as Record<string, any>)
				: {};
		const isSeedManagedExistingDocument = existingMetadata.seedSource === sourceLabel;
		const shouldUploadSeededAsset =
			!existing?.fileUrl ||
			(isSeedManagedExistingDocument &&
				String(existingMetadata.assetRelativePath || "") !== selectedAsset.relativePath);
		let uploadedFileUrl = existing?.fileUrl || null;
		let uploadedExt = existing?.ext || selectedAsset.ext;
		let uploadedPublicId =
			typeof existingMetadata.storagePublicId === "string"
				? String(existingMetadata.storagePublicId || "").trim()
				: "";

		if (shouldUploadSeededAsset && !skipEmployeeDocumentUploads) {
			const fileBuffer = await fs.promises.readFile(selectedAsset.absolutePath);
			const publicId = [
				sanitizeSeedStorageSegment(sourceLabel),
				sanitizeSeedStorageSegment(employeeCode),
				sanitizeSeedStorageSegment(docType),
				sanitizeSeedStorageSegment(selectedAsset.assetFolderName),
				sanitizeSeedStorageSegment(
					selectedAsset.assetFileName.replace(/\.[^/.]+$/, ""),
				),
			].join("_");
			const uploadResult = await uploadSeedDocumentWithRetry(
				fileBuffer,
				{
					folder: SEEDED_EMPLOYEE_DOCUMENT_FOLDER,
					publicId,
					resourceType: "auto",
					overwrite: true,
				},
				`seeded employee document ${selectedAsset.relativePath} for ${employeeCode}`,
			);

			if (!uploadResult.success || !uploadResult.secureUrl) {
				seedDocumentUploadCounters.skipped += 1;
				logSeedStep(
					`Skipping file attachment for seeded employee document ${selectedAsset.relativePath} (${employeeCode}); continuing with document metadata only.`,
				);
			} else {
				uploadedFileUrl = uploadResult.secureUrl;
				uploadedExt = uploadResult.format || selectedAsset.ext || existing?.ext || null;
				uploadedPublicId = uploadResult.publicId || publicId;
			}
		} else if (shouldUploadSeededAsset && skipEmployeeDocumentUploads) {
			seedDocumentUploadCounters.skipped += 1;
		}

		const nextMetadata =
			shouldUploadSeededAsset || isSeedManagedExistingDocument || !existing
				? {
						...existingMetadata,
						seedSource: sourceLabel,
						assetFolderName: selectedAsset.assetFolderName,
						assetFileName: selectedAsset.assetFileName,
						assetRelativePath: selectedAsset.relativePath,
						storagePublicId: uploadedPublicId || null,
						storageFolder: SEEDED_EMPLOYEE_DOCUMENT_FOLDER,
						uploadSkippedBySeedConfig: skipEmployeeDocumentUploads || undefined,
						seededAt: new Date().toISOString(),
					}
				: existingMetadata;
		const nextExpiryDate =
			docType === "MEDICAL_CERTIFICATE"
				? existing?.expiryDate || fallbackMedicalExpiryDate
				: existing?.expiryDate || null;

		if (!existing) {
			try {
				await prisma.document.create({
					data: {
						employeeId: employeeDbId,
						name: configuredDocumentType?.name || docType,
						type: configuredDocumentType?.code || docType,
						documentTypeId: configuredDocumentType?.id || null,
						number: fallbackNumber,
						issueDate: fallbackIssueDate,
						expiryDate: nextExpiryDate,
						fileUrl: uploadedFileUrl,
						ext: uploadedExt,
						metadata: nextMetadata as any,
					},
				});
			} catch (error) {
				if (isCollectionCapError(error)) {
					if (!hasLoggedDocumentCollectionCapWarning) {
						hasLoggedDocumentCollectionCapWarning = true;
						console.warn(
							"[seed] Atlas collection cap reached (500). Skipping compliance document inserts for this run.",
						);
					}
					return;
				}
				throw error;
			}
			continue;
		}

		const updateData: Record<string, any> = {};
		if (!existing.name || !existing.name.trim()) {
			updateData.name = configuredDocumentType?.name || docType;
		}
		if (!existing.type || existing.type !== (configuredDocumentType?.code || docType)) {
			updateData.type = configuredDocumentType?.code || docType;
		}
		if (configuredDocumentType?.id && existing.documentTypeId !== configuredDocumentType.id) {
			updateData.documentTypeId = configuredDocumentType.id;
		}
		if (!existing.number || !existing.number.trim()) updateData.number = fallbackNumber;
		if (!existing.issueDate) updateData.issueDate = fallbackIssueDate;
		if (!existing.expiryDate && nextExpiryDate) updateData.expiryDate = nextExpiryDate;
		if (uploadedFileUrl && existing.fileUrl !== uploadedFileUrl) updateData.fileUrl = uploadedFileUrl;
		if (uploadedExt && existing.ext !== uploadedExt) updateData.ext = uploadedExt;
		if (shouldUploadSeededAsset || isSeedManagedExistingDocument) {
			updateData.metadata = nextMetadata as any;
		}

		if (Object.keys(updateData).length > 0) {
			await prisma.document.update({
				where: { id: existing.id },
				data: updateData,
			});
		}
	}

	await reconcileEmployeeOnboardingState({
		prisma,
		organizationId,
		employeeId: employee.id,
		targetDate: employee.employmentHireDate || fallbackIssueDate,
		departmentId: employee.departmentId,
		role: employee.role,
	});
};

const withSeedLifecycleFlags = (metadata: unknown) => {
	const safeMetadata =
		metadata && typeof metadata === "object" && !Array.isArray(metadata)
			? { ...(metadata as Record<string, unknown>) }
			: {};

	return {
		...safeMetadata,
		isFirstLogin:
			typeof safeMetadata.isFirstLogin === "boolean" ? safeMetadata.isFirstLogin : true,
		requirePasswordChange:
			typeof safeMetadata.requirePasswordChange === "boolean"
				? safeMetadata.requirePasswordChange
				: true,
	};
};

const toAttendanceScheduleSnapshot = (shift: EmployeeScheduleSnapshot) => ({
	source: shift.source || "template",
	scheduleOverrideId: shift.scheduleOverrideId || null,
	scheduleTemplateId: shift.scheduleTemplateId || null,
	scheduleTemplateName: shift.scheduleTemplateName || null,
	shiftTypeId: shift.shiftTypeId || null,
	shiftTypeCode: shift.shiftTypeCode || null,
	shiftTypeName: shift.shiftTypeName || null,
	templateDay: shift.templateDay ?? null,
	cycleDays: shift.cycleDays ?? null,
	isOff: Boolean(shift.isOff),
	isOvernight: Boolean(shift.isOvernight),
	breakMinutes: shift.breakMinutes ?? null,
	graceLateMinutes: shift.graceLateMinutes ?? null,
	graceEarlyOutMinutes: shift.graceEarlyOutMinutes ?? null,
	startTime: shift.startTime || null,
	endTime: shift.endTime || null,
	timeSlots: Array.isArray(shift.timeSlots) ? shift.timeSlots : [],
	metadata: shift.metadata ?? null,
});

const ensureLevels = async (organizationId: string) => {
	const levelMap = new Map<string, string>();

	for (const definition of LEVEL_DEFINITIONS) {
		const level = await withPrismaWriteRetry(
			() =>
				prisma.level.upsert({
					where: {
						organizationId_name: {
							organizationId,
							name: definition.name,
						},
					},
					update: {
						rank: definition.rank,
						description: definition.description,
						isManager: definition.isManager,
						isDeleted: false,
					},
					create: {
						organizationId,
						name: definition.name,
						rank: definition.rank,
						description: definition.description,
						isManager: definition.isManager,
					},
				}),
			`level upsert ${definition.name}`,
		);
		levelMap.set(definition.name, level.id);
	}

	return levelMap;
};

const ensureDepartments = async (
	organizationId: string,
	departmentDefinitions: DepartmentDefinition[] = DEPARTMENT_DEFINITIONS,
) => {
	const departmentMap = new Map<string, { id: string; managerId?: string | null }>();

	for (const definition of departmentDefinitions) {
		const department = await withPrismaWriteRetry(
			() =>
				prisma.department.upsert({
					where: {
						organizationId_code: {
							organizationId,
							code: definition.code,
						},
					},
					update: {
						name: definition.name,
						description: definition.description,
						isHr: definition.isHr,
						isActive: true,
						isDeleted: false,
					},
					create: {
						organizationId,
						name: definition.name,
						code: definition.code,
						description: definition.description,
						isHr: definition.isHr,
						isActive: true,
					},
				}),
			`department upsert ${definition.code}`,
		);
		departmentMap.set(definition.code, {
			id: department.id,
			managerId: department.managerId,
		});
	}

	return departmentMap;
};

const ensureSections = async (
	organizationId: string,
	departments: Map<string, { id: string }>,
	sectionDefinitions: SectionDefinition[] = SECTION_DEFINITIONS,
) => {
	const sectionMap = new Map<string, { id: string; departmentId: string; departmentCode: string }>();

	for (const definition of sectionDefinitions) {
		const department = departments.get(definition.departmentCode);
		if (!department) {
			throw new Error(
				`Section "${definition.code}" references missing seed department "${definition.departmentCode}".`,
			);
		}

		const section = await withPrismaWriteRetry(
			() =>
				prisma.section.upsert({
					where: {
						organizationId_code: {
							organizationId,
							code: definition.code,
						},
					},
					update: {
						name: definition.name,
						description: definition.description,
						departmentId: department.id,
						isHr: definition.isHr,
						isActive: true,
						isDeleted: false,
					},
					create: {
						organizationId,
						name: definition.name,
						code: definition.code,
						description: definition.description,
						departmentId: department.id,
						isHr: definition.isHr,
						isActive: true,
					},
				}),
			`section upsert ${definition.code}`,
		);
		sectionMap.set(definition.code, {
			id: section.id,
			departmentId: section.departmentId,
			departmentCode: definition.departmentCode,
		});
	}

	return sectionMap;
};

const ensureSeedDepartmentManagerLinks = async (params: {
	organizationId: string;
	departments: Map<string, { id: string; managerId?: string | null }>;
	seedDefinitions: SeedEmployeeDefinition[];
	employeeResults?: Map<string, SeedEmployeeProvisionResult>;
	emailToEmployeeId?: Map<string, string>;
	logPrefix?: string;
}) => {
	let linkedCount = 0;

	for (const definition of params.seedDefinitions.filter((item) => item.isDepartmentManager)) {
		const department = params.departments.get(definition.departmentCode);
		if (!department) continue;

		let employeeId =
			params.employeeResults?.get(definition.email)?.employee.id ||
			params.emailToEmployeeId?.get(definition.email) ||
			null;

		if (!employeeId) {
			const employee = await prisma.employee.findFirst({
				where: {
					organizationId: params.organizationId,
					employeeId: definition.employeeCode,
					isDeleted: false,
				},
				select: { id: true },
			});
			employeeId = employee?.id || null;
		}

		if (!employeeId || department.managerId === employeeId) continue;

		await withPrismaWriteRetry(
			() =>
				prisma.department.update({
					where: { id: department.id },
					data: { managerId: employeeId },
				}),
			`department manager link ${definition.departmentCode}`,
		);
		department.managerId = employeeId;
		linkedCount += 1;
	}

	if (linkedCount > 0) {
		logSeedStep(
			`${params.logPrefix || "Department manager sync"} linked ${linkedCount} seeded department manager record(s).`,
		);
	}
};

const ensurePositions = async (
	organizationId: string,
	departments: Map<string, { id: string }>,
	sections: Map<string, { id: string; departmentId: string; departmentCode: string }>,
	levels: Map<string, string>,
	positionDefinitions: PositionDefinition[] = POSITION_DEFINITIONS,
) => {
	const positionMap = new Map<string, string>();

	for (const definition of positionDefinitions) {
		const department = departments.get(definition.departmentCode);
		const section = sections.get(definition.sectionCode);
		if (!department) {
			throw new Error(
				`Position "${definition.code}" references missing seed department "${definition.departmentCode}".`,
			);
		}
		if (!section) {
			throw new Error(
				`Position "${definition.code}" references missing seed section "${definition.sectionCode}".`,
			);
		}
		if (section.departmentCode !== definition.departmentCode || section.departmentId !== department.id) {
			throw new Error(
				`Position "${definition.code}" references section "${definition.sectionCode}" outside department "${definition.departmentCode}".`,
			);
		}

		const position = await withPrismaWriteRetry(
			() =>
				prisma.position.upsert({
					where: {
						organizationId_code: {
							organizationId,
							code: definition.code,
						},
					},
					update: {
						title: definition.title,
						description: definition.description,
						sectionId: section.id,
						minSalary: definition.minSalary ?? null,
						maxSalary: definition.maxSalary ?? null,
						isDeleted: false,
						isActive: true,
					},
					create: {
						organizationId,
						title: definition.title,
						code: definition.code,
						description: definition.description,
						sectionId: section.id,
						minSalary: definition.minSalary ?? null,
						maxSalary: definition.maxSalary ?? null,
						isActive: true,
					},
				}),
			`position upsert ${definition.code}`,
		);

		const levelIds = definition.levelNames
			.map((levelName) => levels.get(levelName))
			.filter((value): value is string => Boolean(value));

		if (levelIds.length > 0) {
			// Get existing positionLevel records to avoid constraint violations
			const existingLevels = await prisma.positionLevel.findMany({
				where: { positionId: position.id },
				select: { levelId: true },
			});
			const existingLevelIds = new Set(existingLevels.map((item) => item.levelId));

			// Only create new relationships for levels that don't already exist
			const newLevels = levelIds.filter((levelId) => !existingLevelIds.has(levelId));
			if (newLevels.length > 0) {
				await withPrismaWriteRetry(
					() =>
						prisma.positionLevel.createMany({
							data: newLevels.map((levelId) => ({
								positionId: position.id,
								levelId,
							})),
						}),
					`position level createMany ${definition.code}`,
				);
			}
		}

		positionMap.set(definition.code, position.id);
	}
	``;

	return positionMap;
};

const ensureScheduleResources = async (organizationId: string, departmentIds: string[]) => {
	await ensureScheduleSchemaCompatibility();
	const regularDayTimeSlots = [
		{ type: "work", label: "Morning", startTime: "08:00", endTime: "12:00" },
		{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
		{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
	];
	const nightShiftTimeSlots = [
		{ type: "work", label: "Evening", startTime: "20:00", endTime: "00:00" },
		{ type: "break", label: "Meal Break", startTime: "00:00", endTime: "01:00" },
		{ type: "work", label: "Early Morning", startTime: "01:00", endTime: "05:00" },
	];
	const regularDayShiftHour = calculateShiftHour({ isOff: false, timeSlots: regularDayTimeSlots });
	const nightShiftHour = calculateShiftHour({ isOff: false, timeSlots: nightShiftTimeSlots });

	const shiftMorning = await (prisma as any).shiftType.upsert({
		where: { organizationId_code: { organizationId, code: "REGULAR_DAY" } },
		update: {
			name: "Regular Day Shift",
			isOvernight: false,
			isOff: false,
			timeSlots: regularDayTimeSlots,
			shiftHour: regularDayShiftHour,
		},
		create: {
			organizationId,
			name: "Regular Day Shift",
			code: "REGULAR_DAY",
			isOvernight: false,
			isOff: false,
			timeSlots: regularDayTimeSlots,
			shiftHour: regularDayShiftHour,
		},
	});

	const shiftNight = await (prisma as any).shiftType.upsert({
		where: { organizationId_code: { organizationId, code: "NIGHT_SHIFT" } },
		update: {
			name: "Night Shift",
			isOvernight: true,
			isOff: false,
			timeSlots: nightShiftTimeSlots,
			shiftHour: nightShiftHour,
		},
		create: {
			organizationId,
			name: "Night Shift",
			code: "NIGHT_SHIFT",
			isOvernight: true,
			isOff: false,
			timeSlots: nightShiftTimeSlots,
			shiftHour: nightShiftHour,
		},
	});

	const shiftOff = await (prisma as any).shiftType.upsert({
		where: { organizationId_code: { organizationId, code: "OFF" } },
		update: {
			name: "Off Day",
			isOff: true,
			isOvernight: false,
			timeSlots: [],
			shiftHour: 0,
		},
		create: {
			organizationId,
			name: "Off Day",
			code: "OFF",
			isOff: true,
			isOvernight: false,
			timeSlots: [],
			shiftHour: 0,
		},
	});

	const regular14DayRotationPattern = [
		{ day: 1, shiftTypeId: shiftMorning.id, shiftSnapshot: toShiftTypeSnapshot(shiftMorning) },
		{ day: 2, shiftTypeId: shiftMorning.id, shiftSnapshot: toShiftTypeSnapshot(shiftMorning) },
		{ day: 3, shiftTypeId: shiftMorning.id, shiftSnapshot: toShiftTypeSnapshot(shiftMorning) },
		{ day: 4, shiftTypeId: shiftMorning.id, shiftSnapshot: toShiftTypeSnapshot(shiftMorning) },
		{ day: 5, shiftTypeId: shiftMorning.id, shiftSnapshot: toShiftTypeSnapshot(shiftMorning) },
		{ day: 6, shiftTypeId: shiftOff.id, shiftSnapshot: toShiftTypeSnapshot(shiftOff) },
		{ day: 7, shiftTypeId: shiftOff.id, shiftSnapshot: toShiftTypeSnapshot(shiftOff) },
		{ day: 8, shiftTypeId: shiftNight.id, shiftSnapshot: toShiftTypeSnapshot(shiftNight) },
		{ day: 9, shiftTypeId: shiftNight.id, shiftSnapshot: toShiftTypeSnapshot(shiftNight) },
		{ day: 10, shiftTypeId: shiftNight.id, shiftSnapshot: toShiftTypeSnapshot(shiftNight) },
		{ day: 11, shiftTypeId: shiftNight.id, shiftSnapshot: toShiftTypeSnapshot(shiftNight) },
		{ day: 12, shiftTypeId: shiftNight.id, shiftSnapshot: toShiftTypeSnapshot(shiftNight) },
		{ day: 13, shiftTypeId: shiftOff.id, shiftSnapshot: toShiftTypeSnapshot(shiftOff) },
		{ day: 14, shiftTypeId: shiftOff.id, shiftSnapshot: toShiftTypeSnapshot(shiftOff) },
	];

	const canonicalScheduleTemplateCode = "REGULAR_14DAY_ROTATION";
	const legacyScheduleTemplateCode = "REGULAR_5DAY";
	const { normalizedPattern, totalDay, totalHour } =
		calculateScheduleTemplateTotals(regular14DayRotationPattern);
	const scheduleTemplateData = {
		name: "Regular 14-Day Rotation",
		code: canonicalScheduleTemplateCode,
		cycleDays: 14,
		graceLateMinutes: 15,
		graceEarlyOutMinutes: 0,
		pattern: normalizedPattern,
		totalDay,
		totalHour,
		isDeleted: false,
		isActive: true,
	};
	const existingTemplate = await (prisma as any).scheduleTemplate.findFirst({
		where: {
			organizationId,
			code: { in: [canonicalScheduleTemplateCode, legacyScheduleTemplateCode] },
		},
		orderBy: [
			{
				code: "asc",
			},
		],
	});

	const template = existingTemplate
		? await (prisma as any).scheduleTemplate.update({
				where: { id: existingTemplate.id },
				data: scheduleTemplateData,
		  })
		: await (prisma as any).scheduleTemplate.create({
				data: {
					organizationId,
					...scheduleTemplateData,
				},
		  });

	if (template.code === canonicalScheduleTemplateCode) {
		await (prisma as any).scheduleTemplate.updateMany({
			where: {
				organizationId,
				code: legacyScheduleTemplateCode,
				id: { not: template.id },
			},
			data: {
				isActive: false,
				isDeleted: true,
			},
		});
	}

	for (const departmentId of departmentIds) {
		await (prisma as any).departmentScheduleTemplate.upsert({
			where: {
				departmentId_scheduleTemplateId: {
					departmentId,
					scheduleTemplateId: template.id,
				},
			},
			update: {
				isDeleted: false,
				isActive: true,
				source: "department_default",
			},
			create: {
				organizationId,
				departmentId,
				scheduleTemplateId: template.id,
				source: "department_default",
				isActive: true,
			},
		});
	}

	return { template };
};

const ensureEmployee = async (params: {
	organizationId: string;
	authOrganizationId: string;
	departmentId: string;
	sectionId: string;
	positionId: string;
	levelId: string;
	employeeCode: string;
	firstName: string;
	lastName: string;
	email: string;
	role: SeedAuthRoleKey;
	salary: number;
	roleId: string;
	reportToId?: string | null;
	authToken?: string;
	employeeSeedIndex: number;
	sourceLabel?: string;
	skipEmployeeDocumentUploads?: boolean;
	employmentStartDate?: Date;
}) => {
	const {
		organizationId,
		authOrganizationId,
		departmentId,
		sectionId,
		positionId,
		levelId,
		employeeCode,
		firstName,
		lastName,
		email,
		role,
		salary,
		roleId,
		reportToId = null,
		authToken,
		employeeSeedIndex,
		sourceLabel = "generalEmployeeSeeder",
		skipEmployeeDocumentUploads = false,
		employmentStartDate: providedEmploymentStartDate,
	} = params;

	const existingEmployee = await prisma.employee.findFirst({
		where: {
			organizationId,
			employeeId: employeeCode,
		},
		include: {
			person: true,
		},
	});
	const employeeAction: "created" | "updated" = existingEmployee ? "updated" : "created";

	let person = existingEmployee?.person || null;
	const seedPhone = buildSeedPhoneNumber(employeeCode);
	const seedAddress = buildSeedAddress(employeeCode);
	const seedIdentification = buildSeedIdentification(employeeCode);
	const seedDateOfBirth = buildSeedDateOfBirth(employeeCode);

	if (!person) {
		person = await prisma.person.create({
			data: {
				organizationId,
				personalInfo: {
					prefix: "Mr.",
					firstName,
					middleName: "Seed",
					lastName,
					dateOfBirth: seedDateOfBirth,
					placeOfBirth: "Metro Manila",
					nationality: "Filipino",
					primaryLanguage: "English",
					gender: "male",
					currency: "PHP",
					vipCode: null,
				},
				contactInfo: {
					email,
					phones: [
						{
							type: "mobile",
							countryCode: "+63",
							number: seedPhone,
							isPrimary: true,
						},
					],
					address: [seedAddress],
				},
				identification: seedIdentification as any,
			},
		});
	} else {
		const existingPersonalInfo = ((person.personalInfo as any) || {}) as Record<string, any>;
		const existingContactInfo = ((person.contactInfo as any) || {}) as Record<string, any>;
		const existingIdentification = ((person.identification as any) || {}) as Record<
			string,
			any
		>;

		await prisma.person.update({
			where: { id: person.id },
			data: {
				personalInfo: {
					...existingPersonalInfo,
					prefix: existingPersonalInfo.prefix || "Mr.",
					firstName,
					middleName: existingPersonalInfo.middleName || "Seed",
					lastName,
					// Always refresh seed DOB so re-seed keeps kiosk birthday month current.
					dateOfBirth: seedDateOfBirth,
					placeOfBirth: existingPersonalInfo.placeOfBirth || "Metro Manila",
					nationality: existingPersonalInfo.nationality || "Filipino",
					primaryLanguage: existingPersonalInfo.primaryLanguage || "English",
					gender: existingPersonalInfo.gender || "male",
					currency: existingPersonalInfo.currency || "PHP",
					vipCode: existingPersonalInfo.vipCode || null,
				} as any,
				contactInfo: {
					...existingContactInfo,
					email,
					phones:
						Array.isArray(existingContactInfo?.phones) &&
						existingContactInfo.phones.length > 0
							? existingContactInfo.phones
							: [
									{
										type: "mobile",
										countryCode: "+63",
										number: seedPhone,
										isPrimary: true,
									},
								],
					address:
						Array.isArray(existingContactInfo?.address) &&
						existingContactInfo.address.length > 0
							? existingContactInfo.address
							: [seedAddress],
				} as any,
				identification: {
					...existingIdentification,
					type: existingIdentification.type || seedIdentification.type,
					number: existingIdentification.number || seedIdentification.number,
					issuingCountry:
						existingIdentification.issuingCountry || seedIdentification.issuingCountry,
					expiryDate: existingIdentification.expiryDate || seedIdentification.expiryDate,
				} as any,
			},
		});
	}

	if (!seedAuthAdapter) {
		throw new Error("Seed auth adapter is not initialized");
	}

	const userName = email.split("@")[0];
	const existingEmployeeUserId = existingEmployee?.userId || (person as any)?.userId || null;
	const seedUser = await seedAuthAdapter.createOrGetUser({
		email,
		userName,
		password: DEFAULT_SEED_PASSWORD,
		role,
		roleId,
		organizationId: authOrganizationId,
		personId: person.id,
		authToken,
		existingEmployeeUserId,
	});

	if ((person as any)?.userId !== seedUser.userId) {
		await prisma.person.update({
			where: { id: person.id },
			data: { userId: seedUser.userId },
		});
	}

	const employmentHireDate = getSeedHireDate();
	const employmentStartDate = providedEmploymentStartDate ?? getSeedStartDate();

	if (existingEmployee) {
		const existingLeaveBalances = Array.isArray((existingEmployee as any).leaveBalances)
			? (existingEmployee as any).leaveBalances
			: [];
		const hasLeaveBalances = existingLeaveBalances.length > 0;
		const leaveBalancePayload = ensureDefaultLeaveBalances(
			{
				leaveBalances: existingLeaveBalances,
				leaveBalancesLastUpdated: (existingEmployee as any).leaveBalancesLastUpdated,
			},
			employmentHireDate,
		);

		const employee = await prisma.employee.update({
			where: { id: existingEmployee.id },
			data: {
				personId: person.id,
				userId: seedUser.userId,
				role,
				reportToId,
				departmentId,
				sectionId,
				positionId,
				levelId,
				basicSalary: salary,
				employmentHireDate,
				employmentStartDate,
				employmentStatus: (existingEmployee as any).employmentStatus || "ACTIVE",
				employmentType: (existingEmployee as any).employmentType || "PROBATIONARY",
				workLocation: (existingEmployee as any).workLocation || "ONSITE",
				currency: (existingEmployee as any).currency || "PHP",
				payFrequency: (existingEmployee as any).payFrequency || "SEMI_MONTHLY",
				workforceSource: (existingEmployee as any).workforceSource || "DIRECT",
				employer:
					(existingEmployee as any).employer || (buildSeedEmployer(sourceLabel) as any),
				leaveBalances: leaveBalancePayload.leaveBalances as any,
				leaveBalancesLastUpdated: hasLeaveBalances
					? ((existingEmployee as any).leaveBalancesLastUpdated ?? null)
					: ((leaveBalancePayload as any).leaveBalancesLastUpdated ?? new Date()),
				metadata: withSeedLifecycleFlags((existingEmployee as any).metadata) as any,
				isDeleted: false,
			},
		});

		await seedAuthAdapter.patchUserMetadata({
			userId: seedUser.userId,
			authToken,
			metadata: {
				requirePasswordChange: false,
				isFirstLogin: false,
				employee: {
					id: employee.id,
					employeeId: employee.employeeId,
					personalInfo: { firstName, lastName },
					department: { id: departmentId },
					section: { id: sectionId },
					position: { id: positionId },
					level: { id: levelId },
				},
			},
		});

		await ensureComplianceDocumentsForEmployee({
			organizationId,
			employeeDbId: employee.id,
			employeeCode,
			employeeSeedIndex,
			sourceLabel,
			skipEmployeeDocumentUploads,
		});

		return {
			employee,
			userName,
			authMode: seedAuthAdapter.mode,
			authUserSource: seedUser.source,
			authUserIsNew: seedUser.isNew,
			employeeAction,
		} satisfies SeedEmployeeProvisionResult;
	}

	const employee = await prisma.employee.create({
		data: {
			organizationId,
			employeeId: employeeCode,
			personId: person.id,
			userId: seedUser.userId,
			role,
			reportToId,
			departmentId,
			sectionId,
			positionId,
			levelId,
			basicSalary: salary,
			employmentHireDate,
			employmentStartDate,
			employmentStatus: "ACTIVE",
			employmentType: "PROBATIONARY",
			workLocation: "ONSITE",
			currency: "PHP",
			payFrequency: "SEMI_MONTHLY",
			workforceSource: "DIRECT",
			employer: buildSeedEmployer(sourceLabel) as any,
			employmentHistory: [],
			leaveBalances: ensureDefaultLeaveBalances(
				{
					leaveBalances: [],
					leaveBalancesLastUpdated: null,
				},
				employmentHireDate,
			).leaveBalances as any,
			leaveBalancesLastUpdated: new Date(),
			metadata: withSeedLifecycleFlags(null) as any,
		},
	});

	await seedAuthAdapter.patchUserMetadata({
		userId: seedUser.userId,
		authToken,
		metadata: {
			requirePasswordChange: false,
			isFirstLogin: false,
			employee: {
				id: employee.id,
				employeeId: employee.employeeId,
				personalInfo: { firstName, lastName },
				department: { id: departmentId },
				section: { id: sectionId },
				position: { id: positionId },
				level: { id: levelId },
			},
		},
	});

	await ensureComplianceDocumentsForEmployee({
		organizationId,
		employeeDbId: employee.id,
		employeeCode,
		employeeSeedIndex,
		sourceLabel,
		skipEmployeeDocumentUploads,
	});

	return {
		employee,
		userName,
		authMode: seedAuthAdapter.mode,
		authUserSource: seedUser.source,
		authUserIsNew: seedUser.isNew,
		employeeAction,
	} satisfies SeedEmployeeProvisionResult;
};

const ensureEmployeeScheduleAssignment = async (params: {
	organizationId: string;
	employeeId: string;
	departmentId: string;
	scheduleTemplateId: string;
	startDate: Date;
	sourceLabel?: string;
}) => {
	const sourceLabel = params.sourceLabel || "generalEmployeeSeeder";
	const template = await prisma.scheduleTemplate.findFirst({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			id: params.scheduleTemplateId,
		},
		select: {
			id: true,
			code: true,
			name: true,
			cycleDays: true,
			graceLateMinutes: true,
			graceEarlyOutMinutes: true,
			pattern: true,
		},
	});
	if (!template) {
		throw new Error(
			`Seed schedule template not found: ${params.scheduleTemplateId} (${params.organizationId})`,
		);
	}

	const employee = await prisma.employee.findFirst({
		where: {
			id: params.employeeId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			embeddedSchedule: true,
		},
	});
	if (!employee) {
		throw new Error(`Seed employee not found: ${params.employeeId} (${params.organizationId})`);
	}

	const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
		template,
		assignedByEmployeeId: null,
		effectiveStartDate: params.startDate,
		reason: `${sourceLabel} assignment`,
	});

	const updatedEmployee = await prisma.employee.update({
		where: { id: employee.id },
		data: {
			embeddedSchedule: nextEmbeddedSchedule as any,
		},
		select: {
			id: true,
			embeddedSchedule: true,
		},
	});

	await appendEmployeeScheduleHistory(prisma as any, {
		organizationId: params.organizationId,
		employeeId: params.employeeId,
		action: employee.embeddedSchedule ? "reassigned" : "assigned",
		actorEmployeeId: null,
		effectiveAt: params.startDate,
		beforeSchedule: employee.embeddedSchedule || null,
		afterSchedule: nextEmbeddedSchedule,
		metadata: {
			source: sourceLabel,
			assignmentMode: "template",
			scheduleTemplateId: params.scheduleTemplateId,
			departmentId: params.departmentId,
		},
	});

	return updatedEmployee;
};

const generateAttendanceRecords = async (params: {
	organizationId: string;
	employeeId: string;
	employeeCode: string;
	startDate: Date;
	endDate: Date;
	includeOvertime?: boolean;
	/** On-time every workday; no virtual AWOL; zero late/undertime fields for metrics. */
	perfectAttendance?: boolean;
	targetPayrollPeriods?: Array<{
		id: string;
		startDate: Date;
		endDate: Date;
		allowVirtualAwol?: boolean;
		maxVirtualAwolCount?: number;
	}>;
	forceSkippedDateKeys?: string[];
}) => {
	const {
		organizationId,
		employeeId,
		employeeCode,
		startDate,
		endDate,
		includeOvertime = false,
		perfectAttendance = false,
		targetPayrollPeriods = [],
		forceSkippedDateKeys = [],
	} = params;
	let workdayCount = 0;
	let attendanceCount = 0;
	const attendanceWritePayloads: Array<{
		dateKey: string;
		dateOnly: Date;
		createData: Parameters<typeof prisma.attendance.create>[0]["data"];
		updateData: Parameters<typeof prisma.attendance.update>[0]["data"];
	}> = [];
	const periodWindowConfigs = targetPayrollPeriods.map((period) => ({
		id: period.id,
		startKey: period.startDate.toISOString().split("T")[0],
		endKey: period.endDate.toISOString().split("T")[0],
		// Perfect-attendance employees never get intentional unpunched workdays.
		desiredVirtualAwolCount:
			perfectAttendance || period.allowVirtualAwol === false
				? 0
				: deterministicInt(
						`${employeeCode}-${period.id}-virtual-awol`,
						0,
						period.maxVirtualAwolCount ?? 3,
					),
	}));
	const workdayCandidatesByPeriod = new Map<string, string[]>();

	const day = new Date(startDate);
	day.setUTCHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setUTCHours(0, 0, 0, 0);

	while (day.getTime() <= end.getTime()) {
		const dateOnly = new Date(day);
		const shift = await resolveEffectiveShift(prisma, {
			organizationId,
			employeeId,
			date: dateOnly,
		});

		if (shift && !shift.isOff) {
			workdayCount++;
			const dateKey = dateOnly.toISOString().split("T")[0];
			const seedPrefix = `${employeeCode}-${dateKey}`;
			const workSlots = Array.isArray(shift.timeSlots)
				? shift.timeSlots.filter((slot: any) => String(slot?.type).toLowerCase() === "work")
				: [];
			const shiftStartMinutes =
				parseTimeToMinutes(workSlots[0]?.startTime || shift.startTime || "08:00") ?? 8 * 60;
			const shiftEndMinutes =
				parseTimeToMinutes(
					workSlots[workSlots.length - 1]?.endTime || shift.endTime || "17:00",
				) ?? 17 * 60;
			const scheduleEndMinutes =
				Boolean(shift.isOvernight) && shiftEndMinutes <= shiftStartMinutes
					? shiftEndMinutes + 24 * 60
					: shiftEndMinutes;
			const graceLateMinutes = Math.max(0, Number(shift.graceLateMinutes ?? 0));
			// Perfect attendance: punch exactly on schedule (stable, zero late/undertime).
			// Other employees: deterministic varied in/out for realistic demo noise.
			const latePatternRoll = deterministicInt(`${seedPrefix}-late-pattern`, 0, 99);
			const timeInOffsetMinutes = perfectAttendance
				? 0
				: latePatternRoll < 35
					? deterministicInt(`${seedPrefix}-arrive-early-window`, -15, -3)
					: latePatternRoll < 70
						? deterministicInt(`${seedPrefix}-arrive-near-start`, -7, 7)
						: latePatternRoll < 90
							? deterministicInt(
									`${seedPrefix}-arrive-within-grace`,
									8,
									Math.max(8, graceLateMinutes),
								)
							: latePatternRoll < 97
								? deterministicInt(
										`${seedPrefix}-beyond-grace-light`,
										graceLateMinutes + 1,
										graceLateMinutes + 12,
									)
								: deterministicInt(
										`${seedPrefix}-beyond-grace-heavy`,
										graceLateMinutes + 13,
										graceLateMinutes + 24,
									);

			const outPatternRoll = deterministicInt(`${seedPrefix}-out-pattern`, 0, 99);
			const timeOutOffsetMinutes = perfectAttendance
				? 0
				: outPatternRoll < 20
					? deterministicInt(`${seedPrefix}-out-early`, -35, -10)
					: outPatternRoll < 80
						? deterministicInt(`${seedPrefix}-out-normal`, -10, 8)
						: deterministicInt(`${seedPrefix}-out-late`, 8, 18);
			const hasOvertime =
				!perfectAttendance &&
				includeOvertime &&
				deterministicInt(`${seedPrefix}-ot-flag`, 0, 99) < 40;
			const overtimeMinutes = hasOvertime
				? deterministicInt(`${seedPrefix}-ot-minutes`, 1, 2) * 60
				: 0;

			// Deterministic attendance generation: varied per day/employee but stable across reruns.
			const timeIn = createDateAtPhilippineMinutes(
				dateOnly,
				shiftStartMinutes + timeInOffsetMinutes,
			);
			const timeOut = createDateAtPhilippineMinutes(
				dateOnly,
				scheduleEndMinutes + timeOutOffsetMinutes + overtimeMinutes,
			);
			const calc = calculateTimekeeping(timeIn, timeOut, shift as any, dateOnly);
			// Metrics treat non-empty "0:00" strings as violations; store null when zero so
			// perfect-attendance rows qualify for perfectAttendanceMetrics.
			const lateMinutes = perfectAttendance ? 0 : calc.lateMinutes;
			const undertimeMinutes = perfectAttendance ? 0 : calc.undertimeMinutes;
			const earlyOutMinutes = perfectAttendance ? 0 : calc.earlyOutMinutes;
			const status = perfectAttendance ? "PRESENT" : determineAttendanceStatus(calc, true);
			const scheduleSnapshot = toAttendanceScheduleSnapshot(shift);
			const overtimeApplication = applyOvertimeApprovalPolicyToTimekeepingFields({
				calc,
				requireManagerApprovedOvertime: true,
			});
			attendanceCount++;
			const attendanceWriteData = {
				timeIn,
				timeOut,
				status,
				behaviorFlags: deriveOvertimeAwareBehaviorFlags({
					timeIn,
					timeOut,
					schedule: shift as any,
					date: dateOnly,
					calc,
					requireManagerApprovedOvertime: true,
				}),
				breakMinutes: calc.breakMinutes,
				hoursWorked: formatMinutesAsTime(calc.totalMinutesWorked),
				regularHours: formatMinutesAsTime(calc.regularMinutes),
				overtimeHours: perfectAttendance
					? null
					: overtimeApplication.timekeepingFields.overtimeHours,
				overtimeMinutes: perfectAttendance
					? null
					: overtimeApplication.timekeepingFields.overtimeMinutes,
				undertimeHours:
					undertimeMinutes > 0 ? formatMinutesAsTime(undertimeMinutes) : null,
				lateHours: lateMinutes > 0 ? formatMinutesAsTime(lateMinutes) : null,
				earlyOutHours:
					earlyOutMinutes > 0 ? formatMinutesAsTime(earlyOutMinutes) : null,
				scheduleSnapshot: { set: scheduleSnapshot } as any,
				isManualEntry: true,
			};
			attendanceWritePayloads.push({
				dateKey,
				dateOnly,
				updateData: attendanceWriteData,
				createData: {
					organizationId,
					employeeId,
					date: dateOnly,
					...attendanceWriteData,
				},
			});
			for (const periodConfig of periodWindowConfigs) {
				if (dateKey >= periodConfig.startKey && dateKey <= periodConfig.endKey) {
					const existing = workdayCandidatesByPeriod.get(periodConfig.id) || [];
					existing.push(dateKey);
					workdayCandidatesByPeriod.set(periodConfig.id, existing);
					break;
				}
			}
		}

		day.setUTCDate(day.getUTCDate() + 1);
	}

	const attendancePayloadDateKeys = new Set(
		attendanceWritePayloads.map((payload) => payload.dateKey),
	);
	const intentionallySkippedDateKeys = new Set(
		forceSkippedDateKeys.filter((dateKey) => attendancePayloadDateKeys.has(dateKey)),
	);
	// Real offices skew absences toward the edges of the work week (Monday/Friday)
	// rather than spreading them uniformly. Biasing selection this way turns the
	// per-employee AWOL budget into a believable weekly dip instead of arbitrary noise.
	const awolWeekdayBias = (dateKey: string) => {
		const dayOfWeek = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
		return dayOfWeek === 1 || dayOfWeek === 5 ? 0.4 : 1;
	};

	for (const periodConfig of periodWindowConfigs) {
		if (periodConfig.desiredVirtualAwolCount <= 0) continue;
		const candidates = workdayCandidatesByPeriod.get(periodConfig.id) || [];
		if (!candidates.length) continue;

		const selectedCount = Math.min(periodConfig.desiredVirtualAwolCount, candidates.length);
		const selectedDateKeys = [...candidates]
			.sort((left, right) => {
				const leftScore =
					hashSeed(`${employeeCode}-${periodConfig.id}-${left}-awol`) * awolWeekdayBias(left);
				const rightScore =
					hashSeed(`${employeeCode}-${periodConfig.id}-${right}-awol`) * awolWeekdayBias(right);
				return leftScore - rightScore;
			})
			.slice(0, selectedCount);

		for (const dateKey of selectedDateKeys) {
			intentionallySkippedDateKeys.add(dateKey);
		}
	}

	for (const chunk of chunkArray(attendanceWritePayloads, SEED_ATTENDANCE_DAY_BATCH_SIZE)) {
		await Promise.all(
			chunk.map((payload) =>
				intentionallySkippedDateKeys.has(payload.dateKey)
					? Promise.resolve(null)
					: withPrismaWriteRetry(
							async () => {
								const existingAttendance = await prisma.attendance.findFirst({
									where: {
										organizationId,
										employeeId,
										date: payload.dateOnly,
										isDeleted: false,
										ledgerType: "RAW",
									},
									orderBy: {
										createdAt: "desc",
									},
								});

								if (existingAttendance) {
									return prisma.attendance.update({
										where: { id: existingAttendance.id },
										data: payload.updateData,
									});
								}

								return prisma.attendance.create({
									data: payload.createData,
								});
							},
							`attendance seed write for ${employeeCode} on ${payload.dateOnly.toISOString().split("T")[0]}`,
						),
			),
		);
	}

	const skippedDateCleanupKeys = [
		...new Set([...intentionallySkippedDateKeys, ...forceSkippedDateKeys]),
	];
	if (skippedDateCleanupKeys.length > 0) {
		await prisma.attendance.deleteMany({
			where: {
				organizationId,
				employeeId,
				isDeleted: false,
				ledgerType: "RAW",
				isManualEntry: true,
				date: {
					in: skippedDateCleanupKeys.map(
						(dateKey) => new Date(`${dateKey}T00:00:00.000Z`),
					),
				},
			},
		});
	}

	const futureCleanupStart = new Date(end);
	futureCleanupStart.setUTCDate(futureCleanupStart.getUTCDate() + 1);
	const futureAttendanceCleanup = await prisma.attendance.deleteMany({
		where: {
			organizationId,
			employeeId,
			isDeleted: false,
			ledgerType: "RAW",
			isManualEntry: true,
			date: { gte: futureCleanupStart },
		},
	});
	if (futureAttendanceCleanup.count > 0) {
		logSeedStep(
			`removed ${futureAttendanceCleanup.count} future seeded attendance row(s) for ${employeeCode} after ${end.toISOString().split("T")[0]}.`,
		);
	}

	attendanceCount -= intentionallySkippedDateKeys.size;

	return {
		workdayCount,
		attendanceCount,
		intentionalVirtualAwolDays: intentionallySkippedDateKeys.size,
	};
};

const generateSeedEmployeeArtifacts = async (params: {
	organizationId: string;
	employee: Awaited<ReturnType<typeof prisma.employee.create>>;
	definition: SeedEmployeeDefinition;
	employeeProgressLabel?: string;
	departmentId: string;
	scheduleTemplateId: string;
	sourceLabel: string;
	backdateStartDate: Date;
	demoAttendanceEndDate: Date;
	backdatedTargetPeriods: Awaited<ReturnType<typeof resolveBackdatedTargetPeriods>>;
	currentTargetPeriod: Awaited<ReturnType<typeof resolveCurrentTargetPeriod>>;
	hrManagerEmployeeId: string | null;
	skipTodayAttendance?: boolean;
}) => {
	const employeeProgressLabel = params.employeeProgressLabel
		? `${params.employeeProgressLabel} `
		: "";

	await ensureEmployeeScheduleAssignment({
		organizationId: params.organizationId,
		employeeId: params.employee.id,
		departmentId: params.departmentId,
		scheduleTemplateId: params.scheduleTemplateId,
		startDate: getMondayAnchorUtc(params.employee.employmentStartDate || getSeedStartDate()),
		sourceLabel: params.sourceLabel,
	});
	logSeedStep(
		`${employeeProgressLabel}schedule assigned for ${params.definition.email} using template ${params.scheduleTemplateId}.`,
	);

	const wantsPerfectAttendance = Boolean(params.definition.perfectAttendance);
	const attendanceSummary = await generateAttendanceRecords({
		organizationId: params.organizationId,
		employeeId: params.employee.id,
		employeeCode: params.definition.employeeCode,
		startDate: params.backdateStartDate,
		endDate: params.demoAttendanceEndDate,
		includeOvertime: params.definition.includeOvertime,
		perfectAttendance: wantsPerfectAttendance,
		forceSkippedDateKeys: params.skipTodayAttendance
			? [params.demoAttendanceEndDate.toISOString().split("T")[0]]
			: [],
		targetPayrollPeriods: [
			...params.backdatedTargetPeriods.map((period) => ({
				id: period.id,
				startDate: period.startDate,
				endDate: period.endDate,
				// Perfect-attendance employees keep a full punched workday set.
				allowVirtualAwol: !wantsPerfectAttendance,
			})),
			{
				id: params.currentTargetPeriod.id,
				startDate: params.currentTargetPeriod.startDate,
				endDate: params.currentTargetPeriod.endDate,
				// Allow a couple of occasional unpunched days in the open period so day-by-day
				// metrics (e.g. the attendance trend chart) show movement, not a flat line.
				// CEO (perfectAttendance) never gets these intentional gaps.
				allowVirtualAwol: !wantsPerfectAttendance,
				maxVirtualAwolCount: 2,
			},
		],
	});
	logSeedStep(
		`${employeeProgressLabel}attendance generated for ${params.definition.email}: ${attendanceSummary.attendanceCount} records across ${attendanceSummary.workdayCount} workdays (${attendanceSummary.intentionalVirtualAwolDays} intentionally unpunched day(s))${wantsPerfectAttendance ? " [perfectAttendance]" : ""}.`,
	);

	const targetPayrollPeriodIds = params.backdatedTargetPeriods.map((period) => period.id);
	const existingTimesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: params.employee.id,
			payrollPeriodId: { in: targetPayrollPeriodIds },
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			status: true,
			submittedAt: true,
			approvalDate: true,
			payrollPeriodId: true,
		},
	});
	const existingTimesheetByPeriodId = new Map(
		existingTimesheets.map((timesheet) => [timesheet.payrollPeriodId, timesheet] as const),
	);
	const recentTimesheetRequests = await prisma.request.findMany({
		where: {
			organizationId: params.organizationId,
			requesterId: params.employee.id,
			type: "TIMESHEET",
			isDeleted: false,
		},
		select: {
			id: true,
			metadata: true,
		},
		orderBy: { createdAt: "desc" },
		take: Math.max(40, params.backdatedTargetPeriods.length * 12),
	});
	const existingRequestByTimesheetId = new Map<string, { id: string }>();
	for (const request of recentTimesheetRequests) {
		const metadata = ((request.metadata as Record<string, unknown> | null) || {}) as Record<
			string,
			unknown
		>;
		if (String(metadata.timesheetAction || "").toUpperCase() !== "SUBMISSION") continue;
		const timesheetId = String(metadata.timesheetId || "");
		if (!timesheetId || existingRequestByTimesheetId.has(timesheetId)) continue;
		existingRequestByTimesheetId.set(timesheetId, { id: request.id });
	}

	for (const [timesheetIndex, payrollPeriod] of params.backdatedTargetPeriods.entries()) {
		const existingTimesheet = existingTimesheetByPeriodId.get(payrollPeriod.id);
		const approverEmployeeId =
			params.employee.reportToId || params.hrManagerEmployeeId || params.employee.id;
		const existingRequest = existingTimesheet
			? existingRequestByTimesheetId.get(existingTimesheet.id)
			: null;

		// Reuse seeded requests, but still repair the historical snapshot state.
		if (existingRequest && existingTimesheet) {
			await executeRequestCreationSequentially(() =>
				withPrismaWriteRetry(
					() =>
						ensureApprovedTimesheetSubmissionRequest({
							organizationId: params.organizationId,
							requestId: existingRequest.id,
							approverEmployeeId,
							sourceLabel: params.sourceLabel,
						}),
					`timesheet request approval repair for ${params.definition.email} (${payrollPeriod.code})`,
				),
			);
			await materializeTimesheetLinesFromObligations(prisma, {
				organizationId: params.organizationId,
				employeeId: params.employee.id,
				payrollPeriodId: payrollPeriod.id,
				timesheetId: existingTimesheet.id,
				fromDate: payrollPeriod.startDate,
				toDate: payrollPeriod.endDate,
			});
			await prisma.timesheet.update({
				where: { id: existingTimesheet.id },
				data: {
					status: "APPROVED",
					submittedAt: existingTimesheet.submittedAt || new Date(),
					submittedBy: params.employee.id,
					approvalDate: existingTimesheet.approvalDate || new Date(),
					approvedBy: approverEmployeeId,
					rejectionReason: null,
					notes: `Auto-generated from ${params.sourceLabel}`,
				},
			});
			logSeedStep(
				`${employeeProgressLabel}timesheet ${timesheetIndex + 1}/${params.backdatedTargetPeriods.length} already exists for ${params.definition.email}: ${existingTimesheet.id} (${payrollPeriod.code}); approved snapshot repaired.`,
			);
			continue;
		}

		// Only delete if we're regenerating (timesheet exists but request doesn't)
		if (existingTimesheet && !existingRequest) {
			await deleteRegeneratingSeedTimesheet({
				organizationId: params.organizationId,
				employeeId: params.employee.id,
				payrollPeriodId: payrollPeriod.id,
				timesheetId: existingTimesheet.id,
			});
		}

		let timesheet: { id: string; code: string };
		try {
			const createdTimesheet = await generateTimesheetForPayrollPeriod(
				prisma,
				params.employee.id,
				params.organizationId,
				payrollPeriod.id,
				`Auto-generated from ${params.sourceLabel}`,
				"APPROVED",
			);
			timesheet = {
				id: createdTimesheet.id,
				code: createdTimesheet.code,
			};
		} catch (error) {
			if (!isTimesheetUniqueConstraintConflict(error)) {
				throw error;
			}
			const existingTimesheetAfterConflict = await prisma.timesheet.findFirst({
				where: {
					organizationId: params.organizationId,
					employeeId: params.employee.id,
					payrollPeriodId: payrollPeriod.id,
				},
				select: {
					id: true,
					code: true,
				},
			});
			if (!existingTimesheetAfterConflict) {
				throw error;
			}
			timesheet = existingTimesheetAfterConflict;
			logSeedStep(
				`${employeeProgressLabel}timesheet ${timesheetIndex + 1}/${params.backdatedTargetPeriods.length} already exists due to concurrent seed write for ${params.definition.email}; reusing ${timesheet.code} (${payrollPeriod.code}).`,
			);
		}
		logSeedStep(
			`${employeeProgressLabel}timesheet ${timesheetIndex + 1}/${params.backdatedTargetPeriods.length} created for ${params.definition.email}: ${timesheet.code} (${payrollPeriod.code}).`,
		);

		const requestId = await executeRequestCreationSequentially(() =>
			withPrismaWriteRetry(
				() =>
					ensureTimesheetSubmissionRequest({
						organizationId: params.organizationId,
						timesheetId: timesheet.id,
						timesheetCode: timesheet.code,
						payrollPeriodCode: payrollPeriod.code,
						requesterId: params.employee.id,
						reason: `Auto-generated from ${params.sourceLabel}`,
						sourceLabel: params.sourceLabel,
					}),
				`timesheet submission request for ${params.definition.email} (${payrollPeriod.code})`,
			),
		);
		logSeedStep(
			`${employeeProgressLabel}timesheet request ${timesheetIndex + 1}/${params.backdatedTargetPeriods.length} prepared for ${params.definition.email}: ${requestId}.`,
		);

		await executeRequestCreationSequentially(() =>
			withPrismaWriteRetry(
				() =>
					ensureApprovedTimesheetSubmissionRequest({
						organizationId: params.organizationId,
						requestId,
						approverEmployeeId,
						sourceLabel: params.sourceLabel,
					}),
				`timesheet request approval for ${params.definition.email} (${payrollPeriod.code})`,
			),
		);
		await prisma.timesheet.update({
			where: { id: timesheet.id },
			data: {
				status: "APPROVED",
				submittedAt: new Date(),
				submittedBy: params.employee.id,
				approvalDate: new Date(),
				approvedBy: approverEmployeeId,
				rejectionReason: null,
				notes: `Auto-generated from ${params.sourceLabel}`,
			},
		});
		logSeedStep(
			`${employeeProgressLabel}timesheet ${timesheetIndex + 1}/${params.backdatedTargetPeriods.length} approved for ${params.definition.email}.`,
		);
	}

	let currentTimesheet: { id: string; code: string };
	try {
		const createdOrExistingTimesheet = await generateTimesheetForPayrollPeriod(
			prisma,
			params.employee.id,
			params.organizationId,
			params.currentTargetPeriod.id,
			`Auto-generated current demo draft from ${params.sourceLabel}`,
			"DRAFT",
		);
		currentTimesheet = {
			id: createdOrExistingTimesheet.id,
			code: createdOrExistingTimesheet.code,
		};
	} catch (error) {
		if (!isTimesheetUniqueConstraintConflict(error)) {
			throw error;
		}
		const existingCurrentTimesheet = await prisma.timesheet.findFirst({
			where: {
				organizationId: params.organizationId,
				employeeId: params.employee.id,
				payrollPeriodId: params.currentTargetPeriod.id,
				isDeleted: false,
			},
			select: {
				id: true,
				code: true,
			},
		});
		if (!existingCurrentTimesheet) {
			throw error;
		}
		currentTimesheet = existingCurrentTimesheet;
	}

	await refreshTimesheetForAttendanceDate(prisma, {
		organizationId: params.organizationId,
		employeeId: params.employee.id,
		date: params.demoAttendanceEndDate,
	});
	await prisma.timesheet.update({
		where: { id: currentTimesheet.id },
		data: {
			status: "DRAFT",
			submittedAt: null,
			submittedBy: null,
			approvedBy: null,
			approvalDate: null,
			rejectionReason: null,
			notes: `Auto-generated current demo draft from ${params.sourceLabel}`,
		},
	});
	await materializeTimesheetLinesFromObligations(prisma, {
		organizationId: params.organizationId,
		employeeId: params.employee.id,
		payrollPeriodId: params.currentTargetPeriod.id,
		timesheetId: currentTimesheet.id,
		fromDate: params.currentTargetPeriod.startDate,
		toDate: params.demoAttendanceEndDate,
	});
	if (params.definition.includeOvertime) {
		await seedOvertimeDemoRequestsForCurrentDraft({
			organizationId: params.organizationId,
			employeeId: params.employee.id,
			timesheetId: currentTimesheet.id,
			email: params.definition.email,
			sourceLabel: params.sourceLabel,
			employeeProgressLabel,
		});
	}
	logSeedStep(
		`${employeeProgressLabel}current-period draft timesheet ready for ${params.definition.email}: ${currentTimesheet.code} (${params.currentTargetPeriod.code}, attendance through ${params.demoAttendanceEndDate.toISOString().split("T")[0]}).`,
	);
};

const seedOvertimeDemoRequestsForCurrentDraft = async (params: {
	organizationId: string;
	employeeId: string;
	timesheetId: string;
	email: string;
	sourceLabel: string;
	employeeProgressLabel: string;
}) => {
	if (params.email !== "employee@seed.local") return;

	const lines = await prisma.timesheetline.findMany({
		where: {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			isDeleted: false,
			isEffective: true,
		},
		orderBy: { date: "asc" },
		select: {
			id: true,
			date: true,
			metadata: true,
		},
	});

	const candidates = lines.filter((line) => {
		const candidate = readOvertimeCandidateFromMetadata(line.metadata);
		return candidate.isCandidate && !candidate.overtimeRequestId;
	});
	if (!candidates.length) {
		logSeedStep(
			`${params.employeeProgressLabel}no overtime candidates to demo-seed for ${params.email}.`,
		);
		return;
	}

	const targetLine = candidates[0];
	try {
		await createOvertimeRequestForTimesheetLine({
			prisma,
			organizationId: params.organizationId,
			employeeId: params.employeeId,
			timesheetId: params.timesheetId,
			timesheetLineId: targetLine.id,
			date: targetLine.date,
			description: `Seeded overtime demo for ${targetLine.date.toISOString().split("T")[0]}`,
			notes: `Auto-generated from ${params.sourceLabel}`,
			generateRequestCode: async () => nextSeedRequestCode(),
		});
		logSeedStep(
			`${params.employeeProgressLabel}seeded overtime request for ${params.email} on ${targetLine.date.toISOString().split("T")[0]} (${candidates.length - 1} candidate day(s) left for manual filing).`,
		);
	} catch (error) {
		const message = String((error as Error)?.message || error);
		if (message === "OVERTIME_REQUEST_ALREADY_FILED") return;
		logSeedStep(
			`${params.employeeProgressLabel}skipped overtime demo seed for ${params.email}: ${message}`,
		);
	}
};

const repairPastSeededTimesheetSnapshots = async (params: {
	organizationId: string;
	employeeIds: string[];
	hrManagerEmployeeId?: string | null;
	sourceLabel: string;
}) => {
	const employeeIds = [...new Set(params.employeeIds.filter(Boolean))];
	if (!employeeIds.length) return 0;

	const seedToday = getSeedTodayDate();
	const staleTimesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: { in: employeeIds },
			isDeleted: false,
			status: { not: "APPROVED" },
			payrollPeriod: {
				isDeleted: false,
				endDate: { lt: seedToday },
			},
		},
		select: {
			id: true,
			employeeId: true,
			payrollPeriodId: true,
			submittedAt: true,
			approvalDate: true,
			employee: {
				select: {
					reportToId: true,
				},
			},
			payrollPeriod: {
				select: {
					code: true,
					startDate: true,
					endDate: true,
				},
			},
			employeePayroll: {
				select: {
					isPaid: true,
				},
			},
		},
		orderBy: [{ payrollPeriod: { startDate: "asc" } }, { employeeId: "asc" }],
	});

	let repairedCount = 0;
	for (const timesheet of staleTimesheets) {
		if (timesheet.employeePayroll?.isPaid) {
			continue;
		}

		await materializeTimesheetLinesFromObligations(prisma, {
			organizationId: params.organizationId,
			employeeId: timesheet.employeeId,
			payrollPeriodId: timesheet.payrollPeriodId,
			timesheetId: timesheet.id,
			fromDate: timesheet.payrollPeriod.startDate,
			toDate: timesheet.payrollPeriod.endDate,
		});

		await prisma.timesheet.update({
			where: { id: timesheet.id },
			data: {
				status: "APPROVED",
				submittedAt: timesheet.submittedAt || new Date(),
				submittedBy: timesheet.employeeId,
				approvalDate: timesheet.approvalDate || new Date(),
				approvedBy:
					timesheet.employee.reportToId ||
					params.hrManagerEmployeeId ||
					timesheet.employeeId,
				rejectionReason: null,
				notes: `Auto-generated from ${params.sourceLabel}`,
			},
		});
		repairedCount += 1;
	}

	return repairedCount;
};

async function seedEmployeePopulation(options?: SeedScenarioOptions) {
	const scenario = resolveSeedScenarioOptions(options);
	const isBulkBackdatedSeed = scenario.sourceLabel === BULK_BACKDATED_SOURCE_LABEL;
	logSeedStep(`${scenario.logLabel} started.`);
	logSeedStep(
		`Seed config: skipEmployeeDocumentUploads=${scenario.seedConfig.skipEmployeeDocumentUploads ? "true" : "false"}, generateBackdatedOperationalData=${scenario.seedConfig.generateBackdatedOperationalData ? "true" : "false"}, generateDemoRequests=${scenario.seedConfig.generateDemoRequests ? "true" : "false"}, skipTodayAttendance=${scenario.seedConfig.skipTodayAttendance ? "true" : "false"}.`,
	);
	const previousPrisma = prisma;
	if (options?.prismaClient) {
		prisma = options.prismaClient;
	}

	const checkpoint = scenario.resumeFromLastCheckpoint
		? await readSeedProgressCheckpoint(scenario.sourceLabel)
		: null;
	const useFastResumeDefaults =
		!options?.projectDefaults &&
		Boolean(checkpoint) &&
		checkpoint?.status === "in_progress" &&
		checkpoint?.executionMode === scenario.executionMode;
	const projectDefaults =
		options?.projectDefaults ||
		(useFastResumeDefaults
			? await resolveExistingProjectDefaultsForResume({
					organizationId: options?.organizationId,
			  })
			: await seedProjectDefaults(prisma, {
					organizationId: options?.organizationId,
					ensureAdminUsers: false,
			  }));
	const organizationId = projectDefaults.organizationId;
	logSeedStep(
		useFastResumeDefaults
			? `Project defaults reused for checkpoint resume: organization ${organizationId} in ${projectDefaults.mode} auth mode.`
			: `Project defaults ready for organization ${organizationId} in ${projectDefaults.mode} auth mode.`,
	);
	if (useFastResumeDefaults) {
		logSeedStep("Workflow template seeding skipped for checkpoint resume.");
	} else {
		const seededWorkflowTemplates = await seedWorkflowInstanceTemplates(prisma, organizationId);
		logSeedStep(
			`Workflow templates ready for organization ${organizationId}: created=${seededWorkflowTemplates.created}, updated=${seededWorkflowTemplates.updated}.`,
		);
	}
	seedAuthAdapter = createSeedAuthModeAdapter({
		prisma,
		mode: projectDefaults.mode,
	});
	const authOrganization: SeedAuthOrganization = projectDefaults.authOrganization;
	const backdatedTargetPeriods = await resolveBackdatedTargetPeriods(
		organizationId,
		scenario.timesheetsPerEmployee,
	);
	const seedDefinitions = isBulkBackdatedSeed
		? orderBulkEmployeeDefinitionsByHierarchy(
				generateBulkEmployeeDefinitions(scenario.employeeCount),
				getDepartmentDefinitionsForSource(BULK_BACKDATED_SOURCE_LABEL),
		  )
		: [...EMPLOYEE_DEFINITIONS];
	const findEmployeeIndexByEmail = (email: string) =>
		seedDefinitions.findIndex((item) => item.email.toLowerCase() === email.toLowerCase());
	const seedDefinitionByEmployeeCode = new Map(
		seedDefinitions.map(
			(definition, index) => [definition.employeeCode, { definition, index }] as const,
		),
	);
	const existingSeedEmployees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
			employeeId: {
				in: seedDefinitions.map((definition) => definition.employeeCode),
			},
		},
		select: {
			id: true,
			employeeId: true,
			userId: true,
		},
	});
	const existingSeedUserIds = existingSeedEmployees
		.map((employee) => employee.userId)
		.filter((value): value is string => Boolean(value));
	const existingSeedUsers = existingSeedUserIds.length
		? await prisma.user.findMany({
				where: {
					id: {
						in: existingSeedUserIds,
					},
				},
				select: {
					id: true,
					email: true,
				},
			})
		: [];
	const userEmailById = new Map(
		existingSeedUsers.map((user) => [user.id, user.email.toLowerCase()] as const),
	);
	const existingSeedDefinitionIndexes = existingSeedEmployees
		.map((employee) => seedDefinitionByEmployeeCode.get(employee.employeeId)?.index ?? -1)
		.filter((index) => index >= 0)
		.sort((left, right) => left - right);
	const existingSeedDefinitionIndexSet = new Set(existingSeedDefinitionIndexes);
	const employeeIdBySeedIndex = new Map<number, string>();
	for (const employee of existingSeedEmployees) {
		const seedDefinition = seedDefinitionByEmployeeCode.get(employee.employeeId);
		if (seedDefinition) {
			employeeIdBySeedIndex.set(seedDefinition.index, employee.id);
		}
	}
	let existingProvisionedPrefixCount = 0;
	for (const index of existingSeedDefinitionIndexes) {
		if (index === existingProvisionedPrefixCount) {
			existingProvisionedPrefixCount += 1;
			continue;
		}
		if (index > existingProvisionedPrefixCount) {
			break;
		}
	}
	const shouldGenerateBackdatedOperationalData =
		scenario.seedConfig.generateBackdatedOperationalData;
	const backdateEndDate = getSeedBackdateEndDate();
	const demoAttendanceEndDate = getSeedTodayDate();
	const currentTargetPeriod = shouldGenerateBackdatedOperationalData
		? await resolveCurrentTargetPeriod(organizationId, demoAttendanceEndDate)
		: null;
	const backdateStartDate =
		shouldGenerateBackdatedOperationalData && backdatedTargetPeriods.length > 0
			? new Date(backdatedTargetPeriods[0].startDate)
			: getSeedStartDate();
	const resolveDatabaseArtifactPrefixCount = async () => {
		if (!shouldGenerateBackdatedOperationalData || !currentTargetPeriod) return 0;

		const targetPayrollPeriodIds = [
			...backdatedTargetPeriods.map((period) => period.id),
			currentTargetPeriod.id,
		];
		if (targetPayrollPeriodIds.length === 0 || existingSeedEmployees.length === 0) return 0;

		const seededTimesheets = await prisma.timesheet.findMany({
			where: {
				organizationId,
				employeeId: { in: existingSeedEmployees.map((employee) => employee.id) },
				payrollPeriodId: { in: targetPayrollPeriodIds },
				isDeleted: false,
			},
			select: {
				employeeId: true,
				payrollPeriodId: true,
			},
		});
		const payrollPeriodIdsByEmployeeId = new Map<string, Set<string>>();
		for (const timesheet of seededTimesheets) {
			const periodIds =
				payrollPeriodIdsByEmployeeId.get(timesheet.employeeId) ?? new Set<string>();
			periodIds.add(timesheet.payrollPeriodId);
			payrollPeriodIdsByEmployeeId.set(timesheet.employeeId, periodIds);
		}

		let artifactPrefixCount = 0;
		for (let index = 0; index < seedDefinitions.length; index++) {
			const employeeId = employeeIdBySeedIndex.get(index);
			if (!employeeId) break;
			const employeePeriodIds = payrollPeriodIdsByEmployeeId.get(employeeId);
			if (
				!employeePeriodIds ||
				targetPayrollPeriodIds.some((periodId) => !employeePeriodIds.has(periodId))
			) {
				break;
			}
			artifactPrefixCount += 1;
		}
		return artifactPrefixCount;
	};
	const databaseArtifactPrefixCount =
		isBulkBackdatedSeed && scenario.resumeFromDatabase
			? await resolveDatabaseArtifactPrefixCount()
			: 0;
	const resolveCheckpointResumeIndex = (
		lastCompletedIndex?: number | null,
		lastCompletedEmail?: string | null,
	) => {
		let checkpointResumeIndex = -1;
		if (Number.isFinite(lastCompletedIndex) && Number(lastCompletedIndex) > 0) {
			// Checkpoint stores 1-based completed index; resume starts at the next 0-based index.
			checkpointResumeIndex = Math.min(
				seedDefinitions.length - 1,
				Math.max(0, Number(lastCompletedIndex)),
			);
		}
		if (lastCompletedEmail) {
			const checkpointIndex = findEmployeeIndexByEmail(lastCompletedEmail);
			const checkpointEmailExistsInDb = existingSeedUsers.some(
				(user) => user.email.toLowerCase() === lastCompletedEmail.toLowerCase(),
			);
			if (checkpointIndex >= 0 && checkpointEmailExistsInDb) {
				checkpointResumeIndex = Math.max(checkpointResumeIndex, checkpointIndex + 1);
			}
		}
		return checkpointResumeIndex;
	};
	let resumeFromEmployeeIndex = 0;
	let resumeArtifactFromEmployeeIndex = 0;
	let skipProvisioning = false;
	let resumeSource: string | null = null;
	const canResumeByEmployee = true;
	const isCheckpointExtensionRun =
		Boolean(checkpoint) &&
		checkpoint?.status === "completed" &&
		Number(checkpoint.totalEmployees || 0) < seedDefinitions.length;
	const shouldSkipExistingProvisioning =
		isBulkBackdatedSeed &&
		(scenario.resumeFromDatabase || scenario.resumeFromLastCheckpoint);
	if (canResumeByEmployee && scenario.resumeFromEmployeeEmail) {
		const requestedIndex = findEmployeeIndexByEmail(scenario.resumeFromEmployeeEmail);
		if (requestedIndex < 0) {
			throw new Error(
				`Resume email not found in generated definitions: ${scenario.resumeFromEmployeeEmail}`,
			);
		}
		resumeFromEmployeeIndex = requestedIndex;
		resumeArtifactFromEmployeeIndex = requestedIndex;
		resumeSource = "resumeFromEmployeeEmail";
	} else if (isBulkBackdatedSeed && scenario.resumeFromDatabase) {
		resumeFromEmployeeIndex = existingProvisionedPrefixCount;
		resumeArtifactFromEmployeeIndex = databaseArtifactPrefixCount;
		resumeSource = "database";
		if (
			scenario.executionMode === "phased" &&
			existingProvisionedPrefixCount >= seedDefinitions.length
		) {
			skipProvisioning = true;
			resumeFromEmployeeIndex = seedDefinitions.length;
		}
	} else if (
		canResumeByEmployee &&
		checkpoint &&
		(checkpoint.status !== "completed" || isCheckpointExtensionRun)
	) {
		const inferredCheckpointPhase =
			(isCheckpointExtensionRun ? "provision" : checkpoint.currentPhase) ||
			(checkpoint.executionMode === "phased" &&
			((checkpoint.lastArtifactEmployeeIndex ?? 0) > 0 ||
				Boolean(checkpoint.lastArtifactEmployeeEmail) ||
				checkpoint.lastCompletedEmployeeIndex > 0 ||
				Boolean(checkpoint.lastCompletedEmployeeEmail))
				? "artifacts"
				: "provision");
		const provisionResumeIndex = resolveCheckpointResumeIndex(
			checkpoint.lastProvisionedEmployeeIndex ??
				(checkpoint.executionMode === "phased" ? 0 : checkpoint.lastCompletedEmployeeIndex),
			checkpoint.lastProvisionedEmployeeEmail ??
				(checkpoint.executionMode === "phased"
					? null
					: checkpoint.lastCompletedEmployeeEmail),
		);
		const artifactResumeIndex = resolveCheckpointResumeIndex(
			checkpoint.lastArtifactEmployeeIndex ?? checkpoint.lastCompletedEmployeeIndex,
			checkpoint.lastArtifactEmployeeEmail ?? checkpoint.lastCompletedEmployeeEmail,
		);
		if (scenario.executionMode === "phased" && inferredCheckpointPhase === "artifacts") {
			skipProvisioning = true;
			resumeFromEmployeeIndex = seedDefinitions.length;
			resumeArtifactFromEmployeeIndex = Math.max(0, artifactResumeIndex);
			resumeSource = "resumeFromLastCheckpoint:artifacts";
		} else if (provisionResumeIndex >= 0) {
			resumeFromEmployeeIndex = provisionResumeIndex;
			resumeArtifactFromEmployeeIndex = provisionResumeIndex;
			resumeSource = "resumeFromLastCheckpoint:provision";
		}
	}
	if (checkpoint) {
		logSeedStep(
			`Checkpoint diagnostics: status=${checkpoint.status}, phase=${checkpoint.currentPhase || "legacy"}, checkpointTotal=${checkpoint.totalEmployees}, targetTotal=${seedDefinitions.length}, extensionRun=${isCheckpointExtensionRun ? "yes" : "no"}, lastCompletedIndex=${checkpoint.lastCompletedEmployeeIndex}, resumeProvisionIndex=${resumeFromEmployeeIndex}, resumeArtifactIndex=${resumeArtifactFromEmployeeIndex}.`,
		);
	}
	if (existingProvisionedPrefixCount > 0) {
		logSeedStep(
			`Detected ${existingProvisionedPrefixCount} contiguous seeded employees already provisioned in the database for organization ${organizationId}.`,
		);
	}
	if (isBulkBackdatedSeed && scenario.resumeFromDatabase) {
		logSeedStep(
			`Database resume mode: provisionedPrefix=${existingProvisionedPrefixCount}/${seedDefinitions.length}, artifactPrefix=${databaseArtifactPrefixCount}/${seedDefinitions.length}. Progress JSON is not used to choose the resume point.`,
		);
	}
	if (shouldSkipExistingProvisioning && existingSeedDefinitionIndexSet.size > 0) {
		logSeedStep(
			`Bulk resume will skip ${existingSeedDefinitionIndexSet.size} generated employee definition(s) already present in the database and provision only missing employee codes.`,
		);
	}

	logSeedStep(
		shouldGenerateBackdatedOperationalData
			? `Resolved ${seedDefinitions.length} employees, ${backdatedTargetPeriods.length} backdated payroll periods, and current period ${currentTargetPeriod?.code}.`
			: `Resolved ${seedDefinitions.length} employees with backdated operational data disabled for this run.`,
	);
	logSeedStep(`Execution mode: ${scenario.executionMode}.`);
	logSeedStep(
		`Seed performance config: provisionConcurrency=${SEED_PROVISION_CONCURRENCY}, artifactConcurrency=${SEED_ARTIFACT_CONCURRENCY}, attendanceBatchSize=${SEED_ATTENDANCE_DAY_BATCH_SIZE}, txMaxWaitMs=${SEED_TX_MAX_WAIT_MS}, txTimeoutMs=${SEED_TX_TIMEOUT_MS}.`,
	);
	if (resumeFromEmployeeIndex > 0 && resumeFromEmployeeIndex < seedDefinitions.length) {
		logSeedStep(
			`Resume mode (${resumeSource || "manual"}): continuing from employee ${resumeFromEmployeeIndex + 1}/${seedDefinitions.length}.`,
		);
	}
	if (resumeArtifactFromEmployeeIndex > 0) {
		logSeedStep(
			`Artifact resume mode: continuing from employee ${resumeArtifactFromEmployeeIndex + 1}/${seedDefinitions.length}.`,
		);
	}

	logSeedStep("Ensuring levels, departments, sections, positions, and schedule resources.");
	const departmentDefinitions = getDepartmentDefinitionsForSource(scenario.sourceLabel);
	const sectionDefinitions = getSectionDefinitionsForSource(scenario.sourceLabel);
	const positionDefinitions = getPositionDefinitionsForSource(scenario.sourceLabel);
	assertUniqueSeedCatalog({
		sourceLabel: scenario.sourceLabel,
		levels: LEVEL_DEFINITIONS,
		departments: departmentDefinitions,
		sections: sectionDefinitions,
		positions: positionDefinitions,
	});
	const levels = await ensureLevels(organizationId);
	const departments = await ensureDepartments(organizationId, departmentDefinitions);
	const sections = await ensureSections(organizationId, departments, sectionDefinitions);
	const positions = await ensurePositions(
		organizationId,
		departments,
		sections,
		levels,
		positionDefinitions,
	);
	const scheduleResources = await ensureScheduleResources(
		organizationId,
		Array.from(departments.values()).map((item) => item.id),
	);
	const template = scheduleResources.template;

	const emailToEmployeeId = new Map<string, string>();
	const employeeResults = new Map<string, SeedEmployeeProvisionResult>();
	for (const employee of existingSeedEmployees) {
		const email = userEmailById.get(employee.userId || "");
		if (email) {
			emailToEmployeeId.set(email, employee.id);
		}
	}
	if (isBulkBackdatedSeed) {
		await ensureSeedDepartmentManagerLinks({
			organizationId,
			departments,
			seedDefinitions,
			emailToEmployeeId,
			logPrefix: "Existing bulk seed department manager repair",
		});
	}
	const credentialExportRowsByIndex = new Array<SeedCredentialExportRow | null>(
		seedDefinitions.length,
	).fill(null);
	let createdEmployeeCount = 0;
	let updatedEmployeeCount = 0;
	let createdAuthUserCount = 0;
	let existingAuthUserCount = 0;
	let fallbackAuthUserCount = 0;
	let generatedEmployeeCount = 0;
	let provisionedEmployeeCount = 0;
	let seededCoeTicketsEarly = false;
	let seededCoeTicketsEarlyPromise: Promise<boolean> | null = null;
	let currentPhase: "provision" | "artifacts" | "completed" =
		scenario.executionMode === "phased" && skipProvisioning ? "artifacts" : "provision";
	let lastProvisionedEmployeeEmail: string | null =
		scenario.resumeFromDatabase
			? (seedDefinitions[Math.max(0, resumeFromEmployeeIndex) - 1]?.email ?? null)
			: (checkpoint?.lastProvisionedEmployeeEmail ??
			  (skipProvisioning ? seedDefinitions[seedDefinitions.length - 1]?.email || null : null));
	let lastProvisionedEmployeeIndex =
		scenario.resumeFromDatabase
			? resumeFromEmployeeIndex
			: (checkpoint?.lastProvisionedEmployeeIndex ??
			  (skipProvisioning ? seedDefinitions.length : 0));
	let lastArtifactEmployeeEmail: string | null =
		scenario.resumeFromDatabase
			? (seedDefinitions[Math.max(0, resumeArtifactFromEmployeeIndex) - 1]?.email ?? null)
			: (checkpoint?.lastArtifactEmployeeEmail ?? checkpoint?.lastCompletedEmployeeEmail ?? null);
	let lastArtifactEmployeeIndex =
		scenario.resumeFromDatabase
			? resumeArtifactFromEmployeeIndex
			: (checkpoint?.lastArtifactEmployeeIndex ?? checkpoint?.lastCompletedEmployeeIndex ?? 0);
	let lastCompletedEmployeeEmail: string | null = scenario.resumeFromDatabase
		? lastArtifactEmployeeEmail
		: (checkpoint?.lastCompletedEmployeeEmail ?? null);
	let lastCompletedEmployeeIndex = scenario.resumeFromDatabase
		? lastArtifactEmployeeIndex
		: (checkpoint?.lastCompletedEmployeeIndex ?? 0);

	const persistProgressCheckpoint = async (status: SeedProgressCheckpoint["status"]) => {
		if (!scenario.enableProgressCheckpoint) return;
		try {
			const checkpointLastCompletedEmployeeEmail =
				scenario.executionMode === "phased" && currentPhase === "provision"
					? lastProvisionedEmployeeEmail
					: lastArtifactEmployeeEmail;
			const checkpointLastCompletedEmployeeIndex =
				scenario.executionMode === "phased" && currentPhase === "provision"
					? lastProvisionedEmployeeIndex
					: lastArtifactEmployeeIndex;
			await writeSeedProgressCheckpoint({
				updatedAt: new Date().toISOString(),
				sourceLabel: scenario.sourceLabel,
				status,
				executionMode: scenario.executionMode,
				totalEmployees: seedDefinitions.length,
				currentPhase: status === "completed" ? "completed" : currentPhase,
				lastCompletedEmployeeEmail: checkpointLastCompletedEmployeeEmail,
				lastCompletedEmployeeIndex: checkpointLastCompletedEmployeeIndex,
				lastProvisionedEmployeeEmail,
				lastProvisionedEmployeeIndex,
				lastArtifactEmployeeEmail,
				lastArtifactEmployeeIndex,
				timesheetsPerEmployee: scenario.timesheetsPerEmployee,
			});
		} catch (error) {
			logSeedStep(`Unable to persist seed progress checkpoint: ${String(error)}`);
		}
	};

	const provisionEmployeeRecord = async (employeeIndex: number, runArtifacts: boolean) => {
		const definition = seedDefinitions[employeeIndex];
		const department = departments.get(definition.departmentCode);
		const section = sections.get(definition.sectionCode);
		const positionId = positions.get(definition.positionCode);
		const levelId = levels.get(definition.levelName);
		const employeeProgressLabel = `employee ${employeeIndex + 1}/${seedDefinitions.length}`;

		if (!department || !section || !positionId || !levelId) {
			throw new Error(
				`Missing seed context for ${definition.email}: department=${definition.departmentCode}, section=${definition.sectionCode}, position=${definition.positionCode}, level=${definition.levelName}`,
			);
		}
		if (section.departmentCode !== definition.departmentCode || section.departmentId !== department.id) {
			throw new Error(
				`Seed employee ${definition.email} references section ${definition.sectionCode} outside department ${definition.departmentCode}.`,
			);
		}

		const employee = await ensureEmployee({
			organizationId,
			authOrganizationId: authOrganization.id,
			departmentId: department.id,
			sectionId: section.id,
			positionId,
			levelId,
			employeeCode: definition.employeeCode,
			firstName: definition.firstName,
			lastName: definition.lastName,
			email: definition.email,
			role: definition.role,
			salary: definition.salary,
			roleId: projectDefaults.roleIds[definition.role],
			reportToId: definition.reportsToEmail
				? (emailToEmployeeId.get(definition.reportsToEmail) ?? null)
				: null,
			authToken: projectDefaults.authToken,
			employeeSeedIndex: employeeIndex,
			sourceLabel: scenario.sourceLabel,
			skipEmployeeDocumentUploads:
				scenario.seedConfig.skipEmployeeDocumentUploads,
			employmentStartDate: shouldGenerateBackdatedOperationalData
				? backdateStartDate
				: getSeedStartDate(),
		});

		emailToEmployeeId.set(definition.email, employee.employee.id);
		employeeIdBySeedIndex.set(employeeIndex, employee.employee.id);
		employeeResults.set(definition.email, employee);
		if (
			isBulkBackdatedSeed &&
			definition.isDepartmentManager &&
			department.managerId !== employee.employee.id
		) {
			await ensureSeedDepartmentManagerLinks({
				organizationId,
				departments,
				seedDefinitions: [definition],
				employeeResults,
				emailToEmployeeId,
				logPrefix: "Provisioned bulk department manager sync",
			});
		}
		createdEmployeeCount += employee.employeeAction === "created" ? 1 : 0;
		updatedEmployeeCount += employee.employeeAction === "updated" ? 1 : 0;
		createdAuthUserCount += employee.authUserSource === "created" ? 1 : 0;
		existingAuthUserCount += employee.authUserSource === "existing" ? 1 : 0;
		fallbackAuthUserCount += employee.authUserSource === "fallback" ? 1 : 0;
		provisionedEmployeeCount += 1;
		lastProvisionedEmployeeEmail = definition.email;
		lastProvisionedEmployeeIndex = employeeIndex + 1;

		if (
			scenario.seedConfig.generateDemoRequests &&
			!seededCoeTicketsEarly &&
			!seededCoeTicketsEarlyPromise &&
			provisionedEmployeeCount >= Math.min(2, seedDefinitions.length)
		) {
			seededCoeTicketsEarlyPromise = executeRequestCreationSequentially(() =>
				withPrismaWriteRetry(
					() =>
						ensureMixedSeedCertificateRequestTickets({
							organizationId,
							seedDefinitions,
							sourceLabel: scenario.sourceLabel,
						}),
					"early mixed certificate of employment request tickets",
				),
			);
			seededCoeTicketsEarly = await seededCoeTicketsEarlyPromise;
		} else if (seededCoeTicketsEarlyPromise && !seededCoeTicketsEarly) {
			seededCoeTicketsEarly = await seededCoeTicketsEarlyPromise;
		}

		const departmentName =
			departmentDefinitions.find((item) => item.code === definition.departmentCode)?.name ||
			definition.departmentCode;
		const reportsToEmail = definition.reportsToEmail || "";
		credentialExportRowsByIndex[employeeIndex] = {
			email: definition.email,
			userName: employee.userName,
			password: DEFAULT_SEED_PASSWORD,
			role: definition.role,
			employeeCode: definition.employeeCode,
			firstName: definition.firstName,
			lastName: definition.lastName,
			departmentCode: definition.departmentCode,
			departmentName,
			positionCode: definition.positionCode,
			levelName: definition.levelName,
			reportsToEmail,
			authMode: employee.authMode,
			authUserSource: employee.authUserSource,
			employeeAction: employee.employeeAction,
			scheduleTemplateCode: template.code,
			scheduleTemplateName: template.name,
			leaveBalanceSummary: formatLeaveBalanceSummary(employee.employee.leaveBalances),
		};

		if (!shouldGenerateBackdatedOperationalData) {
			await ensureEmployeeScheduleAssignment({
				organizationId,
				employeeId: employee.employee.id,
				departmentId: department.id,
				scheduleTemplateId: template.id,
				startDate: getMondayAnchorUtc(
					employee.employee.employmentStartDate || getSeedStartDate(),
				),
				sourceLabel: `${scenario.sourceLabel}-baseline`,
			});
			logSeedStep(
				`${employeeProgressLabel} baseline schedule assigned for ${definition.email} using template ${template.id}.`,
			);
			const obligationBackfillResults =
				await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
					organizationId,
					employeeId: employee.employee.id,
				});
			const obligationTouched = obligationBackfillResults.reduce(
				(total, result: any) => total + Number(result?.touched || 0),
				0,
			);
			logSeedStep(
				`${employeeProgressLabel} baseline attendance obligations verified for ${definition.email}: ${obligationTouched} open-period day(s) touched.`,
			);
		}

		if (
			seedDefinitions.length <= 20 ||
			provisionedEmployeeCount <= 5 ||
			provisionedEmployeeCount % 25 === 0 ||
			provisionedEmployeeCount === seedDefinitions.length
		) {
			logSeedStep(
				`Provisioned run ${provisionedEmployeeCount}; employee ${employeeIndex + 1}/${seedDefinitions.length}: ${definition.email} (${employee.employeeAction}, auth:${employee.authUserSource}).`,
			);
		}

		if (runArtifacts) {
			currentPhase = "artifacts";
			await generateSeedEmployeeArtifacts({
				organizationId,
				employee: employee.employee,
				definition,
				employeeProgressLabel,
				departmentId: department.id,
				scheduleTemplateId: template.id,
				sourceLabel: scenario.sourceLabel,
				backdateStartDate,
				demoAttendanceEndDate,
				backdatedTargetPeriods,
				currentTargetPeriod: currentTargetPeriod!,
				hrManagerEmployeeId: emailToEmployeeId.get("hr-manager@seed.local") || null,
				skipTodayAttendance: scenario.seedConfig.skipTodayAttendance,
			});

			generatedEmployeeCount += 1;
			lastArtifactEmployeeEmail = definition.email;
			lastArtifactEmployeeIndex = employeeIndex + 1;
			lastCompletedEmployeeEmail = definition.email;
			lastCompletedEmployeeIndex = employeeIndex + 1;
			await persistProgressCheckpoint("in_progress");
			if (
				seedDefinitions.length <= 20 ||
				generatedEmployeeCount <= 5 ||
				generatedEmployeeCount % 25 === 0 ||
				generatedEmployeeCount === seedDefinitions.length
			) {
				logSeedStep(
					`Completed full employee dataset for ${generatedEmployeeCount}/${seedDefinitions.length}: ${definition.email}.`,
				);
			}
		}
	};

	await persistProgressCheckpoint("in_progress");

	logSeedStep("Provisioning employee records and user accounts.");
	try {
		if (resumeFromEmployeeIndex > 0) {
			const skippedDefinitions = seedDefinitions.slice(0, resumeFromEmployeeIndex);
			if (skippedDefinitions.length > 0) {
				const skippedEmployees = await prisma.employee.findMany({
					where: {
						organizationId,
						isDeleted: false,
						employeeId: { in: skippedDefinitions.map((item) => item.employeeCode) },
					},
					select: {
						id: true,
						employeeId: true,
					},
				});
				const employeeIdToDbId = new Map(
					skippedEmployees.map((item) => [item.employeeId, item.id] as const),
				);
				for (const item of skippedEmployees) {
					const definition = skippedDefinitions.find(
						(def) => def.employeeCode === item.employeeId,
					);
					if (definition) {
						emailToEmployeeId.set(definition.email, item.id);
						const definitionIndex = seedDefinitionByEmployeeCode.get(item.employeeId)?.index;
						if (definitionIndex !== undefined) {
							employeeIdBySeedIndex.set(definitionIndex, item.id);
						}
					}
				}
				const missingResumeEmployees = skippedDefinitions.filter(
					(item) => !employeeIdToDbId.has(item.employeeCode),
				);
				if (missingResumeEmployees.length > 0) {
					const firstMissing = missingResumeEmployees[0];
					const firstMissingIndex = seedDefinitions.findIndex(
						(item) => item.employeeCode === firstMissing.employeeCode,
					);
					if (
						firstMissingIndex >= 0 &&
						firstMissingIndex < resumeFromEmployeeIndex &&
						!shouldSkipExistingProvisioning
					) {
						logSeedStep(
							`Resume alignment: ${missingResumeEmployees.length} skipped employees were missing in DB. Rolling back resume start to employee ${firstMissingIndex + 1}/${seedDefinitions.length} (first missing: ${firstMissing.email}).`,
						);
						resumeFromEmployeeIndex = firstMissingIndex;
						if (skipProvisioning) {
							skipProvisioning = false;
							currentPhase = "provision";
							resumeArtifactFromEmployeeIndex = 0;
							logSeedStep(
								"Resume alignment switched back to provisioning phase due to missing provisioned employees.",
							);
						}
					} else {
						logSeedStep(
							`Resume warning: ${missingResumeEmployees.length} skipped employees were not found in DB (sample: ${missingResumeEmployees
								.slice(0, 5)
								.map((item) => item.email)
								.join(", ")}). ${
								shouldSkipExistingProvisioning
									? "Bulk missing-only mode will still provision missing employee codes."
									: "Continuing from checkpoint anyway."
							}`,
						);
					}
				}
			}
		}

		if (
			!skipProvisioning &&
			scenario.executionMode === "phased" &&
			SEED_PROVISION_CONCURRENCY > 1
		) {
			const pendingIndexes = Array.from(
				{ length: seedDefinitions.length - resumeFromEmployeeIndex },
				(_, offset) => resumeFromEmployeeIndex + offset,
			).filter(
				(index) =>
					!shouldSkipExistingProvisioning ||
					!existingSeedDefinitionIndexSet.has(index),
			);
			while (pendingIndexes.length > 0) {
				let readyIndexes = pendingIndexes.filter((index) => {
					const definition = seedDefinitions[index];
					return (
						!definition.reportsToEmail ||
						emailToEmployeeId.has(definition.reportsToEmail)
					);
				});
				if (readyIndexes.length === 0) {
					readyIndexes = [pendingIndexes[0]];
				}
				for (const chunk of chunkArray(readyIndexes, SEED_PROVISION_CONCURRENCY)) {
					await Promise.all(chunk.map((index) => provisionEmployeeRecord(index, false)));
					await persistProgressCheckpoint("in_progress");
				}
				const readySet = new Set(readyIndexes);
				for (let index = pendingIndexes.length - 1; index >= 0; index--) {
					if (readySet.has(pendingIndexes[index])) {
						pendingIndexes.splice(index, 1);
					}
				}
			}
		} else if (!skipProvisioning) {
			for (
				let employeeIndex = resumeFromEmployeeIndex;
				employeeIndex < seedDefinitions.length;
				employeeIndex++
			) {
				if (
					shouldSkipExistingProvisioning &&
					existingSeedDefinitionIndexSet.has(employeeIndex)
				) {
					continue;
				}
				await provisionEmployeeRecord(
					employeeIndex,
					shouldGenerateBackdatedOperationalData &&
						scenario.executionMode === "perEmployee",
				);
				if (scenario.executionMode === "phased") {
					await persistProgressCheckpoint("in_progress");
				}
			}
		}

		const hrManagerEmployeeId = emailToEmployeeId.get("hr-manager@seed.local") || null;

		for (const definition of seedDefinitions.filter((item) => item.isDepartmentManager)) {
			let employee = employeeResults.get(definition.email)?.employee;
			const department = departments.get(definition.departmentCode);
			if (!employee) {
				employee =
					(await prisma.employee.findFirst({
						where: {
							organizationId,
							employeeId: definition.employeeCode,
							isDeleted: false,
						},
					})) || undefined;
			}
			if (!employee || !department) continue;

			await prisma.department.update({
				where: { id: department.id },
				data: { managerId: employee.id },
			});
		}

		if (scenario.seedConfig.generateDemoRequests) {
			await executeRequestCreationSequentially(() =>
				withPrismaWriteRetry(
					() =>
						ensureMixedSeedCertificateRequestTickets({
							organizationId,
							seedDefinitions,
							sourceLabel: scenario.sourceLabel,
						}),
					"mixed certificate of employment request tickets",
				),
			);
		} else {
			logSeedStep("Demo request seeding disabled. Skipping seeded COE/document requests.");
		}

		if (shouldGenerateBackdatedOperationalData && scenario.executionMode === "phased") {
			currentPhase = "artifacts";
			logSeedStep("Generating schedules, attendance, and approved timesheets.");
			const artifactIndexes = Array.from(
				{ length: seedDefinitions.length - resumeArtifactFromEmployeeIndex },
				(_, offset) => resumeArtifactFromEmployeeIndex + offset,
			);
			for (const chunk of chunkArray(artifactIndexes, SEED_ARTIFACT_CONCURRENCY)) {
				await Promise.all(
					chunk.map(async (employeeIndex) => {
						const definition = seedDefinitions[employeeIndex];
						let employee = employeeResults.get(definition.email)?.employee;
						const department = departments.get(definition.departmentCode);
						if (!employee) {
							employee =
								(await prisma.employee.findFirst({
									where: {
										organizationId,
										employeeId: definition.employeeCode,
										isDeleted: false,
									},
								})) || undefined;
						}
						if (!employee || !department) return;
						employeeIdBySeedIndex.set(employeeIndex, employee.id);
						const employeeProgressLabel = `employee ${employeeIndex + 1}/${seedDefinitions.length}`;

						await generateSeedEmployeeArtifacts({
							organizationId,
							employee,
							definition,
							employeeProgressLabel,
							departmentId: department.id,
							scheduleTemplateId: template.id,
							sourceLabel: scenario.sourceLabel,
							backdateStartDate,
							demoAttendanceEndDate,
							backdatedTargetPeriods,
							currentTargetPeriod: currentTargetPeriod!,
							hrManagerEmployeeId,
							skipTodayAttendance: scenario.seedConfig.skipTodayAttendance,
						});

						generatedEmployeeCount += 1;
						lastArtifactEmployeeEmail = definition.email;
						lastArtifactEmployeeIndex = employeeIndex + 1;
						if (employeeIndex + 1 > lastCompletedEmployeeIndex) {
							lastCompletedEmployeeEmail = definition.email;
							lastCompletedEmployeeIndex = employeeIndex + 1;
						}
						if (
							seedDefinitions.length <= 20 ||
							generatedEmployeeCount <= 5 ||
							generatedEmployeeCount % 25 === 0 ||
							generatedEmployeeCount === seedDefinitions.length
						) {
							logSeedStep(
								`Generated attendance/timesheets for ${generatedEmployeeCount}/${seedDefinitions.length}: ${definition.email}.`,
							);
						}
					}),
				);
				await persistProgressCheckpoint("in_progress");
			}
			const obligationBackfillResults =
				await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
					organizationId,
				});
			const obligationTouched = obligationBackfillResults.reduce(
				(total, result: any) => total + Number(result?.touched || 0),
				0,
			);
			logSeedStep(
				`Attendance obligations verified for open payroll periods: ${obligationTouched} obligation day(s) touched.`,
			);
		} else if (!shouldGenerateBackdatedOperationalData) {
			const obligationBackfillResults =
				await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
					organizationId,
				});
			const obligationTouched = obligationBackfillResults.reduce(
				(total, result: any) => total + Number(result?.touched || 0),
				0,
			);
			logSeedStep(
				`Attendance obligations verified for open payroll periods: ${obligationTouched} obligation day(s) touched.`,
			);
			logSeedStep(
				"Backdated operational data disabled. Skipping seeded schedules, attendance, and timesheets.",
			);
		}

		if (shouldGenerateBackdatedOperationalData) {
			const repairedPastSnapshots = await repairPastSeededTimesheetSnapshots({
				organizationId,
				employeeIds: [...employeeIdBySeedIndex.values()],
				hrManagerEmployeeId,
				sourceLabel: scenario.sourceLabel,
			});
			if (repairedPastSnapshots > 0) {
				logSeedStep(
					`Past seeded timesheet snapshot repair approved ${repairedPastSnapshots} stale draft/submitted row(s).`,
				);
			}
		}

		// Payroll generation is intentionally paused for seed runs.
		// We only seed attendance + period1 approved timesheets for now.
		// await generatePayrollFromTimesheets(
		// 	prisma,
		// 	period1.id,
		// 	organizationId,
		// 	projectDefaults.authUserId,
		// );

		const credentialsJsonPath = await writeSeedCredentialsJson({
			sourceLabel: scenario.sourceLabel,
			totalEmployees: seedDefinitions.length,
			rows: credentialExportRowsByIndex.filter((row): row is SeedCredentialExportRow =>
				Boolean(row),
			),
		});

		currentPhase = "completed";
		await persistProgressCheckpoint("completed");

		console.log(`${scenario.logLabel} complete.`);
		console.log("Seeded employees:");
		console.log(`  - total employees: ${seedDefinitions.length}`);
		console.log(`  - employee records created: ${createdEmployeeCount}`);
		console.log(`  - employee records updated: ${updatedEmployeeCount}`);
		console.log(`  - auth users created: ${createdAuthUserCount}`);
		console.log(`  - auth users existing: ${existingAuthUserCount}`);
		console.log(`  - auth users fallback-linked: ${fallbackAuthUserCount}`);
		if (shouldGenerateBackdatedOperationalData) {
			console.log(
				`  - target timesheets: ${seedDefinitions.length * backdatedTargetPeriods.length} approved historical + ${seedDefinitions.length} current drafts`,
			);
		} else {
			console.log("  - target timesheets: skipped (backdated operational data disabled)");
		}
		console.log(
			`  - conflict summary (request create/update/approval): ${conflictCounters.requestCreateConflicts}/${conflictCounters.requestUpdateConflicts}/${conflictCounters.requestApprovalConflicts}`,
		);
		console.log(
			`  - document upload summary (attempted/succeeded/failed/skipped): ${seedDocumentUploadCounters.attempted}/${seedDocumentUploadCounters.succeeded}/${seedDocumentUploadCounters.failed}/${seedDocumentUploadCounters.skipped}`,
		);
		if (shouldGenerateBackdatedOperationalData) {
			console.log(
				`  - attendance window: ${backdateStartDate.toISOString().split("T")[0]} to ${demoAttendanceEndDate.toISOString().split("T")[0]}`,
			);
			console.log(`  - schedule template: ${template.code} (${template.name})`);
		} else {
			console.log("  - attendance window: skipped");
			console.log(`  - schedule template: ${template.code} (${template.name})`);
		}
		console.log(`  - credentials json: ${credentialsJsonPath}`);
		for (const definition of seedDefinitions.slice(0, 10)) {
			console.log(
				`  - ${definition.email} (${definition.role}) password: ${DEFAULT_SEED_PASSWORD}`,
			);
		}

		return {
			totalEmployees: seedDefinitions.length,
			totalTimesheets: shouldGenerateBackdatedOperationalData
				? seedDefinitions.length * backdatedTargetPeriods.length + seedDefinitions.length
				: 0,
			backdateStartDate,
			backdateEndDate,
			demoAttendanceEndDate,
			currentTargetPeriodId: currentTargetPeriod?.id || null,
			credentialsJsonPath,
			createdEmployeeCount,
			updatedEmployeeCount,
			createdAuthUserCount,
			existingAuthUserCount,
			fallbackAuthUserCount,
		};
	} catch (error) {
		await persistProgressCheckpoint("failed");
		console.log(
			`[seed] Conflict summary before failure (request create/update/approval): ${conflictCounters.requestCreateConflicts}/${conflictCounters.requestUpdateConflicts}/${conflictCounters.requestApprovalConflicts}`,
		);
		console.log(
			`[seed] Document upload summary before failure (attempted/succeeded/failed/skipped): ${seedDocumentUploadCounters.attempted}/${seedDocumentUploadCounters.succeeded}/${seedDocumentUploadCounters.failed}/${seedDocumentUploadCounters.skipped}`,
		);
		throw error;
	} finally {
		prisma = previousPrisma;
	}
}

export async function seedGeneralEmployees() {
	return seedEmployeePopulation({
		sourceLabel: "generalEmployeeSeeder",
		logLabel: "General employee seeding",
	});
}

export type GeneralEmployeeSeedConfig = NonNullable<SeedScenarioOptions["seedConfig"]>;

export async function seedGeneralEmployeesWithConfig(seedConfig?: GeneralEmployeeSeedConfig) {
	return seedEmployeePopulation({
		sourceLabel: "generalEmployeeSeeder",
		logLabel: "General employee seeding",
		seedConfig,
	});
}

export async function seedGeneralEmployeesForProvisioning(options: {
	prismaClient: PrismaClient;
	organizationId: string;
	projectDefaults?: Awaited<ReturnType<typeof seedProjectDefaults>>;
	seedConfig?: GeneralEmployeeSeedConfig;
}) {
	return seedEmployeePopulation({
		sourceLabel: "generalEmployeeSeeder",
		logLabel: "General employee seeding",
		prismaClient: options.prismaClient,
		organizationId: options.organizationId,
		projectDefaults: options.projectDefaults,
		seedConfig: options.seedConfig,
	});
}

export async function seedBulkBackdatedEmployees(options?: SeedScenarioOptions) {
	return seedEmployeePopulation({
		employeeCount: Math.max(
			MIN_BULK_DEPARTMENT_EMPLOYEE_COUNT,
			options?.employeeCount ?? DEFAULT_BULK_SEED_EMPLOYEE_COUNT,
		),
		timesheetsPerEmployee:
			options?.timesheetsPerEmployee ?? DEFAULT_BULK_SEED_TIMESHEETS_PER_EMPLOYEE,
		resumeFromEmployeeEmail: options?.resumeFromEmployeeEmail,
		resumeFromLastCheckpoint: options?.resumeFromLastCheckpoint,
		resumeFromDatabase: options?.resumeFromDatabase ?? true,
		enableProgressCheckpoint: options?.enableProgressCheckpoint,
		executionMode: options?.executionMode ?? "phased",
		sourceLabel: BULK_BACKDATED_SOURCE_LABEL,
		logLabel: "Bulk backdated employee seeding",
		seedConfig: {
			skipEmployeeDocumentUploads:
				options?.seedConfig?.skipEmployeeDocumentUploads ?? false,
			generateBackdatedOperationalData:
				options?.seedConfig?.generateBackdatedOperationalData ?? true,
			generateDemoRequests: options?.seedConfig?.generateDemoRequests ?? true,
			skipTodayAttendance: options?.seedConfig?.skipTodayAttendance ?? true,
		},
	});
}

export async function disconnectGeneralEmployeeSeederPrisma() {
	await prisma.$disconnect();
}
