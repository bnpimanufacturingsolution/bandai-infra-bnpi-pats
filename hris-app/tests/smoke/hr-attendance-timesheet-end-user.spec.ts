import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const timestamp = "2026-06-25T08:00:00.000Z";
const routeReadyTimeoutMs = 30_000;
const organizationId = "org-1";
const currentPeriodId = "period-current-1";
const currentPeriodCode = "P-2026-06";
const pastPeriodId = "period-past-1";
const pastPeriodCode = "P-2026-05";
const attendanceDepartmentId = "dept-ops";
const operationsEmployeeProfileId = "employee-ops-1";
const missingEmployeeProfileId = "employee-ops-2";
const approvedTimesheetId = "timesheet-approved-1";
const outputDir = path.resolve(
	process.cwd(),
	"output",
	"visual-audit",
	"hr-attendance-end-user-2026-06-27",
);

type ApiEnvelope<T> = {
	success: boolean;
	message: string;
	data: T;
};

type MockUser = {
	id: string;
	email: string;
	name: string;
	role: string;
	subRole: string;
	roleId?: string;
	organizationId: string;
	organization: {
		id: string;
		name: string;
		code: string;
		branding: { colors: Record<string, string> };
	};
	avatar?: string | null;
	metadata: {
		employee: {
			id: string;
			employeeId: string;
			employmentStatus: string;
			role: string;
			personalInfo: {
				firstName: string;
				lastName: string;
			};
			department: {
				id: string;
				name: string;
				code: string;
			};
			position: {
				id: string;
				title: string;
				code: string;
			};
			level: {
				id: string;
				name: string;
				rank: number;
			};
			isManager: boolean;
			isHrManager: boolean;
			hasDirectReports: boolean;
		};
	};
	person: {
		id: string;
		personalInfo: {
			prefix: string | null;
			firstName: string;
			lastName: string;
			dateOfBirth: string | null;
			placeOfBirth: string | null;
			age: number | null;
			nationality: string | null;
			primaryLanguage: string | null;
			gender: string | null;
			currency: string | null;
			vipCode: string | null;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: string;
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			address: null;
		};
		identification: null;
		metadata: {
			isActive: boolean;
			status: string | null;
			createdBy: string | null;
			updatedBy: string | null;
			lastLoginAt: string | null;
			isDeleted: boolean;
		};
	};
	token: string;
};

type AttendanceRecord = {
	id: string;
	employeeRefId: string;
	employeeId: string;
	employeeName: string;
	departmentId: string;
	departmentName: string;
	date: string;
	timeIn: string | null;
	timeBreak: string | null;
	timeOut: string | null;
	status: string;
	behaviorFlags: string[];
	computationMeta: {
		rawLateMinutes: number;
		gracePeriodMinutes: number;
		withinGrace: boolean;
	};
	hoursWorked: string;
	regularHours: string;
	overtimeHours: string;
	undertimeHours: string;
	lateHours: string;
	earlyOutHours: string;
	breakMinutes: number | null;
	isManualEntry: boolean;
	notes: string | null;
	timesheetId: string | null;
	isVirtual: boolean;
	primaryMarker: "HOURS" | "ABSENT";
	workforceSource: "DIRECT";
};

type TimesheetDay = {
	approvalStatus: "APPROVED";
	date: string;
	timeIn: string | null;
	timeOut: string | null;
	hoursWorked: string;
	regularHours: string;
	overtimeHours: string;
	undertimeHours: string;
	lateHours: string;
	earlyOutHours: string;
	status: string;
	employeeNotes: string | null;
	approverNotes: string | null;
	metadata: {
		businessDate: string;
		breakMinutes: number;
		breakDisplay: string;
		rawLateMinutes: number;
		gracePeriodMinutes: number;
		withinGrace: boolean;
		totalMinutes: number;
		regularMinutes: number;
		overtimeMinutes: number;
		undertimeMinutes: number;
		lateMinutes: number;
		earlyOutMinutes: number;
	};
	primaryMarker: "HOURS";
};

type TimesheetRecord = {
	id: string;
	code: string;
	organizationId: string;
	employeeId: string;
	payrollPeriodId: string;
	totalDays: number;
	totalHoursWorked: string;
	totalRegularHours: string;
	totalOvertimeHours: string;
	totalUndertimeHours: string;
	totalLateHours: string;
	totalEarlyOutHours: string;
	status: "APPROVED";
	lockedAt: string | null;
	lockedBy: string | null;
	lockReason: string | null;
	lockRunId: string | null;
	notes: string | null;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	metadata: {
		totalMinutesWorked: number;
		totalRegularMinutes: number;
		totalOvertimeMinutes: number;
		totalUndertimeMinutes: number;
		totalLateMinutes: number;
		totalEarlyOutMinutes: number;
		compensatoryLeaveCredit: {
			source: "APPROVED_OVERTIME_TIMESHEETLINES";
			leaveType: "COMPENSATORY";
			totalMinutes: number;
			totalDays: number;
			deltaMinutes: number;
			deltaDays: number;
			lineCount: number;
			creditedAt: string;
			creditedByEmployeeId: string;
			approvedOvertimeDays: Array<{
				date: string;
				overtimeHours: string;
				overtimeMinutes: number;
				workdayHours: number;
				approvalReason: string;
				employeeReason: string;
			}>;
			creditApplied?: boolean;
		};
	};
	employee: {
		id: string;
		employeeId: string;
		employeeCode: string;
		user: {
			avatar: string;
		};
		person: {
			personalInfo: {
				firstName: string;
				lastName: string;
			};
		};
		department: {
			id: string;
			name: string;
			code: string;
		};
		position: {
			id: string;
			title: string;
			code: string;
		};
		reportTo: {
			id: string;
			person: {
				personalInfo: {
					firstName: string;
					lastName: string;
				};
			};
		};
	};
	payrollPeriod: {
		id: string;
		code: string;
		name: string;
		startDate: string;
		endDate: string;
		payDate: string;
		status: string;
	};
	breakdown: TimesheetDay[];
};

const hrManagerUser: MockUser = {
	id: "user-hr-manager-1",
	email: "hr-manager@seed.local",
	name: "Harper Manager",
	role: "hris-hr-manager",
	subRole: "hris-hr-manager",
	roleId: "role-hr-manager",
	organizationId,
	organization: {
		id: organizationId,
		name: "Test Organization",
		code: "TEST",
		branding: { colors: {} },
	},
	avatar: "https://example.test/avatar.png",
	metadata: {
		employee: {
			id: "emp-hr-manager-1",
			employeeId: "EMP-HR-MGR-001",
			employmentStatus: "ACTIVE",
			role: "hris-hr-manager",
			personalInfo: {
				firstName: "Harper",
				lastName: "Manager",
			},
			department: {
				id: "dept-hr",
				name: "Human Resources",
				code: "HR",
			},
			position: {
				id: "pos-hr-manager",
				title: "HR Manager",
				code: "HR-MGR",
			},
			level: {
				id: "level-hr-manager",
				name: "Manager",
				rank: 6,
			},
			isManager: false,
			isHrManager: true,
			hasDirectReports: true,
		},
	},
	person: {
		id: "person-hr-manager-1",
		personalInfo: {
			prefix: null,
			firstName: "Harper",
			lastName: "Manager",
			dateOfBirth: null,
			placeOfBirth: null,
			age: null,
			nationality: null,
			primaryLanguage: null,
			gender: null,
			currency: null,
			vipCode: null,
		},
		contactInfo: {
			email: "hr-manager@seed.local",
			phones: [],
			address: null,
		},
		identification: null,
		metadata: {
			isActive: true,
			status: null,
			createdBy: null,
			updatedBy: null,
			lastLoginAt: null,
			isDeleted: false,
		},
	},
	token: "smoke-token",
};

const departments = [
	{
		id: attendanceDepartmentId,
		organizationId,
		name: "Operations",
		code: "OPS",
		description: "Operations team",
		managerId: hrManagerUser.metadata.employee.id,
		isHr: false,
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "dept-hr",
		organizationId,
		name: "Human Resources",
		code: "HR",
		description: "HR team",
		managerId: hrManagerUser.metadata.employee.id,
		isHr: true,
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const allEmployees = [
	{
		id: operationsEmployeeProfileId,
		organizationId,
		employeeId: "EMP-OPS-001",
		personId: "person-ops-1",
		userId: "user-ops-1",
		employmentHireDate: "2025-01-15",
		employmentStartDate: "2025-01-20",
		employmentStatus: "ACTIVE",
		employmentType: "REGULAR",
		departmentId: attendanceDepartmentId,
		positionId: "pos-ops-1",
		levelId: "level-ops-1",
		workLocation: "ONSITE",
		workforceSource: "DIRECT",
		basicSalary: 38000,
		currency: "PHP",
		payFrequency: "MONTHLY",
		isDeleted: false,
		isTour: false,
		isManager: false,
		isHrManager: false,
		createdAt: timestamp,
		updatedAt: timestamp,
		user: {
			id: "user-ops-1",
			avatar: "https://example.test/avatar-ops-1.png",
		},
		department: {
			id: attendanceDepartmentId,
			organizationId,
			name: "Operations",
			code: "OPS",
			managerId: hrManagerUser.metadata.employee.id,
			isActive: true,
			isDefault: false,
			isDeleted: false,
			createdAt: timestamp,
			updatedAt: timestamp,
		},
		position: {
			id: "pos-ops-1",
			organizationId,
			title: "Operations Associate",
			code: "OPS-01",
			departmentId: attendanceDepartmentId,
			isActive: true,
			isDeleted: false,
			createdAt: timestamp,
			updatedAt: timestamp,
		},
		level: {
			id: "level-ops-1",
			name: "Level 1",
			rank: 1,
		},
		person: {
			id: "person-ops-1",
			organizationId,
			createdAt: timestamp,
			updatedAt: timestamp,
			isDeleted: false,
			personalInfo: {
				firstName: "Amina",
				lastName: "Reyes",
				dateOfBirth: "1996-04-05",
				nationality: "Filipino",
				primaryLanguage: "English",
			},
			contactInfo: {
				email: "amina.reyes@example.test",
				phones: [],
				address: null,
			},
			identification: null,
		},
	},
	{
		id: missingEmployeeProfileId,
		organizationId,
		employeeId: "EMP-OPS-002",
		personId: "person-ops-2",
		userId: "user-ops-2",
		employmentHireDate: "2025-02-10",
		employmentStartDate: "2025-02-15",
		employmentStatus: "ACTIVE",
		employmentType: "REGULAR",
		departmentId: attendanceDepartmentId,
		positionId: "pos-ops-2",
		levelId: "level-ops-1",
		workLocation: "ONSITE",
		workforceSource: "DIRECT",
		basicSalary: 36000,
		currency: "PHP",
		payFrequency: "MONTHLY",
		isDeleted: false,
		isTour: false,
		isManager: false,
		isHrManager: false,
		createdAt: timestamp,
		updatedAt: timestamp,
		user: {
			id: "user-ops-2",
			avatar: "https://example.test/avatar-ops-2.png",
		},
		department: {
			id: attendanceDepartmentId,
			organizationId,
			name: "Operations",
			code: "OPS",
			managerId: hrManagerUser.metadata.employee.id,
			isActive: true,
			isDefault: false,
			isDeleted: false,
			createdAt: timestamp,
			updatedAt: timestamp,
		},
		position: {
			id: "pos-ops-2",
			organizationId,
			title: "Operations Clerk",
			code: "OPS-02",
			departmentId: attendanceDepartmentId,
			isActive: true,
			isDeleted: false,
			createdAt: timestamp,
			updatedAt: timestamp,
		},
		level: {
			id: "level-ops-1",
			name: "Level 1",
			rank: 1,
		},
		person: {
			id: "person-ops-2",
			organizationId,
			createdAt: timestamp,
			updatedAt: timestamp,
			isDeleted: false,
			personalInfo: {
				firstName: "Noel",
				lastName: "Ramos",
				dateOfBirth: "1995-08-20",
				nationality: "Filipino",
				primaryLanguage: "English",
			},
			contactInfo: {
				email: "noel.ramos@example.test",
				phones: [],
				address: null,
			},
			identification: null,
		},
	},
];

const presentAttendanceRecord: AttendanceRecord = {
	id: "attendance-present-1",
	employeeRefId: operationsEmployeeProfileId,
	employeeId: "EMP-OPS-001",
	employeeName: "Amina Reyes",
	departmentId: attendanceDepartmentId,
	departmentName: "Operations",
	date: "2026-06-25",
	timeIn: "2026-06-25T00:00:00.000Z",
	timeBreak: null,
	timeOut: "2026-06-25T09:00:00.000Z",
	status: "PRESENT",
	behaviorFlags: [],
	computationMeta: {
		rawLateMinutes: 0,
		gracePeriodMinutes: 0,
		withinGrace: false,
	},
	hoursWorked: "8:00",
	regularHours: "8:00",
	overtimeHours: "0:00",
	undertimeHours: "0:00",
	lateHours: "0:00",
	earlyOutHours: "0:00",
	breakMinutes: 60,
	isManualEntry: false,
	notes: "Corrected clock-out recorded by HR.",
	timesheetId: null,
	isVirtual: false,
	primaryMarker: "HOURS",
	workforceSource: "DIRECT",
};

const missingAttendanceRecord: AttendanceRecord = {
	id: "attendance-missing-1",
	employeeRefId: missingEmployeeProfileId,
	employeeId: "EMP-OPS-002",
	employeeName: "Noel Ramos",
	departmentId: attendanceDepartmentId,
	departmentName: "Operations",
	date: "2026-06-25",
	timeIn: null,
	timeBreak: null,
	timeOut: null,
	status: "NOT_CLOCKED_IN",
	behaviorFlags: [],
	computationMeta: {
		rawLateMinutes: 0,
		gracePeriodMinutes: 0,
		withinGrace: false,
	},
	hoursWorked: "0:00",
	regularHours: "0:00",
	overtimeHours: "0:00",
	undertimeHours: "0:00",
	lateHours: "0:00",
	earlyOutHours: "0:00",
	breakMinutes: null,
	isManualEntry: false,
	notes: "No attendance record generated for the day.",
	timesheetId: null,
	isVirtual: true,
	primaryMarker: "ABSENT",
	workforceSource: "DIRECT",
};

const attendanceMetricsDetailed = {
	totalPresent: 1,
	totalAbsent: 0,
	totalNotClockedIn: 1,
	totalLate: 0,
	totalOnLeave: 0,
	totalRestDay: 0,
	totalHoliday: 0,
	totalClockedIn: 1,
	totalOnTime: 1,
	totalScheduledWorkDays: 2,
	totalCalendarDays: 2,
	totalCompanyEventDays: 0,
	totalEmployeesMissingSchedule: 0,
	totalClockedOut: 1,
	totalEarlyOut: 0,
	totalOvertime: 1,
	approvedOvertimeCount: 1,
	unapprovedOvertimeCount: 0,
	leaveTypeBreakdown: [],
	shiftTypeBreakdown: [],
	avgAttendanceRate: 50,
	utilizationRate: 50,
	totalMinutesWorked: 480,
	totalOvertimeMinutes: 60,
	totalUndertimeMinutes: 0,
	totalLateMinutes: 0,
};

const attendanceDetailedResponse = {
	metrics: {
		attendanceObligationDetailed: {
			metrics: attendanceMetricsDetailed,
			records: [presentAttendanceRecord, missingAttendanceRecord],
			dateRange: {
				from: "2026-06-25",
				to: "2026-06-25",
			},
			totalRecords: 2,
			departmentBreakdown: [
				{
					departmentId: attendanceDepartmentId,
					departmentName: "Operations",
					totalRecords: 2,
					employeeCount: 2,
					scheduled: 2,
					present: 1,
					late: 0,
					absent: 0,
					leave: 0,
					missing: 1,
					overtimeHours: 1,
				},
			],
			departmentPreviewRows: [
				{
					departmentId: attendanceDepartmentId,
					departmentName: "Operations",
					rows: [presentAttendanceRecord, missingAttendanceRecord],
				},
			],
		},
	},
};

const leaveBalanceResponse = {
	metrics: {
		leaveBalanceMetrics: {
			employees: [
				{
					employeeId: "EMP-OPS-001",
					leaveBalances: [
						{
							leaveType: "SICK",
							totalEntitled: 5,
							used: 1,
							pending: 0,
							available: 4,
							carriedOver: null,
							maxCarryOver: null,
							periodStart: "2026-01-01",
							periodEnd: "2026-12-31",
						},
						{
							leaveType: "VACATION",
							totalEntitled: 10,
							used: 2,
							pending: 1,
							available: 7,
							carriedOver: null,
							maxCarryOver: null,
							periodStart: "2026-01-01",
							periodEnd: "2026-12-31",
						},
					],
				},
				{
					employeeId: "EMP-OPS-002",
					leaveBalances: [
						{
							leaveType: "VACATION",
							totalEntitled: 10,
							used: 0,
							pending: 0,
							available: 10,
							carriedOver: null,
							maxCarryOver: null,
							periodStart: "2026-01-01",
							periodEnd: "2026-12-31",
						},
					],
				},
			],
		},
	},
};

const currentPayrollPeriod = {
	id: currentPeriodId,
	name: "Payroll Period 2 - June 2026",
	code: currentPeriodCode,
	startDate: "2026-06-16",
	endDate: "2026-06-30",
	payDate: "2026-07-05",
	payFrequency: "MONTHLY",
	calculatorId: "calc-1",
	status: "OPEN",
	periodNumber: 2,
	notes: "Current active payroll period",
	createdAt: timestamp,
	updatedAt: timestamp,
	_count: {
		attendanceObligations: 2,
		timesheets: 1,
	},
};

const pastPayrollPeriod = {
	id: pastPeriodId,
	name: "Payroll Period 1 - May 2026",
	code: pastPeriodCode,
	startDate: "2026-05-16",
	endDate: "2026-05-31",
	payDate: "2026-06-05",
	payFrequency: "MONTHLY",
	calculatorId: "calc-1",
	status: "COMPLETED",
	periodNumber: 1,
	notes: "Previous payroll period",
	createdAt: timestamp,
	updatedAt: timestamp,
	_count: {
		attendanceObligations: 2,
		timesheets: 1,
	},
};

export const approvedTimesheet: TimesheetRecord = {
	id: approvedTimesheetId,
	code: "TS-20260610-001",
	organizationId,
	employeeId: "EMP-OPS-001",
	payrollPeriodId: currentPeriodId,
	totalDays: 1,
	totalHoursWorked: "9:00",
	totalRegularHours: "8:00",
	totalOvertimeHours: "1:00",
	totalUndertimeHours: "0:00",
	totalLateHours: "0:00",
	totalEarlyOutHours: "0:00",
	status: "APPROVED",
	lockedAt: null,
	lockedBy: null,
	lockReason: null,
	lockRunId: null,
	notes: "Approved overtime example for smoke coverage.",
	isDeleted: false,
	createdAt: timestamp,
	updatedAt: timestamp,
	metadata: {
		totalMinutesWorked: 540,
		totalRegularMinutes: 480,
		totalOvertimeMinutes: 60,
		totalUndertimeMinutes: 0,
		totalLateMinutes: 0,
		totalEarlyOutMinutes: 0,
		compensatoryLeaveCredit: {
			source: "APPROVED_OVERTIME_TIMESHEETLINES",
			leaveType: "COMPENSATORY",
			totalMinutes: 120,
			totalDays: 1,
			deltaMinutes: 120,
			deltaDays: 1,
			lineCount: 1,
			creditedAt: "2026-06-25T02:00:00.000Z",
			creditedByEmployeeId: hrManagerUser.metadata.employee.id,
			approvedOvertimeDays: [
				{
					date: "2026-06-10",
					overtimeHours: "1:00",
					overtimeMinutes: 60,
					workdayHours: 8,
					approvalReason: "Approved for month-end closeout",
					employeeReason: "Supported the month-end reconciliation",
				},
			],
			creditApplied: true,
		},
	},
	employee: {
		id: operationsEmployeeProfileId,
		employeeId: "EMP-OPS-001",
		employeeCode: "EMP-OPS-001",
		user: {
			avatar: "https://example.test/avatar-ops-1.png",
		},
		person: {
			personalInfo: {
				firstName: "Amina",
				lastName: "Reyes",
			},
		},
		department: {
			id: attendanceDepartmentId,
			name: "Operations",
			code: "OPS",
		},
		position: {
			id: "pos-ops-1",
			title: "Operations Associate",
			code: "OPS-01",
		},
		reportTo: {
			id: hrManagerUser.metadata.employee.id,
			person: {
				personalInfo: {
					firstName: "Harper",
					lastName: "Manager",
				},
			},
		},
	},
	payrollPeriod: {
		id: currentPeriodId,
		code: currentPeriodCode,
		name: "Payroll Period 2 - June 2026",
		startDate: "2026-06-10",
		endDate: "2026-06-10",
		payDate: "2026-06-25",
		status: "OPEN",
	},
	breakdown: [
		{
			approvalStatus: "APPROVED",
			date: "2026-06-10T00:00:00.000Z",
			timeIn: "2026-06-10T00:00:00.000Z",
			timeOut: "2026-06-10T10:00:00.000Z",
			hoursWorked: "9:00",
			regularHours: "8:00",
			overtimeHours: "1:00",
			undertimeHours: "0:00",
			lateHours: "0:00",
			earlyOutHours: "0:00",
			status: "PRESENT",
			employeeNotes: "Supported the month-end reconciliation",
			approverNotes: "Approved for month-end closeout",
			metadata: {
				businessDate: "2026-06-10",
				breakMinutes: 60,
				breakDisplay: "12:00 PM - 01:00 PM",
				rawLateMinutes: 0,
				gracePeriodMinutes: 0,
				withinGrace: false,
				totalMinutes: 540,
				regularMinutes: 480,
				overtimeMinutes: 60,
				undertimeMinutes: 0,
				lateMinutes: 0,
				earlyOutMinutes: 0,
			},
			primaryMarker: "HOURS",
		},
	],
};

export const approvedTimesheetWithoutCredit = {
	...approvedTimesheet,
	metadata: {
		...approvedTimesheet.metadata,
		compensatoryLeaveCredit: {
			...approvedTimesheet.metadata.compensatoryLeaveCredit,
			creditApplied: false,
		},
	},
};

const timesheetQueueResponse = {
	timesheetSummary: {
		total: 1,
		draft: 0,
		submitted: 0,
		approved: 1,
		correction: 0,
	},
	timesheetQueues: {
		draft: {
			timesheets: [],
			count: 0,
			pagination: {
				total: 0,
				page: 1,
				limit: 5,
				totalPages: 0,
			},
		},
		submitted: {
			timesheets: [],
			count: 0,
			pagination: {
				total: 0,
				page: 1,
				limit: 5,
				totalPages: 0,
			},
		},
		correction: {
			timesheets: [],
			count: 0,
			pagination: {
				total: 0,
				page: 1,
				limit: 5,
				totalPages: 0,
			},
		},
		approved: {
			timesheets: [approvedTimesheet],
			count: 1,
			pagination: {
				total: 1,
				page: 1,
				limit: 5,
				totalPages: 1,
			},
		},
	},
};

const timesheetStatisticsResponse = {
	metrics: {
		timesheetStatistics: {
			total: 1,
			submitted: 0,
			approved: 1,
			actionRequired: 0,
			draft: 0,
			approvalRate: 100,
			submissionRate: 0,
			actionRate: 0,
			draftRate: 0,
		},
	},
};

const json = <T,>(data: T): ApiEnvelope<T> => ({
	success: true,
	message: "OK",
	data,
});

const fulfillJson = async (route: Route, data: unknown, status = 200) => {
	await route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(data),
	});
};

const saveScreenshot = async (page: Page, filename: string) => {
	fs.mkdirSync(outputDir, { recursive: true });
	await page.screenshot({
		path: path.join(outputDir, filename),
		fullPage: true,
	});
};

export const installMockApi = async (
	page: Page,
	timesheetData: TimesheetRecord = approvedTimesheet,
) => {
	const currentTimesheetQueueResponse = {
		...timesheetQueueResponse,
		timesheetQueues: {
			...timesheetQueueResponse.timesheetQueues,
			approved: {
				...timesheetQueueResponse.timesheetQueues.approved,
				timesheets: [timesheetData],
			},
		},
	};

	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const requestUrl = new URL(request.url());
		const pathName = requestUrl.pathname;
		const method = request.method();
		const authorization = request.headers().authorization || "";

		if (!pathName.startsWith("/api/")) {
			await route.fallback();
			return;
		}

		if (pathName.endsWith("/auth/login") && method === "POST") {
			await fulfillJson(route, json(hrManagerUser));
			return;
		}

		if (pathName.endsWith("/auth/me")) {
			if (!authorization) {
				await fulfillJson(
					route,
					{
						success: false,
						message: "Unauthorized",
						error: "UNAUTHORIZED",
					},
					401,
				);
				return;
			}
			await fulfillJson(route, json(hrManagerUser));
			return;
		}

		if (pathName.endsWith("/system-provisioning/status")) {
			await fulfillJson(
				route,
				json({
					mode: "READY",
					canManageSetup: true,
					currentStep: "admin-account",
					isProvisioned: true,
					initializationStatus: "COMPLETED",
					provisionedAt: timestamp,
					provisionedBy: hrManagerUser.id,
					previewAvailable: true,
					steps: [],
					summary: {
						hasAdmin: true,
						isActivated: true,
						hasHrSettings: true,
						hasTimesheetConfig: true,
						hasPayrollCycleConfig: true,
						hasOpenPayrollPeriod: true,
						hasLeavePolicies: true,
						hasDefaultCalculator: true,
						isProvisioned: true,
						initializationStatus: "COMPLETED",
						previewAvailable: true,
					},
					organization: {
						id: organizationId,
						name: "Test Organization",
						code: "TEST",
					},
				}),
			);
			return;
		}

		if (pathName.endsWith("/metrics/actions")) {
			await fulfillJson(
				route,
				json({
					total: 1,
					summary: {
						total: 1,
						high: 1,
						medium: 0,
						low: 0,
					},
					counts: {
						dashboard: 1,
						tickets: { total: 0 },
						requests: { total: 1 },
						approvals: {
							total: 1,
							requests: 1,
							timesheet: 0,
						},
						documents: {
							total: 0,
							missing: 0,
							rejected: 0,
							expired: 0,
							needsUpdate: 0,
							pendingApproval: 0,
							hrPendingApproval: 0,
							optional: 0,
						},
						timesheets: { total: 1 },
						notifications: { total: 1 },
					},
					items: {
						dashboard: [
							{
								id: "action-1",
								kind: "APPROVAL_REQUEST",
								title: "Review overtime approval",
								description: "A pending overtime request is waiting for review.",
								priority: "high",
								statusLabel: "Pending",
								createdAt: timestamp,
								dueDate: null,
								targetPath: "/hr/approvals/requests?action=view&id=req-1",
							},
						],
						documents: [],
						onboardingDocuments: [],
					},
					categories: {
						documents: [],
					},
					analytics: {
						hrQueue: {
							teamQueue: 1,
						},
					},
				}),
			);
			return;
		}

		if (pathName.endsWith("/notification") && method === "GET") {
			await fulfillJson(
				route,
				json({
					notifications: [
						{
							id: "notif-1",
							title: "Review pending overtime",
							description: "One overtime request is waiting in your queue.",
							type: "INFO",
							category: "APPROVAL",
							createdAt: timestamp,
							recipients: {
								read: [],
								unread: [{ employeeId: hrManagerUser.metadata.employee.id, readAt: null }],
							},
							metadata: {
								entityType: "REQUEST",
								entityId: "req-1",
								routeKey: "REQUEST_APPROVAL_VIEW",
								action: "view",
								status: "PENDING",
								targetUrl: "/hr/approvals/requests?action=view&id=req-1",
							},
							sourceEmployeeId: null,
						},
					],
					count: 1,
					pagination: {
						total: 1,
						page: 1,
						limit: 20,
						totalPages: 1,
					},
				}),
			);
			return;
		}

		if (pathName.endsWith("/payrollperiod") && method === "GET") {
			const filter = requestUrl.searchParams.get("filter") || "";
			const payload =
				filter.includes("endDate<") && !filter.includes("endDate>=")
					? {
							payrollPeriods: [pastPayrollPeriod],
							pagination: {
								total: 1,
								page: 1,
								limit: Number(requestUrl.searchParams.get("limit") || 10),
								totalPages: 1,
							},
						}
					: {
							payrollPeriods: [currentPayrollPeriod, pastPayrollPeriod],
							pagination: {
								total: 2,
								page: 1,
								limit: Number(requestUrl.searchParams.get("limit") || 10),
								totalPages: 1,
							},
						};

			await fulfillJson(route, json(payload));
			return;
		}

		if (pathName.endsWith("/department") && method === "GET") {
			await fulfillJson(
				route,
				json({
					departments,
					pagination: {
						total: departments.length,
						page: 1,
						limit: 100,
						totalPages: 1,
					},
				}),
			);
			return;
		}

		if (pathName.endsWith("/employee") && method === "GET") {
			const filter = requestUrl.searchParams.get("filter") || "";
			const employees =
				filter === "directReports:exists"
					? [
							{
								...hrManagerUser.metadata.employee,
								id: hrManagerUser.metadata.employee.id,
								employeeId: hrManagerUser.metadata.employee.employeeId,
								person: {
									personalInfo: {
										firstName: "Harper",
										lastName: "Manager",
									},
								},
								user: {
									avatar: hrManagerUser.avatar,
								},
							},
						]
					: allEmployees;

			await fulfillJson(
				route,
				json({
					employees,
					count: employees.length,
					pagination: {
						total: employees.length,
						page: 1,
						limit: employees.length,
						totalPages: 1,
						hasNext: false,
						hasPrev: false,
					},
				}),
			);
			return;
		}

		if (pathName.endsWith("/metrics") && method === "POST") {
			const body = request.postDataJSON() as { model?: string; data?: string[] };
			const model = String(body?.model || "");
			const data = Array.isArray(body?.data) ? body.data : [];

			if (model === "Attendance" && data.includes("attendanceObligationDetailed")) {
				await fulfillJson(route, json(attendanceDetailedResponse));
				return;
			}

			if (model === "Employee" && data.includes("leaveBalanceMetrics")) {
				await fulfillJson(route, json(leaveBalanceResponse));
				return;
			}

			if (model === "Timesheet" && data.includes("timesheetStatistics")) {
				await fulfillJson(route, json(timesheetStatisticsResponse));
				return;
			}

			await fulfillJson(
				route,
				json({
					metrics: {},
				}),
			);
			return;
		}

		if (pathName.startsWith("/api/timesheet/view") && method === "GET") {
			await fulfillJson(route, json({ timesheet: timesheetData }));
			return;
		}

		if (
			pathName.startsWith(`/api/timesheet/${approvedTimesheetId}`) &&
			method === "GET"
		) {
			await fulfillJson(route, json(timesheetData));
			return;
		}

		if (pathName.startsWith("/api/timesheet") && method === "GET") {
			const payload =
				requestUrl.searchParams.get("timesheetQueues") === "hr"
					? currentTimesheetQueueResponse
					: {
							timesheets: [timesheetData],
							count: 1,
							pagination: {
								total: 1,
								page: 1,
								limit: Number(requestUrl.searchParams.get("limit") || 10),
								totalPages: 1,
							},
						};

			await fulfillJson(route, json(payload));
			return;
		}

		await fulfillJson(route, json({}));
	});
};

const loginAsHrManager = async (page: Page) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });

	await expect(page.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local")).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await page.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local").fill("hr-manager@seed.local");
	await page.getByPlaceholder("Enter your password").fill("Password123!");

	await Promise.all([
		page.waitForURL(/\/dashboard$/),
		page.getByRole("button", { name: "Sign In" }).click(),
	]);

	await expect(page).toHaveURL(/\/dashboard$/);
};

const openOperationsAttendanceList = async (page: Page) => {
	await page.goto("/hr/attendance", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Attendance Utilization")).toBeVisible({ timeout: routeReadyTimeoutMs });
	await expect(page.getByRole("button", { name: "View all Operations" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});

	await saveScreenshot(page, "01-main-attendance-page.png");

	await Promise.all([
		page.waitForURL(/\/hr\/attendance\?view=list&.*department=dept-ops/),
		page.getByRole("button", { name: "View all Operations" }).click(),
	]);

	await expect(page.getByText("Attendance Records")).toBeVisible({ timeout: routeReadyTimeoutMs });
};

const openAttendanceFixModal = async (page: Page, employeeName: string) => {
	const row = page.locator("tbody tr").filter({ hasText: employeeName }).first();
	await expect(row).toBeVisible({ timeout: routeReadyTimeoutMs });

	await row.getByRole("button", { name: `Fix attendance for ${employeeName}` }).click();
};

if (process.env.PLAYWRIGHT_SKIP_SMOKE_TESTS !== "1") {
	test("HR manager logs in, opens attendance, and can correct a PRESENT row with prefilled times", async ({
		page,
	}) => {
		await installMockApi(page, approvedTimesheet);
		await loginAsHrManager(page);
		await openOperationsAttendanceList(page);

		await openAttendanceFixModal(page, "Amina Reyes");
		await expect(page.getByText("Fix Attendance — Correct Attendance")).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});
		await expect(page.getByText("08:00 AM", { exact: true })).toBeVisible();
		await expect(page.getByText("05:00 PM", { exact: true })).toBeVisible();

		await saveScreenshot(page, "02-correct-attendance-modal.png");
	});

	test("HR manager can open Fix Attendance for a missing-day row and see the create-missing modal", async ({
		page,
	}) => {
		await installMockApi(page, approvedTimesheet);
		await loginAsHrManager(page);
		await openOperationsAttendanceList(page);

		await openAttendanceFixModal(page, "Noel Ramos");
		await expect(page.getByText("Fix Attendance — Create Missing Record")).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});
		await expect(page.getByRole("button", { name: "Save Missing Record" })).toBeVisible();

		await saveScreenshot(page, "03-create-missing-attendance-modal.png");
	});

	test("HR manager can open an approved timesheet, see compensatory leave credit, and inspect the overtime tooltip", async ({
		page,
	}) => {
		await installMockApi(page, approvedTimesheet);
		await loginAsHrManager(page);

		await page.goto(`/hr/timesheets?action=view&id=${approvedTimesheetId}&tab=active`, {
			waitUntil: "domcontentloaded",
		});

		await expect(page.getByRole("heading", { name: /^Timesheet/ })).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});
		await expect(page.getByText("Compensatory Leave Credited")).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});

		await page.getByText("+OT").first().hover();
		await expect(page.getByText("Approval reason")).toBeVisible({ timeout: routeReadyTimeoutMs });
		await expect(page.getByText("Employee note")).toBeVisible({ timeout: routeReadyTimeoutMs });

		await saveScreenshot(page, "04-approved-timesheet-modal.png");
	});

	test("HR manager sees the compensatory leave not credited banner when creditApplied is false and lineCount > 0", async ({
		page,
	}) => {
		await installMockApi(page, approvedTimesheetWithoutCredit as TimesheetRecord);
		await loginAsHrManager(page);

		await page.goto(`/hr/timesheets?action=view&id=${approvedTimesheetId}&tab=active`, {
			waitUntil: "domcontentloaded",
		});

		await expect(page.getByRole("heading", { name: /^Timesheet/ })).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});
		await expect(page.getByText("Compensatory Leave Not Credited")).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});
	});
}
