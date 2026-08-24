// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HrAuditLogsPage from "./activity-logs";

const mockUseHrAuditLogs = vi.fn();
const mockNavigate = vi.fn();

vi.mock("~/lib/hooks/useHrAuditLogs", () => ({
	useHrAuditLogs: (...args: any[]) => mockUseHrAuditLogs(...args),
}));

vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual<any>("react-router-dom");
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

vi.mock("~/guards/auth-guard", () => ({
	AuthGuard: ({ children }: any) => <>{children}</>,
}));

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("~/components/ui/dialog", () => ({
	Dialog: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
	DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	DialogDescription: ({ children, ...props }: any) => <p {...props}>{children}</p>,
	DialogHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	DialogTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({
		title,
		description,
		data,
		columns,
		isLoading,
		emptyMessage,
		emptyDescription,
		titleActions,
		searchValue,
		onSearch,
		filterValues,
		onFilterChange,
		filters,
		renderActions,
	}: any) => (
		<div>
			<div>
				<h1>{title}</h1>
				{titleActions}
			</div>
			{description ? <p>{description}</p> : null}
			<div data-testid="search-value">{searchValue}</div>
			<div data-testid="filter-values">{JSON.stringify(filterValues)}</div>
			<div data-testid="filter-count">{filters?.length || 0}</div>
			<button type="button" onClick={() => onSearch?.("payroll")}>
				Search payroll
			</button>
			<button
				type="button"
				onClick={() => onFilterChange?.({ type: "UPDATE", severity: "HIGH" })}>
				Apply audit filter
			</button>
			{isLoading ? (
				<div>Loading audit logs...</div>
			) : data.length > 0 ? (
				<ul>
					{data.map((item: any) => (
						<li key={item.id}>
							{item.description}
							<div>
								{columns?.map((column: any) => (
									<div key={column.key}>
										{column.render ? column.render(item[column.key], item) : item[column.key]}
									</div>
								))}
							</div>
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
	mockNavigate.mockReset();
	mockUseHrAuditLogs.mockReset();
});

const renderPage = (initialEntry = "/hr/audit-logs") =>
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter initialEntries={[initialEntry]}>
				<HrAuditLogsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);

describe("HrAuditLogsPage", () => {
	it("renders the HR audit logs page and export action", () => {
		mockUseHrAuditLogs.mockReturnValue({
			data: {
				auditLoggings: [
					{
						id: "audit-1",
						type: "UPDATE",
						severity: "HIGH",
						entity: { type: "PayrollPeriod", id: "payroll-1" },
						description: "Payroll generated",
						changes: { before: { status: "draft" }, after: { status: "completed" } },
						metadata: { path: "/api/payrollperiod/1", method: "PATCH" },
						employeeId: "emp-1",
						employee: {
							id: "emp-1",
							person: { personalInfo: { firstName: "Maria", lastName: "Reyes" } },
						},
						timestamp: "2026-06-05T12:00:00.000Z",
					},
				],
				pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
				summary: { total: 1, types: { UPDATE: 1 }, severities: { HIGH: 1 }, uniqueActors: 1 },
			},
			isLoading: false,
		});

		renderPage();

		expect(screen.getByText("Change history")).toBeInTheDocument();
		expect(
			screen.getByText(/create, update, and delete events for sensitive HR data/i),
		).toBeInTheDocument();
		expect(screen.getByText("Maria Reyes")).toBeInTheDocument();
		expect(screen.queryByText("emp-1")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Maria Reyes Open employee details" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
	});

	it("hides opaque record ids and system timestamp fields from the table", () => {
		mockUseHrAuditLogs.mockReturnValue({
			data: {
				auditLoggings: [
					{
						id: "audit-request-1",
						type: "CREATE",
						severity: "LOW",
						entity: { type: "Request", id: "cmr09c01r001kdvwsfzhzkseq" },
						description: "Created new request: cmr09c01r001kdvwsfzhzkseq",
						changes: {
							before: {},
							after: {
								createdAt: "2026-06-30T06:20:09.662Z",
								updatedAt: "2026-06-30T06:20:09.990Z",
								status: "pending",
							},
						},
						metadata: { path: "/api/request/cmr09c01r001kdvwsfzhzkseq", method: "POST" },
						timestamp: "2026-06-30T06:20:09.990Z",
					},
				],
				pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
				summary: { total: 1, types: { CREATE: 1 }, severities: { LOW: 1 }, uniqueActors: 0 },
			},
			isLoading: false,
		});

		renderPage();

		expect(screen.getAllByText(/Created new request/i).length).toBeGreaterThan(0);
		expect(screen.queryByText("cmr09c01r001kdvwsfzhzkseq")).not.toBeInTheDocument();
		expect(screen.queryByText("Created At")).not.toBeInTheDocument();
		expect(screen.queryByText("Updated At")).not.toBeInTheDocument();
		expect(screen.getByText(/Status: set to pending/i)).toBeInTheDocument();
	});

	it("supports search and filter interactions", async () => {
		mockUseHrAuditLogs.mockImplementation((params?: any) => {
			const logs =
				params?.query === "payroll"
					? [
						{
							id: "audit-2",
							type: "UPDATE",
							severity: "HIGH",
							entity: { type: "PayrollPeriod", id: "payroll-1" },
							description: "Payroll generated",
							employeeId: "emp-1",
							employee: {
								id: "emp-1",
								person: { personalInfo: { firstName: "Maria", lastName: "Reyes" } },
							},
							timestamp: "2026-06-05T12:00:00.000Z",
						},
					]
					: [];

			return {
				data: {
					auditLoggings: logs,
					pagination: { total: logs.length, page: 1, limit: 10, totalPages: 1 },
					summary: { total: logs.length, types: {}, severities: {}, uniqueActors: 0 },
				},
				isLoading: false,
				refetch: vi.fn(),
				params,
			};
		});

		renderPage();

		expect(screen.getByTestId("search-value")).toHaveTextContent("");
		fireEvent.click(screen.getByRole("button", { name: "Search payroll" }));
		await waitFor(() => {
			expect(screen.getByTestId("search-value")).toHaveTextContent("payroll");
		});

		fireEvent.click(screen.getByRole("button", { name: "Apply audit filter" }));
		await waitFor(() => {
			expect(screen.getByTestId("filter-values")).toHaveTextContent('"type":"UPDATE"');
			expect(screen.getByTestId("filter-values")).toHaveTextContent('"severity":"HIGH"');
		});
	});

	it("renders the detail modal, empty state, and loading state", async () => {
		mockUseHrAuditLogs.mockReturnValue({
			data: {
				auditLoggings: [
						{
							id: "audit-1",
							type: "UPDATE",
							severity: "HIGH",
							entity: { type: "PayrollPeriod", id: "payroll-1" },
							description: "Payroll generated",
							changes: { before: { status: "draft" }, after: { status: "completed" } },
							metadata: { path: "/api/payrollperiod/1", method: "PATCH" },
							employeeId: "emp-1",
							employee: {
								id: "emp-1",
								person: { personalInfo: { firstName: "Maria", lastName: "Reyes" } },
							},
							timestamp: "2026-06-05T12:00:00.000Z",
						},
					],
				pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
				summary: { total: 1, types: { UPDATE: 1 }, severities: { HIGH: 1 }, uniqueActors: 1 },
			},
			isLoading: false,
		});

		renderPage();
		fireEvent.click(
			screen.getByRole("button", { name: "Maria Reyes Open employee details" }),
		);
		expect(mockNavigate).toHaveBeenCalledWith("/employee/emp-1?from=hr-audit-logs");

		fireEvent.click(screen.getByRole("button", { name: "Details" }));
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByText("Log details")).toBeInTheDocument();
		});
		fireEvent.click(screen.getAllByRole("button", { name: "Maria Reyes" })[0]);
		expect(mockNavigate).toHaveBeenCalledWith("/employee/emp-1?from=hr-audit-logs");

		mockUseHrAuditLogs.mockReturnValue({
			data: {
				auditLoggings: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
				summary: { total: 0, types: {}, severities: {}, uniqueActors: 0 },
			},
			isLoading: true,
		});

		renderPage();
		expect(screen.getByText("Loading audit logs...")).toBeInTheDocument();

		mockUseHrAuditLogs.mockReturnValue({
			data: {
				auditLoggings: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
				summary: { total: 0, types: {}, severities: {}, uniqueActors: 0 },
			},
			isLoading: false,
		});

		renderPage();
		expect(screen.getByText("No change records found")).toBeInTheDocument();
		expect(
			screen.getByText("No HR-sensitive create, update, or delete changes match the current filters."),
		).toBeInTheDocument();
	});
});
