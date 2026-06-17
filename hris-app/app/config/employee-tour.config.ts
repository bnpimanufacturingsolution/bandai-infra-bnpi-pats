export interface TourStep {
	element: string;
	popover: {
		title: string;
		description: string;
		side?: "top" | "left" | "right" | "bottom";
		align?: "start" | "center" | "end";
	};
}

export const employeeTourConfig: TourStep[] = [
	// --- Sidebar / Navigation ---
	{
		element: "#sidebar-dashboard",
		popover: {
			title: "Dashboard",
			description: "Quickly access your personal dashboard for an overview of your work.",
			side: "right",
		},
	},
	{
		element: "#sidebar-team",
		popover: {
			title: "Team View",
			description: "See your colleagues and department team members.",
			side: "right",
		},
	},
	{
		element: "#sidebar-profile",
		popover: {
			title: "My Profile",
			description: "Manage your personal information, contact details, and career history.",
			side: "right",
		},
	},
	{
		element: "#sidebar-payroll",
		popover: {
			title: "Payroll",
			description: "Access your payslips, tax documents, and payment history.",
			side: "right",
		},
	},
	{
		element: "#sidebar-requests",
		popover: {
			title: "Requests",
			description: "Submit leave applications, time adjustments, or document requests.",
			side: "right",
		},
	},
	{
		element: "#sidebar-benefits",
		popover: {
			title: "Benefits",
			description: "View and manage your company-provided benefits and programs.",
			side: "right",
		},
	},

	// --- Header / Navbar ---
	{
		element: "#navbar-search",
		popover: {
			title: "Unified Search",
			description:
				"Search for colleagues, documents, or navigation items across the platform.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-calendar",
		popover: {
			title: "Company Calendar",
			description: "Stay updated with company-wide holidays and scheduled events.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-notifications",
		popover: {
			title: "Notifications",
			description: "Get real-time alerts for request approvals, messages, and announcements.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-user-profile",
		popover: {
			title: "Account Settings",
			description: "Access your account preferences, security settings, or logout.",
			side: "bottom",
			align: "end",
		},
	},

	// --- Dashboard Modules ---
	{
		element: "#dashboard-profile-banner",
		popover: {
			title: "Employee Profile",
			description: "A snapshot of your current position, department, and employment details.",
			side: "bottom",
		},
	},
	{
		element: "#dashboard-onboarding",
		popover: {
			title: "Onboarding Checklist",
			description: "Track your progress through the company's onboarding tasks.",
			side: "top",
		},
	},
	{
		element: "#dashboard-my-requests",
		popover: {
			title: "Recent Requests",
			description: "Monitor the status of your most recent pending or approved requests.",
			side: "top",
		},
	},
	{
		element: "#dashboard-company-calendar",
		popover: {
			title: "Interactive Calendar",
			description: "View upcoming holidays and scheduled events at a glance.",
			side: "left",
		},
	},
];
