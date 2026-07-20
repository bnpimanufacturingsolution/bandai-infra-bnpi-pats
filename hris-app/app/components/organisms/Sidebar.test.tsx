// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUseActionMetrics = vi.hoisted(() => vi.fn());

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => mockUseAuth(),
}));

vi.mock("~/lib/hooks/useMetrics", () => ({
	useActionMetrics: (...args: unknown[]) => mockUseActionMetrics(...args),
}));

describe("Sidebar", () => {
	beforeEach(() => {
		mockUseAuth.mockReturnValue({
			user: {
				role: "hris-hr-user",
				avatar: "",
				metadata: {
					employee: {
						id: "emp-001",
						personalInfo: {
							firstName: "Mina",
							lastName: "Santos",
						},
						level: {
							name: "Senior",
						},
						position: {
							title: "HR Specialist",
						},
						department: {
							name: "People Operations",
						},
						isDepartmentManager: false,
					},
				},
			},
		});

		mockUseActionMetrics.mockReturnValue({
			data: {
				total: 4,
				summary: { total: 0, high: 0, medium: 0, low: 0 },
				counts: {
					dashboard: 0,
					tickets: { total: 0 },
					requests: { total: 0 },
					approvals: { total: 0, requests: 0, timesheet: 0 },
					documents: {
						total: 0,
						missing: 0,
						rejected: 0,
						expired: 0,
						needsUpdate: 0,
						pendingApproval: 0,
						hrPendingApproval: 0,
						optional: 0,
					},
					timesheets: { total: 0 },
					notifications: { total: 0 },
				},
				items: {
					dashboard: [],
					documents: [],
					onboardingDocuments: [],
				},
				categories: {
					documents: [],
				},
			},
		});
	});

	it("shows Attendance Corrections for HR users in the timekeeping menu", () => {
		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Sidebar />
			</MemoryRouter>,
		);

		expect(screen.getByRole("button", { name: "Timekeeping" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		expect(screen.getByRole("link", { name: "Attendance Corrections" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Audit Logs" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Turnover & Attrition" })).toBeInTheDocument();
		expect(screen.queryByText("Time Correction")).not.toBeInTheDocument();
	});

	it("renders Audit Logs after other HR working-space items for HR users", () => {
		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<Sidebar />
			</MemoryRouter>,
		);

		const recruitmentButton = screen.getByRole("button", { name: "Recruitment" });
		const reportsButton = screen.getByRole("button", { name: "Reports" });
		const auditLogsLink = screen.getByRole("link", { name: "Audit Logs" });

		expect(
			recruitmentButton.compareDocumentPosition(auditLogsLink) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			reportsButton.compareDocumentPosition(auditLogsLink) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("shows Audit Logs in the sidebar for HR Managers", () => {
		mockUseAuth.mockReturnValue({
			user: {
				role: "hris-hr-manager",
				avatar: "",
				metadata: {
					employee: {
						id: "emp-002",
						personalInfo: {
							firstName: "Alex",
							lastName: "Reyes",
						},
						level: {
							name: "Manager",
						},
						position: {
							title: "HR Manager",
						},
						department: {
							name: "People Operations",
						},
						isDepartmentManager: true,
					},
				},
			},
		});

		render(
			<MemoryRouter initialEntries={["/dashboard"]}>
				<Sidebar />
			</MemoryRouter>,
		);

		expect(screen.getByRole("link", { name: "Audit Logs" })).toBeInTheDocument();
	});
});
