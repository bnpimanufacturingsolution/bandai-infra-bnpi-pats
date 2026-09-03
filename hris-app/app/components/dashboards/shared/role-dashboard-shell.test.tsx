/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleDashboardShell } from "./role-dashboard-shell";
import type { DashboardRole } from "./role-dashboard.types";

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			id: "user-hr-manager",
			role: "hris-hr-manager",
			metadata: { employee: { id: "employee-hr-manager" } },
		},
	}),
}));

vi.mock("./cards/time-off-card", () => ({
	TimeOffCard: ({ role, employeeId }: { role: string; employeeId: string }) => (
		<div data-testid="time-off-card">
			{role}:{employeeId}
		</div>
	),
}));

vi.mock("./cards/quick-actions-card", () => ({
	QuickActionsCard: () => <div data-testid="quick-actions-card" />,
}));

vi.mock("./cards/request-list-card", () => ({
	RequestListCard: () => <div data-testid="request-list-card" />,
}));

vi.mock("./cards/attendance-status-card", () => ({
	AttendanceStatusCard: () => <div data-testid="attendance-status-card" />,
}));

vi.mock("./cards/hr-queue-card", () => ({
	HrQueueCard: ({ role }: { role: string }) => <div data-testid="hr-queue-card">{role}</div>,
}));

vi.mock("./cards/action-needed-card", () => ({
	ActionNeededCard: ({ role }: { role: string }) => (
		<div data-testid="action-needed-card">{role}</div>
	),
}));

vi.mock("./cards/employee-calendar-card", () => ({
	EmployeeCalendarCard: () => <div data-testid="employee-calendar-card" />,
}));

vi.mock("./regularization-celebration-modal", () => ({
	RegularizationCelebrationModal: () => <div data-testid="regularization-modal" />,
}));

describe("RoleDashboardShell", () => {
	it.each<DashboardRole>(["employee", "employee-manager", "hr-user", "hr-manager"])(
		"renders the %s dashboard without crashing",
		(dashboardRole) => {
			render(<RoleDashboardShell dashboardRole={dashboardRole} />);

			expect(screen.getByTestId("time-off-card")).toBeInTheDocument();
			expect(screen.getByTestId("quick-actions-card")).toBeInTheDocument();
		},
	);

	it("passes the HR manager role to HR operational cards", () => {
		render(<RoleDashboardShell dashboardRole="hr-manager" />);

		expect(screen.getByTestId("hr-queue-card")).toHaveTextContent("hr-manager");
	});
});
