/**
 * Admin routes where the main content pane is height-locked (no page scrollbar)
 * and tables fill remaining space with internal scroll.
 *
 * Form/detail/setup pages that need document scroll return false.
 */
export function isAdminViewportFillPath(pathname: string): boolean {
	const path = (pathname.replace(/\/+$/, "") || "/").toLowerCase();

	// Explicit non-fill (forms, wizards, dashboards, settings)
	if (
		path === "/admin/dashboard" ||
		path === "/admin/settings" ||
		path === "/admin/help" ||
		path === "/admin/profile" ||
		path === "/admin/messages" ||
		path === "/admin/notifications" ||
		path === "/admin/analytics" ||
		path === "/admin/configuration/company-profile" ||
		path === "/admin/configuration/migration" ||
		path === "/admin/configuration/calendar-full-view" ||
		path === "/admin/configuration/employees/new" ||
		path.startsWith("/admin/configuration/employees/") || // employee create/edit
		path.startsWith("/admin/devices/manage/") || // device detail
		path.startsWith("/admin/devices/enroll") ||
		path.startsWith("/admin/devices/biometrics")
	) {
		// activity-logs under a user is a table — allow fill below
		if (/^\/admin\/configuration\/users\/[^/]+\/activity-logs$/.test(path)) {
			return true;
		}
		return false;
	}

	// Configuration list tables
	if (path.startsWith("/admin/configuration/")) {
		return true;
	}

	// Admin logging + other list tables
	if (
		path === "/admin/audit-logs" ||
		path === "/admin/activity-logs" ||
		path === "/admin/rules-policies/disciplinary" ||
		path === "/admin/devices" ||
		path === "/admin/devices/manage" ||
		path === "/admin/devices/events" ||
		path === "/admin/devices/users"
	) {
		return true;
	}

	return false;
}
