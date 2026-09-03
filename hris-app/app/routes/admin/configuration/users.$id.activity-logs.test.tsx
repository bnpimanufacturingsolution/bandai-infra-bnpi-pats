// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserActivityLogsPage from "./users.$id.activity-logs";

const mockUseUser = vi.fn();
const mockUseUserActivityLogs = vi.fn();

vi.mock("~/lib/hooks/useUsers", () => ({
	useUser: (...args: any[]) => mockUseUser(...args),
}));

vi.mock("~/lib/hooks/useUserActivityLogs", () => ({
	useUserActivityLogs: (...args: any[]) => mockUseUserActivityLogs(...args),
	userActivityLogsQueryKeys: {
		userActivityLogs: {
			all: ["user-activity-logs"],
			lists: () => ["user-activity-logs", "list"],
			list: () => ["user-activity-logs", "list", "user-1"],
		},
	},
}));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("~/components/atoms/Card", () => ({
	Card: ({ children, ...props }: any) => <section {...props}>{children}</section>,
	CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock("~/components/ui/dialog", () => ({
	Dialog: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
	DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	DialogDescription: ({ children, ...props }: any) => <p {...props}>{children}</p>,
	DialogHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	DialogTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
}));

vi.mock("~/components/ui/date-picker-range", () => ({
	DatePickerWithRange: ({ value, onChange, placeholder }: any) => (
		<div>
			<div data-testid="date-range-value">
				{value?.from ? `${value.from.toISOString()}|${value.to?.toISOString() || ""}` : "empty"}
			</div>
			<button
				type="button"
				onClick={() =>
					onChange?.({
						from: new Date("2026-06-04T00:00:00.000Z"),
						to: new Date("2026-06-05T00:00:00.000Z"),
					})
				}>
				{placeholder}
			</button>
		</div>
	),
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({
		title,
		description,
		data,
		isLoading,
		emptyMessage,
		emptyDescription,
		searchValue,
		onSearch,
		filterValues,
		onFilterChange,
		customFilters,
		onExportCSV,
		renderActions,
	}: any) => (
		<div>
			<h1>{title}</h1>
			{description ? <p>{description}</p> : null}
			<div data-testid="search-value">{searchValue}</div>
			<div data-testid="filter-values">{JSON.stringify(filterValues)}</div>
			{customFilters}
			<button type="button" onClick={() => onSearch?.("payroll")}>
				Search payroll
			</button>
			<button type="button" onClick={() => onFilterChange?.({ category: "leave", source: "request" })}>
				Apply request filter
			</button>
			<button type="button" onClick={() => onExportCSV?.({ scope: "current", currentItems: data })}>
				Export current
			</button>
			{isLoading ? (
				<div>Loading activity logs...</div>
			) : data.length > 0 ? (
				<ul>
					{data.map((item: any) => (
						<li key={item.id}>
							{item.title}
							{renderActions ? renderActions(item) : null}
						</li>
					))}
				</ul>
			) : (
				<div>
					<div>{emptyMessage}</div>
					<div>{emptyDescription}</div>
				</div>
			)}
		</div>
	),
}));

beforeEach(() => {
	mockUseUser.mockReset();
	mockUseUserActivityLogs.mockReset();
});

const renderPage = (initialEntry = "/admin/configuration/users/user-1/activity-logs") =>
	render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<Routes>
				<Route path="/admin/configuration/users/:id/activity-logs" element={<UserActivityLogsPage />} />
			</Routes>
		</MemoryRouter>,
	);

describe("UserActivityLogsPage", () => {
	it("renders the selected user summary and activity rows", () => {
		mockUseUser.mockReturnValue({
			data: {
				id: "user-1",
				email: "jane.santos@example.test",
				userName: "jane.santos",
				role: "hris-employee",
				status: "active",
				lastLogin: "2026-06-01T09:00:00.000Z",
				metadata: {
					employee: {
						personalInfo: { firstName: "Jane", lastName: "Santos" },
						department: { name: "People Operations" },
						position: { title: "HR Officer" },
					},
				},
			},
			isLoading: false,
		});
		mockUseUserActivityLogs.mockImplementation((userId: string, params?: any, options?: any) => {
			const logs = [
				{
					id: "audit-1",
					source: "audit",
					category: "profile",
					title: "Update",
					description: "Updated employee profile",
					occurredAt: "2026-06-05T12:00:00.000Z",
					actorName: "Jane Santos",
					referenceLabel: "EmployeeProfile",
					referenceId: "profile-1",
					searchText: "update employee profile jane santos",
				},
			];
			return {
				data: {
					user: { id: userId, email: "jane.santos@example.test", role: "hris-employee", status: "active" },
					employee: { id: "emp-1", employeeId: "EMP-1001" },
					activityLogs: logs,
					pagination: { total: logs.length, page: 1, limit: 10, totalPages: 1 },
				},
				isLoading: false,
				refetch: vi.fn().mockResolvedValue({ data: { activityLogs: logs } }),
				params,
				enabled: options?.enabled ?? true,
			};
		});

		renderPage();

		expect(screen.getByText("User Activity Logs")).toBeInTheDocument();
		expect(screen.getByText("Jane Santos")).toBeInTheDocument();
		expect(screen.getByText("People Operations")).toBeInTheDocument();
		expect(screen.getByText("HR Officer")).toBeInTheDocument();
		expect(screen.getByText("Update")).toBeInTheDocument();
	});

	it("supports search and filter interactions", async () => {
		mockUseUser.mockReturnValue({
			data: {
				id: "user-1",
				email: "jane.santos@example.test",
				userName: "jane.santos",
				role: "hris-employee",
				status: "active",
				lastLogin: null,
				metadata: { employee: { personalInfo: { firstName: "Jane", lastName: "Santos" } } },
			},
			isLoading: false,
		});
		mockUseUserActivityLogs.mockImplementation((userId: string, params?: any, options?: any) => {
			const logs = params?.query === "payroll"
				? [
						{
							id: "audit-2",
							source: "audit",
							category: "payroll",
							title: "Payroll generated",
							description: "Payroll run completed",
							occurredAt: "2026-06-05T12:00:00.000Z",
							actorName: "Payroll Admin",
							searchText: "payroll generated payroll admin",
						},
				  ]
				: [];
			return {
				data: {
					user: { id: userId, email: "jane.santos@example.test", role: "hris-employee", status: "active" },
					employee: { id: "emp-1", employeeId: "EMP-1001" },
					activityLogs: logs,
					pagination: { total: logs.length, page: 1, limit: 10, totalPages: 1 },
				},
				isLoading: false,
				refetch: vi.fn().mockResolvedValue({ data: { activityLogs: logs } }),
				params,
				enabled: options?.enabled ?? true,
			};
		});

		renderPage();

		expect(screen.getByTestId("search-value")).toHaveTextContent("");
		fireEvent.click(screen.getByRole("button", { name: "Search payroll" }));
		await waitFor(() => {
			expect(screen.getByTestId("search-value")).toHaveTextContent("payroll");
		});

		fireEvent.click(screen.getByRole("button", { name: "Apply request filter" }));
		await waitFor(() => {
			expect(screen.getByTestId("filter-values")).toHaveTextContent('"source":"request"');
			expect(screen.getByTestId("filter-values")).toHaveTextContent('"category":"leave"');
		});
	});

	it("renders the loading and empty states", () => {
		mockUseUser.mockReturnValue({
			data: {
				id: "user-1",
				email: "jane.santos@example.test",
				userName: "jane.santos",
				role: "hris-employee",
				status: "active",
				lastLogin: null,
				metadata: { employee: { personalInfo: { firstName: "Jane", lastName: "Santos" } } },
			},
			isLoading: true,
		});
		mockUseUserActivityLogs.mockReturnValue({
			data: {
				user: { id: "user-1", email: "jane.santos@example.test", role: "hris-employee", status: "active" },
				employee: null,
				activityLogs: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
			},
			isLoading: true,
			refetch: vi.fn(),
		});

		renderPage();
		expect(screen.getByText("Loading activity logs...")).toBeInTheDocument();

		mockUseUser.mockReturnValue({
			data: {
				id: "user-1",
				email: "jane.santos@example.test",
				userName: "jane.santos",
				role: "hris-employee",
				status: "active",
				lastLogin: null,
				metadata: { employee: { personalInfo: { firstName: "Jane", lastName: "Santos" } } },
			},
			isLoading: false,
		});
		mockUseUserActivityLogs.mockReturnValue({
			data: {
				user: { id: "user-1", email: "jane.santos@example.test", role: "hris-employee", status: "active" },
				employee: null,
				activityLogs: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
			},
			isLoading: false,
			refetch: vi.fn(),
		});

		renderPage("/admin/configuration/users/user-1/activity-logs");
		expect(screen.getByText("No activity logs found")).toBeInTheDocument();
		expect(
			screen.getByText("No matching activity was found for this user and filter set."),
		).toBeInTheDocument();
	});
});
