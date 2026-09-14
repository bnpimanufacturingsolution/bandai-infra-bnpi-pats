// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HrOnboardingPage from "./hr-onboarding-page";

const mockRoster = vi.hoisted(() => ({
	current: [] as any[],
	loading: false,
	error: false,
	params: {
		search: "",
		departmentId: undefined as string | undefined,
		page: 1,
	},
}));

const mockPagination = vi.hoisted(() => ({
	current: { total: 2, page: 1, limit: 10, totalPages: 1 } as any,
}));

const employeesFixture = [
	{
		employeeId: "emp-char",
		employeeNumber: "EMP3338",
		name: "Char Aznable",
		department: "GA/HR",
		departmentId: "dept-gahr",
		employmentStartDate: "2026-09-09T00:00:00.000Z",
		checklist: {
			id: "chk-char",
			title: "Onboarding Checklist - Char Aznable",
			status: "ACTIVE",
			completionPercentage: 0,
		},
	},
	{
		employeeId: "emp-none",
		employeeNumber: "EMP4000",
		name: "No Checklist",
		department: "Production",
		departmentId: "dept-prod",
		employmentStartDate: null,
		checklist: null,
	},
];

vi.mock("~/lib/hooks/useOnboarding", () => ({
	useOnboardingRoster: (options?: any) => {
		mockRoster.params = {
			search: options?.search ?? "",
			departmentId: options?.departmentId,
			page: options?.page ?? 1,
		};
		return {
			data: mockRoster.loading
				? undefined
				: {
						employees: mockRoster.current,
						pagination: { ...mockPagination.current, page: options?.page ?? 1 },
					},
			isLoading: mockRoster.loading,
			isError: mockRoster.error,
			isFetching: false,
		};
	},
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: () => ({
		data: { departments: [{ id: "dept-gahr", name: "GA/HR" }] },
		isLoading: false,
	}),
}));

// Deterministic stub for the popover-based SearchableSelect.
vi.mock("~/components/ui/searchable-select", () => ({
	SearchableSelect: ({ options, value, onValueChange, triggerAriaLabel }: any) => (
		<select
			aria-label={triggerAriaLabel}
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}>
			{options.map((option: any) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	),
}));

vi.mock("./onboarding-checklist-panel", () => ({
	default: ({ employee }: any) => (
		<div data-testid="panel-for">{`panel:${employee.id}`}</div>
	),
}));

function LocationProbe() {
	const location = useLocation();
	return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

const renderPage = () =>
	render(
		<MemoryRouter initialEntries={["/hr/onboarding"]}>
			<Routes>
				<Route path="/hr/onboarding" element={<HrOnboardingPage />} />
				<Route path="/employee/:id" element={<div>employee-page-marker</div>} />
			</Routes>
			<LocationProbe />
		</MemoryRouter>,
	);

describe("HrOnboardingPage (shared DataTable)", () => {
	beforeEach(() => {
		mockRoster.current = employeesFixture;
		mockRoster.loading = false;
		mockRoster.error = false;
		mockPagination.current = { total: 2, page: 1, limit: 10, totalPages: 1 };
	});

	it("lists onboarding employees with checklist status column via the shared DataTable", () => {
		renderPage();
		// DataTable renders desktop table + mobile card view; assert on the first instance.
		expect(screen.getByText("Onboarding Employees")).toBeInTheDocument();
		expect(screen.getAllByText("Char Aznable").length).to.be.greaterThan(0);
		expect(screen.getAllByText("EMP3338").length).to.be.greaterThan(0);
		expect(screen.getAllByText("ACTIVE · 0%").length).to.be.greaterThan(0);
		expect(screen.getAllByText("none").length).to.be.greaterThan(0);
	});

	it("renders skeleton rows while loading", () => {
		mockRoster.loading = true;
		const { container } = renderPage();
		expect(container.querySelectorAll(".animate-pulse").length).to.be.greaterThan(0);
		expect(screen.queryByText("Char Aznable")).not.toBeInTheDocument();
	});

	it("selecting a row opens the shared checklist panel inline", async () => {
		const user = userEvent.setup();
		renderPage();
		expect(screen.queryByTestId("panel-for")).not.toBeInTheDocument();

		await user.click(screen.getAllByText("Char Aznable")[0]);
		expect(screen.getByTestId("panel-for")).toHaveTextContent("panel:emp-char");

		await user.click(screen.getAllByText("Char Aznable")[0]);
		expect(screen.queryByTestId("panel-for")).not.toBeInTheDocument();
	});

	it("Open Profile navigates to the employee profile onboarding tab with back-link", async () => {
		const user = userEvent.setup();
		renderPage();

		const charRow = screen.getAllByText("Char Aznable")[0].closest("tr") as HTMLElement;
		await user.click(within(charRow).getByRole("button", { name: "Open Profile" }));
		await waitFor(() =>
			expect(screen.getByLabelText("location")).toHaveTextContent(
				"/employee/emp-char?tab=onboarding&from=hr-onboarding",
			),
		);
	});

	it("forwards search + department filters to the roster query params", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.type(screen.getByPlaceholderText("Search name or employee #…"), "char");
		await waitFor(() => expect(mockRoster.params.search).to.equal("char"), { timeout: 1500 });

		await user.selectOptions(screen.getByLabelText("Filter by department"), "dept-gahr");
		await waitFor(() => expect(mockRoster.params.departmentId).to.equal("dept-gahr"));
	});

	it("shows the numbered pager with ellipsis like other pages", () => {
		mockRoster.current = Array.from({ length: 10 }, (_, i) => ({
			...employeesFixture[0],
			employeeId: `emp-${i}`,
			employeeNumber: `E${i}`,
			name: `Employee ${i}`,
		}));
		mockPagination.current = { total: 170, page: 1, limit: 10, totalPages: 17 };
		renderPage();

		expect(screen.getByText("Showing 1 to 10 of 170 results")).toBeInTheDocument();
		// windowed pages: 1..5 + last + ellipsis (never all 17)
		expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "17" })).toBeInTheDocument();
		expect(screen.getByText("...")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "9" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
	});

	it("clicking a page number forwards it to the roster query", async () => {
		mockRoster.current = Array.from({ length: 10 }, (_, i) => ({
			...employeesFixture[0],
			employeeId: `emp-${i}`,
			employeeNumber: `E${i}`,
			name: `Employee ${i}`,
		}));
		mockPagination.current = { total: 170, page: 1, limit: 10, totalPages: 17 };
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole("button", { name: "2" }));
		await waitFor(() => expect(mockRoster.params.page).to.equal(2));

		await user.click(screen.getByRole("button", { name: /next/i }));
		await waitFor(() => expect(mockRoster.params.page).to.equal(3));

		await user.click(screen.getByRole("button", { name: /previous/i }));
		await waitFor(() => expect(mockRoster.params.page).to.equal(2));
	});

	it("resets to page 1 when a filter changes", async () => {
		mockPagination.current = { total: 170, page: 1, limit: 10, totalPages: 17 };
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole("button", { name: "2" }));
		await waitFor(() => expect(mockRoster.params.page).to.equal(2));

		await user.type(screen.getByPlaceholderText("Search name or employee #…"), "char");
		await waitFor(() => expect(mockRoster.params.page).to.equal(1));
	});

	it("shows honest empty state for no employees", () => {
		mockRoster.current = [];
		mockPagination.current = { total: 0, page: 1, limit: 10, totalPages: 1 };
		renderPage();
		expect(screen.getByText("No employees are currently in onboarding.")).toBeInTheDocument();
	});

	it("shows the service error message when the roster query fails", () => {
		mockRoster.current = [];
		mockRoster.error = true;
		mockPagination.current = { total: 0, page: 1, limit: 10, totalPages: 1 };
		renderPage();
		expect(screen.getByText("The onboarding service could not be reached.")).toBeInTheDocument();
	});
});
