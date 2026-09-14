import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Briefcase,
	Building2,
	Calendar,
	CalendarClock,
	Clock,
	FileSearch,
	FileText,
	Gift,
	Gavel,
	GraduationCap,
	PanelBottomDashed,
	RadioReceiver,
	Route,
	Settings,
	ShieldCheck,
	TimerReset,
	TrendingUp,
	UserCog,
	Users,
	Wallet,
	GitBranch,
	Network,
} from "lucide-react";

export interface AdminNavItem {
	id: string;
	label: string;
	path: string;
	icon: LucideIcon;
}

export interface AdminNavSection {
	id: string;
	label: string;
	icon: LucideIcon;
	items: AdminNavItem[];
}

export const adminLoggingItems: AdminNavItem[] = [
	{
		id: "audit-logs",
		label: "Audit Logs",
		path: "/admin/audit-logs",
		icon: FileText,
	},
	{
		id: "activity-logs",
		label: "Activity Logs",
		path: "/admin/activity-logs",
		icon: FileSearch,
	},
];

export const adminConfigurationItems: AdminNavItem[] = [
	{
		id: "company-profile",
		label: "Company Profile",
		path: "/admin/configuration/company-profile",
		icon: Building2,
	},
	{
		id: "users",
		label: "Users",
		path: "/admin/configuration/users",
		icon: UserCog,
	},
	{
		id: "employees",
		label: "Employees",
		path: "/admin/configuration/employees",
		icon: Users,
	},
	{
		id: "departments",
		label: "Departments",
		path: "/admin/configuration/departments",
		icon: Building2,
	},
	{
		id: "sections",
		label: "Sections",
		path: "/admin/configuration/sections",
		icon: Network,
	},
	{
		id: "positions",
		label: "Positions",
		path: "/admin/configuration/positions",
		icon: Briefcase,
	},
	{
		id: "levels",
		label: "Levels",
		path: "/admin/configuration/levels",
		icon: TrendingUp,
	},
	{
		id: "onboarding",
		label: "Onboarding Checklist",
		path: "/admin/configuration/onboarding/checklist",
		icon: Calendar,
	},
	{
		id: "onboarding-employees",
		label: "Onboarding Employees",
		path: "/hr/onboarding",
		icon: Calendar,
	},
	{
		id: "schedule-templates",
		label: "Schedule Templates",
		path: "/admin/configuration/schedule-templates",
		icon: Calendar,
	},
	{
		id: "employee-schedules",
		label: "Employee Schedules",
		path: "/admin/configuration/employee-schedules",
		icon: Clock,
	},
	{
		id: "leave-types",
		label: "Leave Types",
		path: "/admin/configuration/leave-types",
		icon: CalendarClock,
	},
	{
		id: "document-201-types",
		label: "201 Document Types",
		path: "/admin/configuration/document-201-types",
		icon: FileText,
	},
	{
		id: "benefit-types",
		label: "Benefit Management",
		path: "/admin/configuration/benefit-types",
		icon: Gift,
	},
	{
		id: "agencies",
		label: "Agencies",
		path: "/admin/configuration/agencies",
		icon: Users,
	},
	{
		id: "calendar-items",
		label: "Calendar Items",
		path: "/admin/configuration/calendar-items",
		icon: Calendar,
	},
	{
		id: "holidays",
		label: "Holidays",
		path: "/admin/configuration/holidays",
		icon: Calendar,
	},
	{
		id: "payroll-periods",
		label: "Payroll Period Setup",
		path: "/admin/configuration/payroll-periods",
		icon: Calendar,
	},
	{
		id: "applications",
		label: "Training & Performance",
		path: "/admin/configuration/applications",
		icon: GraduationCap,
	},
	{
		id: "devices",
		label: "Devices",
		path: "/admin/configuration/devices",
		icon: RadioReceiver,
	},
	{
		id: "migration",
		label: "Migration",
		path: "/admin/configuration/migration",
		icon: Route,
	},
	{
		id: "guide",
		label: "Guide",
		path: "/admin/configuration/guide",
		icon: PanelBottomDashed,
	},
];

export const adminRulesPolicyItems: AdminNavItem[] = [
	{
		id: "payroll-rules",
		label: "Payroll Rules",
		path: "/admin/rules-policies/payroll",
		icon: Wallet,
	},
	{
		id: "timesheet-rules",
		label: "Timesheet Rules",
		path: "/admin/rules-policies/timesheet",
		icon: TimerReset,
	},
	{
		id: "recruitment-settings",
		label: "Recruitment Settings",
		path: "/admin/rules-policies/recruitment",
		icon: Briefcase,
	},
	{
		id: "workflow-templates",
		label: "Workflow Templates",
		path: "/admin/rules-policies/workflows",
		icon: GitBranch,
	},
	{
		id: "disciplinary-rules",
		label: "Disciplinary Rules",
		path: "/admin/rules-policies/disciplinary",
		icon: Gavel,
	},
];

export const adminQuickActionSections: AdminNavSection[] = [
	{
		id: "configuration",
		label: "Configuration",
		icon: Settings,
		items: adminConfigurationItems,
	},
	{
		id: "rules-policies",
		label: "Rules & Policies",
		icon: ShieldCheck,
		items: adminRulesPolicyItems,
	},
	{
		id: "loggings",
		label: "Loggings",
		icon: Activity,
		items: adminLoggingItems,
	},
];
