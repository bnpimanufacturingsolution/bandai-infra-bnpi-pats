import { getRuntimeApiBase } from "../runtime-api-base";

// API Configuration
const API_BASE_URL = getRuntimeApiBase() || "/api";

export const API_CONFIG = {
	BASE_URL: API_BASE_URL,
	TIMEOUT: 30000,

	ENDPOINTS: {
		AUTH: {
			LOGIN: "/auth/login",
			REGISTER: "/auth/register",
			LOGOUT: "/auth/logout",
			REFRESH: "/auth/refresh",
			ME: "/auth/me",
			FORGOT_PASSWORD: "/auth/forgot-password",
			RESET_PASSWORD: "/auth/reset-password",
		},
		USER: {
			CURRENT: "/auth/me",
			PROFILE: "/user/profile",
		},
		EMPLOYEES: {
			LIST: "/hms/employees",
			DETAIL: "/hms/employees/:id",
			CREATE: "/hms/employees",
			UPDATE: "/hms/employees/:id",
			DELETE: "/hms/employees/:id",
			BULK_DELETE: "/hms/employees/bulk-delete",
			IMPORT: "/hms/employees/import",
			EXPORT: "/hms/employees/export",
		},
		DEPARTMENTS: {
			LIST: "/hms/departments",
			DETAIL: "/hms/departments/:id",
			CREATE: "/hms/departments",
			UPDATE: "/hms/departments/:id",
			DELETE: "/hms/departments/:id",
		},
		POSITIONS: {
			LIST: "/hms/positions",
			DETAIL: "/hms/positions/:id",
			CREATE: "/hms/positions",
			UPDATE: "/hms/positions/:id",
			DELETE: "/hms/positions/:id",
		},
		ATTENDANCE: {
			LIST: "/hms/attendance",
			DETAIL: "/hms/attendance/:id",
			CREATE: "/hms/attendance",
			UPDATE: "/hms/attendance/:id",
			DELETE: "/hms/attendance/:id",
			SUMMARY: "/hms/attendance/summary",
			TEAM_WEEKLY: "/hms/attendance/team/weekly",
			APPROVE: "/hms/attendance/approve/:id",
			REJECT: "/hms/attendance/reject/:id",
		},
		LEAVE: {
			LIST: "/hms/leave",
			DETAIL: "/hms/leave/:id",
			REQUEST: "/hms/leave/request",
			APPROVE: "/hms/leave/approve/:id",
			REJECT: "/hms/leave/reject/:id",
			BALANCE: "/hms/leave/balance",
		},
		PAYROLL: {
			LIST: "/hms/payroll",
			DETAIL: "/hms/payroll/:id",
			GENERATE: "/hms/payroll/generate",
			SUMMARY: "/hms/payroll/summary",
			DOWNLOAD: "/hms/payroll/:id/download",
		},
		ANNOUNCEMENTS: {
			LIST: "/hms/announcements",
			DETAIL: "/hms/announcements/:id",
			CREATE: "/hms/announcements",
			UPDATE: "/hms/announcements/:id",
			DELETE: "/hms/announcements/:id",
		},
		ROLES: {
			LIST: "/hms/roles",
			DETAIL: "/hms/roles/:id",
			CREATE: "/hms/roles",
			UPDATE: "/hms/roles/:id",
			DELETE: "/hms/roles/:id",
		},
		ROLE: {
			LIST: "/hms/role",
			DETAIL: "/hms/role/:id",
			CREATE: "/hms/role",
			UPDATE: "/hms/role/:id",
			DELETE: "/hms/role/:id",
		},
		ORGANIZATIONS: {
			LIST: "/hms/organizations",
			DETAIL: "/hms/organizations/:id",
			CREATE: "/hms/organizations",
			UPDATE: "/hms/organizations/:id",
			DELETE: "/hms/organizations/:id",
		},
	},
};

// API Response types
export interface ApiResponse<T = any> {
	success: boolean;
	message: string;
	data?: T;
	error?: string;
	errors?: Array<{ field: string; message: string }>;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface LoginRequest {
	email: string;
	password: string;
	keepLoggedIn?: boolean;
}

export interface LoginResponse {
	id: string;
	email: string;
	role:
		| "hris-hr-manager"
		| "hris-hr-user"
		| "hris-employee"
		| "hris-employee-manager"
		| "hris-timekeeper"
		| "hris-agency"
		| "hris-admin"
		| "admin"
		| "super_admin";
	subRole?: string;
	avatar?: string;
	organizationId?: string | null;
	person: {
		personalInfo: {
			prefix?: string | null;
			firstName: string;
			middleName?: string | null;
			lastName: string;
			dateOfBirth?: string | null;
			placeOfBirth?: string | null;
			age?: number | null;
			nationality?: string | null;
			primaryLanguage?: string | null;
			gender?: string | null;
			currency?: string | null;
			vipCode?: string | null;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: string;
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			fax?: string | null;
			address: any[];
		};
		identification?: any | null;
		metadata: {
			isActive: boolean;
			status?: string;
			createdBy?: string | null;
			updatedBy?: string | null;
			lastLoginAt?: string | null;
			isDeleted: boolean;
		};
		id: string;
		organizationId?: string | null;
		createdAt: string;
		updatedAt: string;
		isDeleted: boolean;
	};
	organization?: {
		id: string;
		name: string;
		description: string;
		code: string;
		branding?: any;
	} | null;
	scopes?: any[];
}

export interface RegisterRequest {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	department?: string;
	position?: string;
}

export interface Employee {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	role:
		| "hris-hr-manager"
		| "hris-hr-user"
		| "hris-employee"
		| "hris-employee-manager"
		| "hris-timekeeper"
		| "hris-agency"
		| "hris-admin"
		| "admin"
		| "super_admin";
	department?: string;
	position?: string;
	employmentHireDate: string;
	status: "active" | "inactive" | "terminated";
	phone?: string;
	address?: string;
}

export interface AttendanceRecord {
	id: string;
	employeeId: string;
	clockIn: string;
	clockOut?: string;
	date: string;
	totalHours?: number;
	status: "present" | "absent" | "late" | "half-day";
}

export interface LeaveRequest {
	id: string;
	employeeId: string;
	type: "sick" | "vacation" | "personal" | "maternity" | "paternity";
	startDate: string;
	endDate: string;
	reason: string;
	status: "pending" | "approved" | "rejected";
	requestedAt: string;
	approvedBy?: string;
	approvedAt?: string;
}

export interface PayrollRecord {
	id: string;
	employeeId: string;
	employeeName: string;
	month: number;
	year: number;
	basicSalary: number;
	allowances: number;
	deductions: number;
	netSalary: number;
	status: string;
	createdAt: string;
	updatedAt: string;
}

// Leave types
export interface LeaveRequest {
	id: string;
	employeeId: string;
	employeeName: string;
	leaveType: string;
	startDate: string;
	endDate: string;
	days: number;
	reason: string;
	status: "pending" | "approved" | "rejected";
	approvedBy?: string;
	approvedAt?: string;
	rejectedBy?: string;
	rejectedAt?: string;
	rejectionReason?: string;
	createdAt: string;
	updatedAt: string;
}
