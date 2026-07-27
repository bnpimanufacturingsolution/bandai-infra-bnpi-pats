import type { LucideIcon } from "lucide-react";
export type DashboardRole = "employee" | "employee-manager" | "hr-user" | "hr-manager";

export type DashboardCardKey =
	| "time_off"
	| "quick_actions"
	| "my_requests"
	| "action_needed"
	| "pending_approvals"
	| "team_attendance"
	| "hr_approvals_queue"
	| "hr_operational_queue"
	| "employee_calendar";

export interface RoleDashboardLayout {
	top: [DashboardCardKey, DashboardCardKey, DashboardCardKey];
	bottomLeft: DashboardCardKey;
	bottomRight: DashboardCardKey;
}

export interface QuickActionItem {
	id: string;
	label: string;
	icon: LucideIcon;
	path: string;
}

export interface RoleDashboardConfig {
	role: DashboardRole;
	quickActions: QuickActionItem[];
	layout: RoleDashboardLayout;
	/**
	 * Legacy field retained temporarily for backward compatibility with
	 * existing consumers/tests. New rendering uses `layout`.
	 */
	cards?: DashboardCardKey[];
	showClockToggle?: boolean;
}

export interface RoleDashboardShellProps {
	role: DashboardRole;
}
