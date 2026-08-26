// Common types used across the application
export interface ApiResponse<T = any> {
	data: T;
	message?: string;
	success: boolean;
	errors?: string[];
}

export interface PaginatedResponse<T = any> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
}

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface FilterOption {
	field: string;
	operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in" | "nin" | "contains";
	value: any;
}

export interface SortOption {
	field: string;
	direction: "asc" | "desc";
}

export interface SearchParams {
	query?: string;
	filters?: FilterOption[];
	sort?: SortOption[];
	page?: number;
	limit?: number;
}

export interface Notification {
	id: string;
	title: string;
	message: string;
	type: "info" | "success" | "warning" | "error";
	read: boolean;
	createdAt: string;
	actionUrl?: string;
	actionLabel?: string;
}

export interface User {
	id: string;
	email: string;
	name: string;
	role: UserRole;
	avatar?: string;
	permissions: Permission[];
	lastLoginAt?: string;
	createdAt: string;
	updatedAt: string;
	token?: string;
	person?: {
		personalInfo: {
			prefix?: string;
			firstName: string;
			middleName?: string;
			lastName: string;
			dateOfBirth: string;
			placeOfBirth: string;
			age: number;
			nationality: string;
			primaryLanguage: string;
			gender: string;
			currency?: string;
			vipCode?: string;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: string;
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			fax?: string;
			address: {
				street: string;
				address2?: string;
				city: string;
				state: string;
				country: string;
				postalCode: string;
				zipCode: string;
				houseNumber: string;
			};
		};
		identification: {
			type: string;
			number: string;
			issuingCountry: string;
			expiryDate: string;
		};
		metadata: {
			isActive: boolean;
			status?: string;
			createdBy?: string;
			updatedBy?: string;
			lastLoginAt?: string;
			isDeleted: boolean;
		};
		id: string;
		organizationId?: string;
	};
	organization?: {
		id: string;
		name: string;
		description: string;
		code: string;
		branding?: any;
	};
}

export type UserRole =
	| "hris-hr-manager"
	| "hris-hr-user"
	| "hris-employee"
	| "hris-employee-manager"
	| "hris-timekeeper"
	| "hris-admin"
	| "admin"
	| "super_admin";

export type Permission =
	| "read_employees"
	| "write_employees"
	| "delete_employees"
	| "read_payroll"
	| "write_payroll"
	| "read_attendance"
	| "write_attendance"
	| "read_leave"
	| "write_leave"
	| "approve_leave"
	| "read_reports"
	| "write_reports"
	| "manage_settings"
	| "manage_users";

export interface Department {
	id: string;
	name: string;
	description?: string;
	managerId?: string;
	managerName?: string;
	employeeCount: number;
	budget?: number;
	location?: string;
	isActive: boolean;
}

export interface Team {
	id: string;
	name: string;
	description?: string;
	departmentId: string;
	departmentName: string;
	leadId?: string;
	leadName?: string;
	memberCount: number;
	isActive: boolean;
}

export interface AuditLog {
	id: string;
	userId: string;
	userName: string;
	action: string;
	resource: string;
	resourceId: string;
	oldValues?: Record<string, any>;
	newValues?: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
	timestamp: string;
}

export interface FileUpload {
	id: string;
	name: string;
	size: number;
	type: string;
	url: string;
	uploadedAt: string;
	uploadedBy: string;
}

export interface SystemSettings {
	id: string;
	key: string;
	value: any;
	type: "string" | "number" | "boolean" | "object" | "array";
	description?: string;
	category: string;
	isPublic: boolean;
	updatedAt: string;
	updatedBy: string;
}
