export interface User {
	id: string;

	personId?: string;
	avatar?: string | null;
	userName?: string;
	email: string;
	status?: string;
	isDeleted?: boolean;
	lastLogin?: string;
	loginMethod?: string;
	createdAt?: string;
	updatedAt?: string;
	roleId?: string;
	organizationId?: string | null;
	// Role information (can be directly provided or derived from roleId)
	role?: string;
	subRole?: string;
	// Token (only present in login response)
	token?: string;
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
			address?: any | null;
		};
		identification?: any | null;
		metadata: {
			isActive: boolean;
			status: string | null;
			createdBy: string | null;
			updatedBy: string | null;
			lastLoginAt: string | null;
			isDeleted: boolean;
		};
		id: string;
		organizationId?: string | null;
	};
	// Organization information (derived from organizationId)
	organization?: {
		provisioning?: {
			hasAdmin: boolean;
			hasHrSettings: boolean;
			isProvisioned: boolean;
			initializationStatus: "IDLE" | "RUNNING" | "FAILED" | "COMPLETED";
			previewAvailable: boolean;
			mode: "PROVISIONING" | "READY";
		};
		branding?: {
			logo?: string;
			background?: string;
			font?: string;
			provisioning?: {
				hasAdmin?: boolean;
				hasHrSettings?: boolean;
				isProvisioned?: boolean;
				initializationStatus?: "IDLE" | "RUNNING" | "FAILED" | "COMPLETED";
				previewAvailable?: boolean;
				mode?: "PROVISIONING" | "READY";
			};
			colors?: {
				primary?: string;
				secondary?: string;
				accent?: string;
				success?: string;
				warning?: string;
				danger?: string;
				info?: string;
				light?: string;
				dark?: string;
				neutral?: string;
			};
		};
		id?: string;
		name?: string;
		code?: string;
		description?: string;
		createdAt?: string;
		updatedAt?: string;
	};
	metadata?: {
		isFirstLogin?: boolean;
		employee?: {
			id: string;
			organizationId?: string;
			employeeId?: string;
			employmentStatus?: string;
			employmentType?: string;
			employmentHireDate?: string;
			isTour?: boolean;
			personalInfo: {
				firstName: string;
				lastName: string;
			};
			department?: {
				id: string;
				name: string;
				code: string;
			};
			isDepartmentManager?: boolean;
			position?: {
				id: string;
				title: string;
				code: string;
			};
			level?: {
				id: string;
				name: string;
				rank: number;
			};
			role?: string;
			isManager?: boolean;
			isHrManager?: boolean;
			hasDirectReports?: boolean;
			reportTo?: {
				id: string;
				firstName: string;
				lastName: string;
				email: string;
			};
		};
		requirePasswordChange?: boolean;
	};
}

export interface Person {
	id: string;
	personalInfo?: {
		firstName: string;
		lastName: string;
		middleName?: string;
		dateOfBirth?: string;
		gender?: string;
	};
	contactInfo?: {
		email: string;
		phones?: Array<{
			type: string;
			countryCode: string;
			number: string;
			isPrimary: boolean;
		}>;
		addresses?: Array<{
			type: string;
			street: string;
			city: string;
			state: string;
			country: string;
			postalCode: string;
			isPrimary: boolean;
		}>;
	};
	metadata?: {
		isActive: boolean;
		status: string;
		isDeleted: boolean;
	};
}

export interface UserRole {
	id: string;
	name: string;
	description?: string;
	scope: "SYSTEM" | "ORGANIZATION" | "APP";
	createdAt: string;
	updatedAt: string;
	permissionSchemeId?: string;
	permissions?: Permission[];
}

export interface Permission {
	id: string;
	name: string;
	key: string;
	description?: string;
	resource?: string;
	action?: string;
	scope: "SYSTEM" | "ORGANIZATION" | "APP";
	createdAt: string;
	updatedAt: string;
}

export interface Organization {
	id: string;
	name: string;
	description?: string;
	code: string;
	branding?: any;
	createdAt: string;
	updatedAt: string;
	permissionSchemeId?: string;
	permissionScheme?: {
		id: string;
		name: string;
		description?: string;
		scope: "SYSTEM" | "ORGANIZATION" | "APP";
		createdAt: string;
		updatedAt: string;
		roles?: UserRole[];
	};
	permissionMatrix?: any;
}

export interface App {
	id: string;
	name: string;
	description?: string;
	code: string;
	branding?: any;
	createdAt: string;
	updatedAt: string;
	organizationId: string;
	organization?: Organization;
	permissionSchemeId?: string;
}

export interface AuthContextType {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
	login: (identifier: string, password: string, appCode?: string) => Promise<User>;
	logout: () => Promise<void>;
	getCurrentUser: () => Promise<void>;
	clearError: () => void;
	hasPermission: (permission: string) => boolean;
	hasRole: (role: string) => boolean;
	hasScope: (scope: "SYSTEM" | "ORGANIZATION" | "APP") => boolean;
	validateHandoffToken: (token: string) => Promise<{
		user: User;
		token?: string;
		redirect_uri?: string;
		state?: string;
	}>;
	ssoLogin?: (
		credentials: LoginCredentials & { redirect_uri: string; state: string },
	) => Promise<any>;
}

export interface LoginCredentials {
	identifier?: string;
	email?: string;
	password: string;
	appCode?: string;
}

export interface AuthResponse {
	success: boolean;
	message: string;
	data?: {
		user: User;
		token: string;
	};
	error?: string;
}
