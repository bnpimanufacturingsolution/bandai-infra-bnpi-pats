import {
	BarChart3,
	Calendar,
	CheckSquare,
	ClipboardCheck,
	FileText,
	Receipt,
	Users,
	Wallet,
	UserCheck,
	BriefcaseBusiness,
} from "lucide-react";
import type { DashboardRole, RoleDashboardConfig } from "./role-dashboard.types";

export const roleDashboardConfigs: Record<DashboardRole, RoleDashboardConfig> = {
	employee: {
		role: "employee",
		showClockToggle: true,
		quickActions: [
			{
				id: "request-leave",
				label: "Request Leave",
				icon: Calendar,
				path: "/employee/requests?action=create&kind=leave",
			},
			{
				id: "view-payslip",
				label: "View Payslip",
				icon: Wallet,
				path: "/employee/:id/payroll",
			},
			{
				id: "my-documents",
				label: "My Documents",
				icon: FileText,
				path: "/employee/:id?tab=documents",
			},
			{
				id: "view-profile",
				label: "My Profile",
				icon: BarChart3,
				path: "/employee/:id",
			},
		],
		layout: {
			top: ["time_off", "action_needed", "quick_actions"],
			bottomLeft: "my_requests",
			bottomRight: "employee_calendar",
		},
		cards: ["time_off", "quick_actions", "my_requests", "action_needed"],
	},
	"employee-manager": {
		role: "employee-manager",
		showClockToggle: true,
		quickActions: [
			{
				id: "approve-requests",
				label: "Approve Requests",
				icon: CheckSquare,
				path: "/employee/approvals/requests",
			},
			{ id: "view-team", label: "Team", icon: Users, path: "/employee/team" },
			{
				id: "request-leave",
				label: "Leave Request",
				icon: Calendar,
				path: "/employee/requests?action=create&kind=leave",
			},
			{
				id: "view-reports",
				label: "Reports",
				icon: BarChart3,
				path: "/employee/reports",
			},
		],
		layout: {
			top: ["time_off", "action_needed", "quick_actions"],
			bottomLeft: "my_requests",
			bottomRight: "employee_calendar",
		},
		cards: ["time_off", "quick_actions", "pending_approvals", "employee_calendar", "action_needed"],
	},
	"hr-user": {
		role: "hr-user",
		showClockToggle: true,
		quickActions: [
			{
				id: "hr-approvals",
				label: "Approvals",
				icon: UserCheck,
				path: "/hr/approvals/requests",
			},
			{ id: "employees", label: "Employees", icon: Users, path: "/hr/employees" },
			{
				id: "payroll-settings",
				label: "Payroll Settings",
				icon: Receipt,
				path: "/admin/rules-policies/payroll",
			},
			{ id: "tasks", label: "Tasks", icon: ClipboardCheck, path: "/hr/tasks" },
		],
		layout: {
			top: ["time_off", "action_needed", "quick_actions"],
			bottomLeft: "my_requests",
			bottomRight: "hr_operational_queue",
		},
		cards: ["time_off", "quick_actions", "hr_approvals_queue", "hr_operational_queue", "action_needed"],
	},
	"hr-manager": {
		role: "hr-manager",
		showClockToggle: true,
		quickActions: [
			{
				id: "hr-approvals",
				label: "Approvals",
				icon: UserCheck,
				path: "/hr/approvals/requests",
			},
			{
				id: "recruitment",
				label: "Recruitment",
				icon: BriefcaseBusiness,
				path: "/hr/recruitment",
			},
			{ id: "payroll", label: "Payroll", icon: Receipt, path: "/hr/hr-payroll" },
			{ id: "reports", label: "Reports", icon: FileText, path: "/hr/reports" },
		],
		layout: {
			top: ["time_off", "action_needed", "quick_actions"],
			bottomLeft: "my_requests",
			bottomRight: "hr_operational_queue",
		},
		cards: ["time_off", "quick_actions", "hr_approvals_queue", "hr_operational_queue", "action_needed"],
	},
};
