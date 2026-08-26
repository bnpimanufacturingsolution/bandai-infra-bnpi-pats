// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import WorkforceAnalyticsPage from "./workforce";

beforeAll(() => {
	Element.prototype.scrollIntoView = vi.fn();
	globalThis.ResizeObserver =
		globalThis.ResizeObserver ||
		class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
});

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: vi.fn(() => ({ data: { departments: [] } })),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: vi.fn(() => ({
		data: { employees: [] },
		isLoading: false,
		error: null,
	})),
}));

vi.mock("~/lib/hooks/useMetrics", () => ({
	useDirectIndirectLaborSummary: vi.fn(() => ({
		data: {
			metrics: {
				directIndirectLaborSummary: {
					items: [],
					totalDirectEmployees: 0,
					totalIndirectEmployees: 0,
				},
			},
		},
		isLoading: false,
		error: null,
	})),
}));

vi.mock("./tabs/AgencyAttendanceTab", () => ({
	AgencyAttendanceTab: () => <div>Agency Attendance Tab Content</div>,
}));

vi.mock("./tabs/ManpowerDistributionTab", () => ({
	ManpowerDistributionTab: () => <div>Monthly Manpower Distribution</div>,
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

function renderWorkforce(entry = "/hr/reports/workforce") {
	return render(
		<MemoryRouter initialEntries={[entry]}>
			<WorkforceAnalyticsPage />
		</MemoryRouter>,
	);
}

describe("WorkforceAnalyticsPage", () => {
	it("shows three tabs and defaults to Manpower Distribution, not Direct vs Indirect", () => {
		renderWorkforce();

		expect(screen.getByRole("tab", { name: "Agency Attendance" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Manpower Distribution" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Direct vs Indirect" })).toBeInTheDocument();

		expect(screen.getByRole("tab", { name: "Manpower Distribution" })).toHaveAttribute(
			"data-state",
			"active",
		);
		expect(screen.getByRole("tab", { name: "Direct vs Indirect" })).toHaveAttribute(
			"data-state",
			"inactive",
		);
		expect(screen.queryByText("Direct vs Indirect Labor Report")).not.toBeInTheDocument();
		expect(screen.getByText("Monthly Manpower Distribution")).toBeInTheDocument();
	});

	it("remaps an unknown tab query to Manpower Distribution", () => {
		renderWorkforce("/hr/reports/workforce?tab=unknown");

		expect(screen.getByRole("tab", { name: "Manpower Distribution" })).toHaveAttribute(
			"data-state",
			"active",
		);
		expect(screen.getByRole("tab", { name: "Direct vs Indirect" })).toHaveAttribute(
			"data-state",
			"inactive",
		);
		expect(screen.queryByText("Direct vs Indirect Labor Report")).not.toBeInTheDocument();
	});

	it("opens Direct vs Indirect labor content when tab=direct-indirect", () => {
		renderWorkforce("/hr/reports/workforce?tab=direct-indirect");

		expect(screen.getByRole("tab", { name: "Direct vs Indirect" })).toHaveAttribute(
			"data-state",
			"active",
		);
		expect(screen.getByRole("tab", { name: "Manpower Distribution" })).toHaveAttribute(
			"data-state",
			"inactive",
		);
		expect(screen.getByText("Direct vs Indirect Labor Report")).toBeInTheDocument();
		expect(screen.getByText("Labor Type")).toBeInTheDocument();
		expect(screen.getAllByText("Direct Employees").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Indirect Employees").length).toBeGreaterThanOrEqual(1);
	});
});
