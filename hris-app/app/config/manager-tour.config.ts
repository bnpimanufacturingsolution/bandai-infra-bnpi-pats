export interface TourStep {
	element: string;
	popover: {
		title: string;
		description: string;
		side?: "top" | "left" | "right" | "bottom";
		align?: "start" | "center" | "end";
	};
}

export const managerTourConfig: TourStep[] = [
	// --- Sidebar / Navigation ---
	{
		element: "#sidebar-dashboard",
		popover: {
			title: "Dashboard",
			description: "Access your manager dashboard to oversee your team and personal tasks.",
			side: "right",
		},
	},
	{
		element: "#sidebar-team",
		popover: {
			title: "Team Management",
			description: "View and manage your team members, track performance, and monitor activities.",
			side: "right",
		},
	},
	{
		element: "#sidebar-profile",
		popover: {
			title: "My Profile",
			description: "Manage your personal information and career details.",
			side: "right",
		},
	},
	{
		element: "#sidebar-payroll",
		popover: {
			title: "Payroll",
			description: "Access your payslips and payment history.",
			side: "right",
		},
	},
	{
		element: "#sidebar-requests",
		popover: {
			title: "Requests & Approvals",
			description: "Submit your own requests and approve or reject requests from your team members.",
			side: "right",
		},
	},
	{
		element: "#sidebar-benefits",
		popover: {
			title: "Benefits",
			description: "View and manage your benefits and programs.",
			side: "right",
		},
	},

	// --- Header / Navbar ---
	{
		element: "#navbar-search",
		popover: {
			title: "Unified Search",
			description: "Quickly search for team members, documents, or navigate to different sections.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-calendar",
		popover: {
			title: "Company Calendar",
			description: "View company holidays and important dates.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-notifications",
		popover: {
			title: "Notifications",
			description: "Get alerts for pending approvals, team updates, and system announcements.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-user-profile",
		popover: {
			title: "Account Settings",
			description: "Access your account settings and preferences.",
			side: "bottom",
			align: "end",
		},
	},

	// --- Dashboard Modules ---
	{
		element: "#dashboard-profile-banner",
		popover: {
			title: "Manager Profile",
			description: "Your profile overview including position, department, and key information.",
			side: "bottom",
		},
	},
	{
		element: "#dashboard-requests-card",
		popover: {
			title: "Requests Overview",
			description: "View your personal requests and pending approvals from your team members.",
			side: "top",
		},
	},
	{
		element: "#dashboard-company-calendar",
		popover: {
			title: "Company Calendar",
			description: "View upcoming holidays and company events.",
			side: "left",
		},
	},
];
