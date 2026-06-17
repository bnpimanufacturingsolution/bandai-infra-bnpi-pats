export interface TourStep {
	element: string;
	popover: {
		title: string;
		description: string;
		side?: "top" | "left" | "right" | "bottom";
		align?: "start" | "center" | "end";
	};
}

export const hrUserTourConfig: TourStep[] = [
	// --- Sidebar / Navigation ---
	{
		element: "#sidebar-dashboard",
		popover: {
			title: "Dashboard",
			description: "Your HR User dashboard for managing HR operations and employee data.",
			side: "right",
		},
	},
	{
		element: "#sidebar-employees",
		popover: {
			title: "Employee Records",
			description: "Access and manage employee information and records.",
			side: "right",
		},
	},
	{
		element: "#sidebar-requests",
		popover: {
			title: "Request Management",
			description: "Review and process employee requests.",
			side: "right",
		},
	},
	{
		element: "#sidebar-payroll",
		popover: {
			title: "Payroll",
			description: "Access payroll information and generate reports.",
			side: "right",
		},
	},
	{
		element: "#sidebar-reports",
		popover: {
			title: "Reports",
			description: "Generate and view HR analytics and reports.",
			side: "right",
		},
	},

	// --- Header / Navbar ---
	{
		element: "#navbar-search",
		popover: {
			title: "Unified Search",
			description: "Search for employees, documents, or navigate quickly.",
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
			description: "Receive alerts for important HR events and actions.",
			side: "bottom",
		},
	},
	{
		element: "#navbar-user-profile",
		popover: {
			title: "Account Settings",
			description: "Access your profile and preferences.",
			side: "bottom",
			align: "end",
		},
	},

	// --- Dashboard Modules ---
	{
		element: "#dashboard-profile-banner",
		popover: {
			title: "HR User Profile",
			description: "Your profile information and role details.",
			side: "bottom",
		},
	},
	{
		element: "#dashboard-birthdays",
		popover: {
			title: "Employee Birthdays",
			description: "View upcoming employee birthdays this month to celebrate your team.",
			side: "top",
		},
	},
	{
		element: "#dashboard-company-calendar",
		popover: {
			title: "Company Calendar",
			description: "View company holidays and special events throughout the year.",
			side: "left",
		},
	},
];
