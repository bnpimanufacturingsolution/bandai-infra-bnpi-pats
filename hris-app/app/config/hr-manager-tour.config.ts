import type { TourStep } from "~/components/organisms/tour/ProductTourProvider";

export const hrManagerTourConfig: TourStep[] = [
	// --- Sidebar / Navigation (HR Focus) ---
	{
		element: "#sidebar-dashboard",
		popover: {
			title: "Central Dashboard",
			description:
				"As an HR Manager, your dashboard provides a high-level overview of the workforce.",
			side: "right",
		},
	},
	{
		element: "#sidebar-hr-employees",
		popover: {
			title: "Employee Management",
			description:
				"Manage the entire employee lifecycle, from personal details to organizational records.",
			side: "right",
		},
	},
	{
		element: "#sidebar-hr-recruitment",
		popover: {
			title: "ATS & Recruitment",
			description:
				"Track applicants, manage job postings, and streamline your hiring pipeline.",
			side: "right",
		},
	},
	{
		element: "#sidebar-hr-payroll-management",
		popover: {
			title: "Payroll Operations",
			description: "Run payroll, review adjustments, and manage payout processing.",
			side: "right",
		},
	},
	{
		element: "#sidebar-hr-payroll-periods",
		popover: {
			title: "Payroll Schedules",
			description: "Review payroll periods and keep cutoff timing aligned with each run.",
			side: "right",
		},
	},

	// --- General HR Settings ---
	{
		element: "#sidebar-hr-settings",
		popover: {
			title: "HR Settings",
			description:
				"Manage core HR configuration like documents, leave, timekeeping, and payroll.",
			side: "right",
		},
	},

	// --- Header / Utilities ---
	{
		element: "#navbar-user-profile",
		popover: {
			title: "Manager Portal",
			description: "Access your administrative settings and profile options.",
			side: "bottom",
			align: "end",
		},
	},

	// --- Specific Dashboards (Assume the IDs exist or will be active) ---
	{
		element: "#dashboard-profile-banner",
		popover: {
			title: "Organizational Context",
			description: "Always know your current administrative view and role context.",
			side: "bottom",
		},
	},
];
