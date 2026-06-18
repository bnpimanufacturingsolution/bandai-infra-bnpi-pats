import type { User } from "~/types/auth";

export function getAdminPath(user: User, section: string = "dashboard"): string {
	// Basic implementation based on common patterns
	if (user?.role === "super_admin") return "/superadmin";

	// Check for org admin or similar
	if (["org_admin", "admin"].includes(user?.role || "")) {
		if (section === "apps") return "/admin/apps";
		return "/admin";
	}

	return "/";
}

export function getHomePath(user: User): string {
	return "/";
}
