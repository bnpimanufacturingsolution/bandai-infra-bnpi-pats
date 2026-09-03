// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const routerState = vi.hoisted(() => ({
	path: "/",
	navigate: vi.fn(),
	setSearchParams: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
	return {
		...actual,
		useNavigate: () => routerState.navigate,
		useSearchParams: () => [
			new URL(routerState.path, "http://localhost").searchParams,
			routerState.setSearchParams,
		],
	};
});

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router");
	return {
		...actual,
		useNavigate: () => routerState.navigate,
		useSearchParams: () => [
			new URL(routerState.path, "http://localhost").searchParams,
			routerState.setSearchParams,
		],
	};
});

import AttendancePage from "./attendance";
import CalendarItemsPage from "./calendar-items";
import HolidaysPage from "./holidays";
import LeaveTypesPage from "./leave-types";
import LevelsPage from "./levels";
import LoanTypesPage from "./loan-types";
import PayrollPeriodsPage from "./payroll-periods";
import SectionsPage from "./sections";
import UsersPage from "./users";
import WorkflowsPage from "./workflows";
import BenefitTypesPage from "./benefit-types";
import Document201TypesPage from "./document-201-types";
import DepartmentsPage from "./departments";
import PositionsPage from "./positions";
import ScheduleTemplatesPage from "./schedule-templates";

const calendarItems = [
	{
		id: "cal-1",
		year: 2026,
		title: "Company Planning",
		description: "Planning event",
		type: "COMPANY_EVENT",
		startDate: "2026-06-01T00:00:00.000Z",
		endDate: "2026-06-01T00:00:00.000Z",
		isAllDay: true,
		status: "ACTIVE",
	},
	{
		id: "hol-1",
		year: 2026,
		title: "Foundation Day",
		description: "Holiday",
		type: "HOLIDAY",
		startDate: "2026-06-12T00:00:00.000Z",
		endDate: "2026-06-12T00:00:00.000Z",
		isAllDay: true,
		status: "ACTIVE",
		metadata: { holidayType: "regular" },
		tags: ["holiday"],
	},
];

const userFixture = {
	id: "user-1",
	userName: "jane.santos",
	email: "jane.santos@example.com",
	status: "active",
	createdAt: "2026-06-09T00:00:00.000Z",
	updatedAt: "2026-06-09T00:00:00.000Z",
	userRoles: ["HR Admin"],
	metadata: {
		employee: {
			id: "emp-1",
			personalInfo: { firstName: "Jane", lastName: "Santos" },
			department: { name: "People Operations" },
			position: { title: "HR Officer" },
			level: { name: "Staff" },
		},
		device: { access: { status: "enrolled" } },
	},
};

const attendanceFixture = {
	id: "att-1",
	date: "2026-06-09T00:00:00.000Z",
	timeIn: "2026-06-09T00:00:00.000Z",
	timeOut: "2026-06-09T09:00:00.000Z",
	status: "PRESENT",
	isManualEntry: true,
	employee: {
		employeeId: "EMP-1",
		person: { personalInfo: { firstName: "Jane", lastName: "Santos" } },
	},
};

const benefitTypeFixture = {
	id: "benefit-1",
	code: "ALLOW",
	name: "Meal Allowance",
	description: "Meal allowance",
	category: "ALLOWANCE",
	payrollDirection: "COMPENSATION",
	reconciliationAction: "KEEP_AS_BENEFIT",
	defaultInstallments: 6,
	payrollCycleDays: 15,
	requireTermsAgreement: true,
	isTaxable: false,
	isActive: true,
	isDefault: true,
	fixedAmount: 1000,
};

const leaveTypeFixture = {
	id: "leave-1",
	name: "Vacation Leave",
	code: "VL",
	description: "Vacation leave",
	sortOrder: 1,
	isActive: true,
	enabled: true,
	isPaid: true,
	requiresApproval: true,
	allowHalfDay: true,
	requireAttachment: false,
	allowedEmploymentTypes: ["REGULAR"],
	updatedAt: "2026-06-09T00:00:00.000Z",
};

const levelFixture = {
	id: "level-1",
	name: "Manager",
	rank: 2,
	description: "People manager",
	isManager: true,
	isActive: true,
};

const sectionFixture = {
	id: "section-1",
	name: "People Operations",
	code: "HR",
	departmentId: "dept-1",
	department: { name: "Administration" },
	headId: null,
	scheduleId: null,
	isHr: true,
	isActive: true,
};

const workflowFixture = {
	id: "workflow-1",
	code: "LV",
	name: "Leave Approval",
	description: "Leave approval workflow",
	domain: "REQUEST",
	requestType: "LEAVE",
	currentStateKey: "CURRENT_STATE",
	domainRecordId: null,
	createdAt: "2026-06-09T00:00:00.000Z",
	updatedAt: "2026-06-09T00:00:00.000Z",
	states: [
		{ key: "CURRENT_STATE", label: "Current State", order: 0, isTerminal: true },
	],
	steps: [
		{
			step_number: 1,
			step_name: "Manager Approval",
			step_type: "APPROVAL",
			assignee_type: "SUPERVISOR",
			is_required: true,
		},
	],
	stateHistory: [],
};

const documentTypeFixture = {
	id: "doc-1",
	code: "TIN",
	name: "Tax Identification Number",
	category: "COMPLIANCE",
	uploadBy: "HR",
	isRequired: true,
	isEmployeeVisible: true,
	isActive: true,
	displayOrder: 1,
	fields: [],
	metadata: {
		priorityLevel: "HIGH",
		requiredForPayroll: true,
		requiredForOnboarding: true,
		requireFileForCompliance: true,
	},
};

const departmentFixture = {
	id: "dept-1",
	name: "People Operations",
	code: "HR",
	description: "People operations",
	managerId: null,
	parentId: null,
	scheduleId: "template-1",
	scheduleTemplate: { id: "template-1", name: "Regular Schedule", code: "REG" },
	schedules: [],
	isHr: true,
	isActive: true,
};

const positionFixture = {
	id: "position-1",
	title: "HR Officer",
	code: "HR-OFC",
	description: "HR officer",
	sectionId: "section-1",
	section: { ...sectionFixture, department: { name: "People Operations" } },
	levels: [{ id: "position-level-1", levelId: "level-1", level: levelFixture }],
	levelIds: ["level-1"],
	minSalary: 1000,
	maxSalary: 2000,
	isManager: false,
	isActive: true,
};

const shiftTypeFixture = {
	id: "shift-1",
	name: "Night Shift",
	code: "NS",
	isOvernight: true,
	isOff: false,
	isActive: true,
	shiftHour: 8,
	timeSlots: [{ type: "work", label: "Work", startTime: "21:00", endTime: "05:00" }],
};

const offShiftTypeFixture = {
	id: "shift-off",
	name: "Rest Day",
	code: "OFF",
	isOvernight: false,
	isOff: true,
	isActive: true,
	shiftHour: 0,
	timeSlots: [],
};

const inactiveShiftTypeFixture = {
	id: "shift-inactive",
	name: "Inactive Shift",
	code: "INA",
	isOvernight: false,
	isOff: false,
	isActive: false,
	shiftHour: 8,
	timeSlots: [{ type: "work", label: "Work", startTime: "08:00", endTime: "17:00" }],
};

const scheduleTemplateFixture = {
	id: "template-1",
	name: "Regular Schedule",
	code: "REG",
	description: "Regular schedule",
	cycleDays: 7,
	graceLateMinutes: 15,
	graceEarlyOutMinutes: 0,
	totalDay: 5,
	totalHour: 40,
	isActive: true,
	pattern: [
		{ day: 1, shiftTypeId: "shift-1", shiftType: shiftTypeFixture },
		{ day: 2, shiftTypeId: "shift-1", shiftType: shiftTypeFixture },
		{ day: 3, shiftTypeId: "shift-1", shiftType: shiftTypeFixture },
		{ day: 4, shiftTypeId: "shift-1", shiftType: shiftTypeFixture },
		{ day: 5, shiftTypeId: "shift-1", shiftType: shiftTypeFixture },
		{ day: 6, shiftTypeId: "shift-off", shiftType: offShiftTypeFixture },
		{ day: 7, shiftTypeId: "shift-off", shiftType: offShiftTypeFixture },
	],
};

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, variant, className }: any) => (
		<span data-testid="badge" data-variant={variant} className={className}>
			{children}
		</span>
	),
}));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("~/components/atoms/Input", () => ({
	Input: (props: any) => <input {...props} />,
}));

vi.mock("~/components/atoms/Modal", () => ({
	Modal: ({ open, children, title }: any) =>
		open ? (
			<section aria-label={title}>
				<h2>{title}</h2>
				{children}
			</section>
		) : null,
}));

vi.mock("~/components/atoms/Select", () => ({
	Select: ({ value }: any) => <div>{value}</div>,
}));

vi.mock("~/components/atoms/Checkbox", () => ({
	Checkbox: (props: any) => <input type="checkbox" {...props} />,
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({ title, data, columns }: any) => (
		<section data-testid={`table-${title}`}>
			<h1>{title}</h1>
			{data.map((item: any) => (
				<article key={item.id} data-testid={`row-${item.id}`}>
					{columns.map((column: any) => (
						<div key={String(column.key)} data-testid={`cell-${column.label}`}>
							{column.render
								? column.render(item[column.key], item)
								: item[column.key]}
						</div>
					))}
				</article>
			))}
		</section>
	),
}));

vi.mock("~/components/molecules/ConfigurationEmptyGuide", () => ({
	ConfigurationEmptyGuide: () => null,
}));

vi.mock("~/components/molecules/ConstraintTokens", () => ({
	ConstraintTokenRow: () => null,
}));

vi.mock("~/components/organisms/shared/GenericImportModal", () => ({
	GenericImportModal: () => null,
}));

vi.mock("~/components/ui/calendar-date-picker", () => ({
	CalendarDatePicker: () => <input type="date" />,
}));

vi.mock("~/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: any) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
	DropdownMenuItem: ({ children }: any) => <button type="button">{children}</button>,
	DropdownMenuCheckboxItem: ({ children }: any) => <button type="button">{children}</button>,
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock("~/components/ui/accordion", () => ({
	Accordion: ({ children }: any) => <div>{children}</div>,
	AccordionContent: ({ children }: any) => <div>{children}</div>,
	AccordionItem: ({ children }: any) => <div>{children}</div>,
	AccordionTrigger: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock("~/components/ui/collapsible", () => ({
	Collapsible: ({ children }: any) => <div>{children}</div>,
	CollapsibleContent: ({ children }: any) => <div>{children}</div>,
	CollapsibleTrigger: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock("~/components/ui/tabs", () => ({
	Tabs: ({ children }: any) => <div>{children}</div>,
	TabsContent: ({ children }: any) => <div>{children}</div>,
	TabsList: ({ children }: any) => <div>{children}</div>,
	TabsTrigger: ({ children }: any) => <button type="button">{children}</button>,
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({ user: { id: "user-1", organizationId: "org-1" } }),
}));

vi.mock("~/lib/hooks/use-calendar-items", () => ({
	useCalendarItems: vi.fn(() => ({
		data: { data: { items: calendarItems, pagination: { total: calendarItems.length } } },
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({ data: { data: { items: calendarItems } } }),
	})),
	useCalendarItem: vi.fn((id: string) => ({
		data: calendarItems.find((item) => item.id === id) || null,
		isLoading: false,
	})),
	useCreateCalendarItem: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateCalendarItem: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteCalendarItem: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportCalendarItems: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useLoanTypes", () => ({
	useLoanTypes: vi.fn(() => ({
		data: {
			loanTypes: [
				{
					id: "loan-1",
					name: "Salary Loan",
					category: "SALARY_LOAN",
					minAmount: 1000,
					maxAmount: 10000,
					interestRate: 1,
					maxTermMonths: 12,
					isActive: true,
				},
			],
		},
		isLoading: false,
	})),
	useLoanType: vi.fn(() => ({ data: null, isLoading: false })),
	useCreateLoanType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateLoanType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteLoanType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useBenefitTypes", () => ({
	useBenefitTypes: vi.fn(() => ({
		data: { benefitTypes: [benefitTypeFixture], pagination: { total: 1 } },
		isLoading: false,
	})),
	useBenefitType: vi.fn((id: string) => ({
		data: id ? benefitTypeFixture : null,
		isLoading: false,
	})),
	useCreateBenefitType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateBenefitType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteBenefitType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportBenefitTypes: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/usePayrollPeriods", () => ({
	usePayrollPeriods: vi.fn(() => ({
		data: {
			payrollPeriods: [
				{
					id: "period-1",
					name: "June 2026",
					startDate: "2026-06-01T00:00:00.000Z",
					endDate: "2026-06-15T00:00:00.000Z",
					payDate: "2026-06-20T00:00:00.000Z",
					payFrequency: "SEMI_MONTHLY",
					periodNumber: 1,
					status: "OPEN",
					createdAt: "2026-06-01T00:00:00.000Z",
				},
			],
			pagination: { total: 1 },
		},
		isLoading: false,
	})),
	usePayrollPeriod: vi.fn(() => ({ data: null, isLoading: false })),
	useCreatePayrollPeriod: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdatePayrollPeriod: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeletePayrollPeriod: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useGenerateTimesheetPayroll: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	usePayrollCycleConfig: vi.fn(() => ({ data: { defaultPayFrequency: "SEMI_MONTHLY" } })),
}));

vi.mock("~/lib/hooks/useLeaveTypes", () => ({
	useLeaveTypes: vi.fn(() => ({ data: { leaveTypes: [leaveTypeFixture], count: 1 }, isLoading: false })),
	useLeaveType: vi.fn((id: string) => ({ data: id ? leaveTypeFixture : null, isLoading: false })),
	useCreateLeaveType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateLeaveType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteLeaveType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportLeaveTypes: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useLevels", () => ({
	useLevels: vi.fn(() => ({ data: { levels: [levelFixture], count: 1 }, isLoading: false })),
	useLevel: vi.fn((id: string) => ({ data: id ? levelFixture : null, isLoading: false })),
	useCreateLevel: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateLevel: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteLevel: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportLevels: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: vi.fn(() => ({
		data: { positions: [positionFixture], pagination: { total: 1 } },
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({ data: { positions: [positionFixture] } }),
	})),
	usePosition: vi.fn((id: string) => ({ data: id ? positionFixture : null, isLoading: false })),
	useCreatePosition: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdatePosition: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeletePosition: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportPositions: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useSections", () => ({
	useSections: vi.fn(() => ({ data: { sections: [sectionFixture], count: 1 }, isLoading: false })),
	useSection: vi.fn((id: string) => ({ data: id ? sectionFixture : null, isLoading: false })),
	useCreateSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteSection: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportSections: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: vi.fn(() => ({
		data: { departments: [departmentFixture], pagination: { total: 1 } },
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({ data: { departments: [departmentFixture] } }),
	})),
	useDepartment: vi.fn((id: string) => ({ data: id ? departmentFixture : null, isLoading: false })),
	useCreateDepartment: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateDepartment: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteDepartment: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportDepartments: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: vi.fn(() => ({ data: { employees: [] } })),
}));

vi.mock("~/lib/hooks/useSchedules", () => ({
	useScheduleTemplates: vi.fn(() => ({
		data: { scheduleTemplates: [scheduleTemplateFixture], pagination: { total: 1 } },
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({
			data: { scheduleTemplates: [scheduleTemplateFixture] },
		}),
	})),
	useScheduleTemplate: vi.fn((id: string) => ({
		data: id ? scheduleTemplateFixture : null,
		isLoading: false,
	})),
	useShiftTypes: vi.fn(() => ({
		data: {
			shiftTypes: [shiftTypeFixture, offShiftTypeFixture, inactiveShiftTypeFixture],
			pagination: { total: 3 },
		},
		isLoading: false,
	})),
	useShiftType: vi.fn((id: string) => ({
		data:
			[shiftTypeFixture, offShiftTypeFixture, inactiveShiftTypeFixture].find(
				(item) => item.id === id,
			) || null,
		isLoading: false,
	})),
	useCreateScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDuplicateScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportSchedules: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
	useCreateShiftType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateShiftType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteShiftType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportShiftTypes: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks", () => ({
	useScheduleTemplates: vi.fn(() => ({
		data: { scheduleTemplates: [scheduleTemplateFixture], pagination: { total: 1 } },
		isLoading: false,
	})),
	useScheduleTemplate: vi.fn((id: string) => ({
		data: id ? scheduleTemplateFixture : null,
		isLoading: false,
	})),
	useShiftTypes: vi.fn(() => ({
		data: {
			shiftTypes: [shiftTypeFixture, offShiftTypeFixture, inactiveShiftTypeFixture],
			pagination: { total: 3 },
		},
		isLoading: false,
	})),
	useShiftType: vi.fn((id: string) => ({
		data:
			[shiftTypeFixture, offShiftTypeFixture, inactiveShiftTypeFixture].find(
				(item) => item.id === id,
			) || null,
		isLoading: false,
	})),
	useCreateScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDuplicateScheduleTemplate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportSchedules: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
	useCreateShiftType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateShiftType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteShiftType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useImportShiftTypes: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useWorkflowEngine", () => ({
	useWorkflowInstances: vi.fn(() => ({
		data: { workflowInstances: [workflowFixture], pagination: { total: 1 } },
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({ data: { workflowInstances: [workflowFixture] } }),
	})),
	useWorkflowInstance: vi.fn((id: string) => ({
		data: id ? workflowFixture : null,
		isLoading: false,
	})),
	useCreateWorkflowInstance: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateWorkflowInstance: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteWorkflowInstance: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useUsers", () => ({
	useUsers: vi.fn(() => ({
		data: { data: { users: [userFixture], pagination: { total: 1, totalPages: 1 } } },
		isLoading: false,
		refetch: vi.fn().mockResolvedValue({ data: { data: { users: [userFixture] } } }),
	})),
	useUser: vi.fn((id: string) => ({ data: id ? userFixture : null, isLoading: false })),
	useCreateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useUpdateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useResetUserPassword: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useDeleteUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	buildAuthAppUserFilter: vi.fn(() => "organizationId:org-1"),
	buildAuthUserFields: vi.fn(() => ["userName", "email"]),
	getAppRoleNames: vi.fn(() => "HR Admin"),
}));

vi.mock("~/lib/hooks/useRoles", () => ({
	useRoles: vi.fn(() => ({ data: { data: { roles: [{ id: "role-1", name: "HR Admin" }] } }, isLoading: false })),
}));

vi.mock("~/lib/hooks/useAttendances", () => ({
	useAttendances: vi.fn(() => ({
		data: { attendances: [attendanceFixture], pagination: { total: 1 } },
		isLoading: false,
	})),
	useAttendance: vi.fn((id: string) => ({
		data: id ? attendanceFixture : null,
		isLoading: false,
	})),
	useImportAttendance: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/hooks/useDocumentTypes", () => ({
	useDocumentTypes: vi.fn(() => ({ data: { documentTypes: [documentTypeFixture] }, isLoading: false })),
	useDocumentType: vi.fn((id: string) => ({
		data: id ? documentTypeFixture : null,
		isLoading: false,
	})),
	useCreateDocumentType: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
	useUpdateDocumentType: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
	useDeleteDocumentType: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("~/lib/ui/admin-configuration-form", () => ({
	useAdminFormErrorNavigation: () => vi.fn(),
	ADMIN_INVALID_FIELD_CLASS: "invalid-field",
}));

function renderRoute(ui: React.ReactNode, path: string) {
	cleanup();
	routerState.path = path;
	return render(<>{ui}</>);
}

function expectTextNotInBadge(text: string) {
	expect(
		screen.getAllByText(text).some((node) => !node.closest("[data-testid='badge']")),
	).toBe(true);
}

function expectTextInBadge(text: string) {
	expect(
		screen.getAllByText(text).some((node) => node.closest("[data-testid='badge']")),
	).toBe(true);
}

function expectCellTextNotInBadge(label: string, text: string) {
	const cell = screen.getAllByTestId(`cell-${label}`)[0];
	expect(within(cell).getByText(text).closest("[data-testid='badge']")).toBeNull();
}

function expectTableCellTextNotInBadge(tableTitle: string, label: string, text: string) {
	const table = screen.getByTestId(`table-${tableTitle}`);
	const cells = within(table).getAllByTestId(`cell-${label}`);
	const matchingCell = cells.find((cell) => within(cell).queryByText(text));
	expect(matchingCell).toBeTruthy();
	expect(within(matchingCell!).getByText(text).closest("[data-testid='badge']")).toBeNull();
}

function expectCellBadge(label: string, text: string) {
	const cell = screen.getAllByTestId(`cell-${label}`)[0];
	expect(within(cell).getByText(text).closest("[data-testid='badge']")).toBeInTheDocument();
}

describe("admin configuration categorical fields", () => {
	it("keeps calendar item type as a badge and status as secondary text", () => {
		renderRoute(<CalendarItemsPage />, "/admin/configuration/calendar-items");

		expectCellBadge("Type", "COMPANY_EVENT");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps holiday type as a badge and status as secondary text", () => {
		renderRoute(<HolidaysPage />, "/admin/configuration/holidays");

		expectCellBadge("Holiday Type", "Regular Holiday");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps loan category as a badge and status as secondary text", () => {
		renderRoute(<LoanTypesPage />, "/admin/configuration/loan-types");

		expectCellBadge("Category", "SALARY LOAN");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps benefit category as a badge and payroll/status/default as secondary text", () => {
		renderRoute(<BenefitTypesPage />, "/admin/configuration/benefit-types");

		expectCellBadge("Category", "Allowance");
		expectCellTextNotInBadge("Payroll", "Compensation");
		expectCellTextNotInBadge("Status", "Active");
		expectTextNotInBadge("Default");
	});

	it("keeps payroll frequency as a badge and status as secondary text", () => {
		renderRoute(<PayrollPeriodsPage />, "/admin/configuration/payroll-periods");

		expectCellBadge("Frequency", "Semi Monthly");
		expectCellTextNotInBadge("Status", "Open");
	});

	it("keeps leave enabled policy as a badge and secondary policy/status as text", () => {
		renderRoute(<LeaveTypesPage />, "/admin/configuration/leave-types");

		expectCellBadge("Policy", "Enabled");
		expectCellTextNotInBadge("Policy", "Paid");
		expectCellTextNotInBadge("Policy", "Approval");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps level manager flag as a badge and status as secondary text", () => {
		renderRoute(<LevelsPage />, "/admin/configuration/levels");

		expectCellBadge("Manager Level", "Yes");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps section HR flag as a badge and status as secondary text", () => {
		renderRoute(<SectionsPage />, "/admin/configuration/sections");

		expectCellBadge("HR", "HR");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps department HR flag primary and status as secondary text", () => {
		renderRoute(<DepartmentsPage />, "/admin/configuration/departments");

		expectCellTextNotInBadge("Status", "Active");

		renderRoute(<DepartmentsPage />, "/admin/configuration/departments?action=view&id=dept-1");
		expectTextInBadge("HR Department");
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);
	});

	it("uses secondary status text for positions in table and details", () => {
		renderRoute(<PositionsPage />, "/admin/configuration/positions");
		expectCellTextNotInBadge("Status", "Active");

		renderRoute(<PositionsPage />, "/admin/configuration/positions?action=view&id=position-1");
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);
	});

	it("uses secondary categorical text for schedule templates and shift type details", () => {
		renderRoute(<ScheduleTemplatesPage />, "/admin/configuration/schedule-templates");
		expectTableCellTextNotInBadge("Schedule Templates", "Status", "Active");

		renderRoute(
			<ScheduleTemplatesPage />,
			"/admin/configuration/schedule-templates?action=view&id=template-1",
		);
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);

		renderRoute(
			<ScheduleTemplatesPage />,
			"/admin/configuration/schedule-templates?shiftTypeAction=list",
		);
		expectTableCellTextNotInBadge("Shift Types", "Status", "Active");
		expectTableCellTextNotInBadge("Shift Types", "Status", "Off");
		expectTableCellTextNotInBadge("Shift Types", "Status", "Inactive");

		renderRoute(
			<ScheduleTemplatesPage />,
			"/admin/configuration/schedule-templates?shiftTypeAction=view&shiftTypeId=shift-1",
		);
		expectTextNotInBadge("Yes");
		expectTextNotInBadge("No");
	});

	it("keeps workflow domain as a badge and current state as secondary text", () => {
		renderRoute(<WorkflowsPage />, "/admin/configuration/workflows");

		expectCellBadge("Domain", "Request");
		expectCellTextNotInBadge("Current State", "Current State");
	});

	it("keeps user access status as a badge and account status as secondary text", () => {
		renderRoute(<UsersPage />, "/admin/configuration/users");

		expectCellBadge("Access Status", "Enrolled");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("keeps attendance table unchanged with one status badge", () => {
		renderRoute(<AttendancePage />, "/admin/configuration/attendance");

		expectCellBadge("Status", "PRESENT");
	});

	it("keeps document category as a badge and priority/flags/status as secondary text", () => {
		renderRoute(<Document201TypesPage />, "/admin/configuration/document-201-types");

		expectCellBadge("Category", "Compliance");
		expectTextNotInBadge("High");
		expectTextNotInBadge("Payroll Mandated");
		expectTextNotInBadge("Onboarding Mandated");
		expectTextNotInBadge("File Required");
		expectCellTextNotInBadge("Status", "Active");
	});

	it("uses secondary status text in calendar item, holiday, and attendance details", () => {
		renderRoute(
			<CalendarItemsPage />,
			"/admin/configuration/calendar-items?action=view&itemId=cal-1",
		);
		expectTextNotInBadge("Active");

		renderRoute(<HolidaysPage />, "/admin/configuration/holidays?action=view&id=hol-1");
		expectTextInBadge("Regular Holiday");
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);

		renderRoute(<AttendancePage />, "/admin/configuration/attendance?action=view&id=att-1");
		expectTextInBadge("Manual");
		expect(screen.getAllByText("Present").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);
	});

	it("uses category/access primary badges and secondary detail text in representative modals", () => {
		renderRoute(<BenefitTypesPage />, "/admin/configuration/benefit-types?action=view&id=benefit-1");
		expectTextInBadge("Allowance");
		expectTextNotInBadge("Compensation");

		renderRoute(<UsersPage />, "/admin/configuration/users?action=view&id=user-1");
		expectTextInBadge("Enrolled");
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);
	});

	it("uses primary badges and secondary detail text for leave, levels, sections, and workflows", () => {
		renderRoute(<LeaveTypesPage />, "/admin/configuration/leave-types?action=view&id=leave-1");
		expectTextNotInBadge("Active");

		renderRoute(<LevelsPage />, "/admin/configuration/levels?action=view&id=level-1");
		expectTextInBadge("Yes");
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);

		renderRoute(<SectionsPage />, "/admin/configuration/sections?action=view&id=section-1");
		expect(screen.getAllByText("HR").some((node) => node.closest("[data-testid='badge']"))).toBe(true);
		expect(screen.getAllByText("Active").some((node) => !node.closest("[data-testid='badge']"))).toBe(true);

		renderRoute(<WorkflowsPage />, "/admin/configuration/workflows?action=view&id=workflow-1");
		expectTextInBadge("Template");
		expectTextInBadge("APPROVAL");
		expectTextNotInBadge("Terminal");
		expectTextNotInBadge("Supervisor");
		expectTextNotInBadge("Required");
	});
});
