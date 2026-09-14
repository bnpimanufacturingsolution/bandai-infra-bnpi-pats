/**
 * Role-based redirection utility
 * Maps user roles to their respective dashboard routes
 */

export type UserRole =
	| "hris-hr-manager"
	| "hris-hr-user"
	| "hris-employee"
	| "hris-employee-manager"
	| "hris-line-leader"
	| "hris-timekeeper"
	| "hris-agency"
	| "hris-admin"
	| "admin"
	| "super_admin";

export interface RoleRedirectConfig {
	role: UserRole;
	redirectPath: string;
	description: string;
}

export const ROLE_REDIRECT_MAP: Record<UserRole, RoleRedirectConfig> = {
	admin: {
		role: "admin",
		redirectPath: "/admin/dashboard",
		description: "System Administrator Dashboard",
	},
	"hris-admin": {
		role: "hris-admin",
		redirectPath: "/admin/dashboard",
		description: "HRIS Administrator Dashboard",
	},
	"hris-hr-manager": {
		role: "hris-hr-manager",
		redirectPath: "/dashboard",
		description: "HR Manager Dashboard",
	},
	"hris-hr-user": {
		role: "hris-hr-user",
		redirectPath: "/dashboard",
		description: "HR User Dashboard",
	},
	"hris-employee": {
		role: "hris-employee",
		redirectPath: "/dashboard",
		description: "Employee Dashboard",
	},
	"hris-employee-manager": {
		role: "hris-employee-manager",
		redirectPath: "/dashboard",
		description: "Employee Manager Dashboard",
	},
	"hris-line-leader": {
		role: "hris-line-leader",
		redirectPath: "/dashboard",
		description: "Line Leader Dashboard",
	},
	"hris-timekeeper": {
		role: "hris-timekeeper",
		redirectPath: "/time-logging",
		description: "Time Keeper Dashboard",
	},
	"hris-agency": {
		role: "hris-agency",
		redirectPath: "/agency/dashboard",
		description: "Agency Workspace",
	},
	super_admin: {
		role: "super_admin",
		redirectPath: "/admin/dashboard",
		description: "Super Administrator Dashboard",
	},
};

/**
 * Get the appropriate redirect path based on user role
 * @param role - The user's role
 * @returns The redirect path for the role
 */
export const getRedirectPathByRole = (role: UserRole): string => {
	const config = ROLE_REDIRECT_MAP[role];
	if (!config) {
		console.warn(`Unknown role: ${role}, defaulting to dashboard`);
		return "/dashboard";
	}
	return config.redirectPath;
};

/**
 * Get role configuration details
 * @param role - The user's role
 * @returns Role configuration object
 */
export const getRoleConfig = (role: UserRole): RoleRedirectConfig | null => {
	return ROLE_REDIRECT_MAP[role] || null;
};

/**
 * Check if a role has access to a specific path
 * @param role - The user's role
 * @param path - The path to check access for
 * @returns Whether the role has access to the path
 */
export const hasRoleAccess = (role: UserRole, path: string): boolean => {
	// All authenticated users can access dashboard
	if (path === "/dashboard" || path.startsWith("/dashboard")) {
		return true;
	}

	const config = getRoleConfig(role);
	if (!config) return false;

	// Basic path matching - can be extended for more complex access control
	const rolePrefix = config.redirectPath.split("/")[1]; // e.g., "admin", "hr-manager", "employee"
	const pathPrefix = path.split("/")[1];

	return rolePrefix === pathPrefix;
};

/**
 * Get all available roles
 * @returns Array of all available roles
 */
export const getAllRoles = (): UserRole[] => {
	return Object.keys(ROLE_REDIRECT_MAP) as UserRole[];
};

/**
 * Get role display name
 * @param role - The user's role
 * @returns Human-readable role name
 */
export const getRoleDisplayName = (role: UserRole): string => {
	const roleNames: Record<UserRole, string> = {
		admin: "System Administrator",
		"hris-admin": "HRIS Administrator",
		"hris-hr-manager": "HR Manager",
		"hris-hr-user": "HR User",
		"hris-employee": "Employee",
		"hris-employee-manager": "Employee Manager",
		"hris-line-leader": "Line Leader",
		"hris-timekeeper": "Time Keeper",
		"hris-agency": "Agency",
		super_admin: "Super Administrator",
	};

	return roleNames[role] || role;
};

/**
 * Get settings page path based on user role
 * @param role - The user's role
 * @returns Settings page path
 */
export const getSettingsPathByRole = (role: UserRole): string => {
	return "/settings";
};
