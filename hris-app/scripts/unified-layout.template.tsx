/**
 * UNIFIED LAYOUT TEMPLATE
 *
 * This is a template for the unified-layout.tsx that consolidates
 * all role-based layouts (hr-layout, hr-user-layout, employee-layout, manager-layout)
 * into a single unified layout with role-based conditional rendering.
 */

import React from "react";
import { Outlet } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import { Sidebar } from "@/components/organisms/Sidebar";
import { TopNavbar } from "@/components/molecules/shared/TopNavbar";
import { useIsMobile } from "@/hooks/use-mobile";

interface NavItem {
	icon: string;
	label: string;
	href: string;
	badge?: number;
	subItems?: NavItem[];
}

/**
 * BASE NAVIGATION ITEMS - Available to all roles
 */
const BASE_NAV_ITEMS: NavItem[] = [
	{
		icon: "home",
		label: "Dashboard",
		href: "/employee/dashboard",
	},
	{
		icon: "user",
		label: "Profile",
		href: "/employee/profile",
	},
	{
		icon: "clock",
		label: "Attendance",
		href: "/employee/attendance",
	},
	{
		icon: "credit-card",
		label: "Payroll",
		href: "/employee/payroll",
	},
	{
		icon: "heart",
		label: "Benefits",
		href: "/employee/benefits",
	},
	{
		icon: "book",
		label: "Learning",
		href: "/employee/learning",
	},
	{
		icon: "message-square",
		label: "Messages",
		href: "/employee/messages",
	},
	{
		icon: "bell",
		label: "Notifications",
		href: "/employee/notifications",
	},
	{
		icon: "settings",
		label: "Settings",
		href: "/employee/settings",
	},
	{
		icon: "help-circle",
		label: "Help",
		href: "/employee/help",
	},
];

/**
 * MANAGER-SPECIFIC ITEMS - For employees with manager role
 */
const MANAGER_NAV_ITEMS: NavItem[] = [
	{
		icon: "users",
		label: "Team",
		href: "/employee/team",
	},
	{
		icon: "check-circle",
		label: "Approvals",
		href: "/employee/approvals",
	},
	{
		icon: "bar-chart-2",
		label: "Reports",
		href: "/employee/reports",
	},
];

/**
 * HR-SPECIFIC ITEMS - For HR Manager and HR User roles
 */
const HR_NAV_ITEMS: NavItem[] = [
	{
		icon: "users",
		label: "Employees",
		href: "/hr/employees",
	},
	{
		icon: "briefcase",
		label: "Recruitment",
		href: "/hr/recruitment",
		subItems: [
			{
				icon: "file-text",
				label: "Job Openings",
				href: "/hr/recruitment",
			},
			{
				icon: "user-check",
				label: "Applicants",
				href: "/hr/recruitment/applicants",
			},
			{
				icon: "calendar",
				label: "Interview Schedule",
				href: "/hr/recruitment/interviews",
			},
		],
	},
	{
		icon: "attendance",
		label: "Attendance",
		href: "/hr/attendance",
	},
	{
		icon: "credit-card",
		label: "Payroll",
		href: "/hr/payroll",
		subItems: [
			{
				icon: "settings",
				label: "Payroll Management",
				href: "/hr/hr-payroll",
			},
			{
				icon: "calendar",
				label: "Payroll Periods",
				href: "/hr/payroll-periods",
			},
		],
	},
	{
		icon: "bar-chart-2",
		label: "Reports",
		href: "/hr/reports",
	},
	{
		icon: "megaphone",
		label: "Announcements",
		href: "/hr/announcements",
	},
	{
		icon: "file-text",
		label: "Document Viewer",
		href: "/hr/document-viewer",
	},
];

/**
 * Additional HR User items (if needed - currently HR Manager and HR User share same routes)
 */
const HR_USER_ADDITIONAL_ITEMS: NavItem[] = [
	{
		icon: "user-plus",
		label: "Add User",
		href: "/hr/add-user",
	},
];

/**
 * Generate navigation items based on user role
 */
function getNavItemsByRole(userRole: string): NavItem[] {
	const items = [...BASE_NAV_ITEMS];

	// Add HR-specific items if user is HR Manager or HR User
	if (["HR_MANAGER", "HR_USER"].includes(userRole)) {
		items.push(...HR_NAV_ITEMS);

		// Add HR User specific items if needed
		if (userRole === "HR_USER") {
			items.push(...HR_USER_ADDITIONAL_ITEMS);
		}
	}

	// Add manager-specific items if user is a Manager
	if (userRole === "MANAGER") {
		items.push(...MANAGER_NAV_ITEMS);
	}

	return items;
}

/**
 * Unified Layout Component
 * Serves all roles: Employee, Manager, HR Manager, HR User
 */
export default function UnifiedLayout() {
	const { user, isAuthenticated } = useAuth();
	const isMobile = useIsMobile();
	const [sidebarOpen, setSidebarOpen] = React.useState(false);

	if (!isAuthenticated || !user) {
		return null; // This shouldn't happen if proper auth guards are in place
	}

	const navItems = getNavItemsByRole(user.role || "EMPLOYEE");
	const isHR = ["HR_MANAGER", "HR_USER"].includes(user.role || "");

	return (
		<div className="flex h-screen bg-background">
			{/* Sidebar */}
			{!isMobile && <Sidebar onClose={() => setSidebarOpen(false)} />}

			{/* Main Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Top Navbar */}
				<TopNavbar
					sidebarOpen={sidebarOpen}
					onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
					showHRDropdown={isHR}
				/>

				{/* Page Content */}
				<main className="flex-1 overflow-auto">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

/**
 * IMPLEMENTATION NOTES:
 *
 * 1. IMPORT HOOKS:
 *    - useAuth() - Get current user and their role
 *    - useIsMobile() - Detect mobile view for responsive layout
 *
 * 2. IMPORT COMPONENTS:
 *    - Sidebar - Role-aware sidebar component
 *    - TopNavbar - Unified top navigation
 *
 * 3. ROLE MAPPING:
 *    - EMPLOYEE - Base items only
 *    - MANAGER - Base items + Manager items
 *    - HR_MANAGER - Base items + HR items
 *    - HR_USER - Base items + HR items + HR User specific items
 *    - ADMIN - Has own admin-layout.tsx (not part of this unified layout)
 *
 * 4. SIDEBAR UPDATES:
 *    Update your Sidebar component to:
 *    - Accept navItems as prop
 *    - Accept userRole as prop
 *    - Render conditional items based on role
 *    - Handle nested subItems for collapsible menus
 *
 * 5. ACCESS CONTROL:
 *    - Sidebar controls what's visible in navigation
 *    - Route loaders should still validate access
 *    - Components can use useAuth() to check permissions
 *
 * 6. MOBILE SUPPORT:
 *    - Hide sidebar on mobile
 *    - Show hamburger menu in TopNavbar
 *    - Consider mobile-specific nav drawer
 */
