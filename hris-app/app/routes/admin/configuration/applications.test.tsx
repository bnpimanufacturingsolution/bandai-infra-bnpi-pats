// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ApplicationAccessPage from "./applications";
import type { ApplicationAccessListItem } from "~/services/application-access.service";

let lastDataTableProps: any = null;

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: (props: any) => {
		lastDataTableProps = props;
		const { title, description, data, columns, isLoading, emptyMessage, emptyDescription, emptyActions } = props;
		return (
			<section>
				<h1>{title}</h1>
				<p>{description}</p>
				{isLoading ? (
					<div>Loading…</div>
				) : data.length === 0 ? (
					<div>
						<p>{emptyMessage}</p>
						<p>{emptyDescription}</p>
						{emptyActions}
					</div>
				) : (
					data.map((item: any) => (
						<article key={item.employeeId} data-testid={`row-${item.employeeId}`}>
							{columns.map((column: any) => (
								<div key={String(column.key)}>
									<div>{column.label}</div>
									<div>
										{column.render ? column.render(item[column.key], item) : item[column.key]}
									</div>
								</div>
							))}
						</article>
					))
				)}
			</section>
		);
	},
}));

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, variant }: any) => (
		<span data-testid="badge" data-variant={variant}>
			{children}
		</span>
	),
}));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, onClick, ...props }: any) => (
		<button type="button" onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

vi.mock("~/components/molecules/shared/ManageAccessDrawer", () => ({
	ManageAccessDrawer: ({ open, employeeId }: any) =>
		open ? (
			<div role="dialog" aria-label="Manage Access" data-employee-id={employeeId} />
		) : null,
}));

vi.mock("~/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: any) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
	DropdownMenuItem: ({ children, onClick, ...props }: any) => (
		<button type="button" onClick={onClick} {...props}>
			{children}
		</button>
	),
	DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

const mockMutate = vi.fn();

vi.mock("~/lib/hooks/useApplicationAccess", () => ({
	useApplicationAccessList: vi.fn(() => mockListQuery()),
	useApplicationAccessCatalog: vi.fn(() => ({
		data: {
			data: {
				lmsRoles: { assignable: ["employee", "instructor", "admin"], nonAssignable: ["superadmin"], all: [] },
				epmrSubroles: {
					assignable: ["epmr_admin", "epmr_ratee", "epmr_rater", "epmr_qa"],
					removable: ["epmr_ratee", "epmr_rater"],
					explicitOnly: ["epmr_admin", "epmr_qa"],
				},
				defaultEpmrSubroles: ["epmr_ratee", "epmr_rater"],
				provisioningStatuses: ["PENDING", "SYNCED", "FAILED", "BLOCKED"],
				employmentBlockingStatuses: ["TERMINATED"],
			},
		},
	})),
	useApplicationAccessDetail: vi.fn(() => ({ data: null, isLoading: false })),
	useUpdateApplicationAccess: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
}));

let listState: {
	data?: any;
	isLoading?: boolean;
	isError?: boolean;
	error?: any;
};

const mockListQuery = () => ({
	data: listState.data,
	isLoading: listState.isLoading ?? false,
	isError: listState.isError ?? false,
	error: listState.error,
	refetch: vi.fn(),
});

const baseItem = (overrides: Partial<ApplicationAccessListItem>): ApplicationAccessListItem => ({
	employeeId: "cmpxw28pk009z7zws7k4rmizt",
	employeeNumber: "00021",
	employeeName: "Arvin Salud",
	department: "Production",
	lmsRole: "employee",
	epmrSubroles: ["epmr_ratee", "epmr_rater"],
	provenance: null,
	inherited: false,
	eligible: true,
	employmentStatus: "ACTIVE",
	provisioningStatus: "SYNCED",
	hasExplicitConfig: false,
	...overrides,
});

const renderPage = (path = "/admin/configuration/applications") =>
	render(
		<MemoryRouter initialEntries={[path]}>
			<ApplicationAccessPage />
		</MemoryRouter>,
	);

beforeEach(() => {
	mockMutate.mockReset();
	listState = {};
});

describe("ApplicationAccessPage", () => {
	it("renders the Training & Performance page with employee rows", () => {
		listState.data = {
			status: "success",
			data: {
				items: [
					baseItem({}),
					baseItem({
						employeeId: "cmpxwadb50x6v7zws7j7i7e3k",
						employeeName: "Jane Smith",
						employeeNumber: "00022",
						lmsRole: "instructor",
						epmrSubroles: ["epmr_ratee", "epmr_rater", "epmr_qa"],
						provisioningStatus: "PENDING",
						hasExplicitConfig: true,
					}),
				],
				pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
			},
		};

		renderPage();

		expect(screen.getByText("Training & Performance")).toBeInTheDocument();
		expect(screen.getByText("Manage employee access to LMS and EPMR")).toBeInTheDocument();
		expect(screen.getByText("Arvin Salud")).toBeInTheDocument();
		expect(screen.getByText("00021")).toBeInTheDocument();
		expect(screen.getAllByText("Employee").length).toBeGreaterThan(0);
		expect(screen.getByText("Instructor")).toBeInTheDocument();
		expect(screen.getByText("Default access")).toBeInTheDocument();
		expect(screen.getByText("Configured")).toBeInTheDocument();
		expect(screen.getAllByText("Ratee").length).toBe(2);
		expect(screen.getAllByText("Rater").length).toBe(2);
		expect(screen.getByText("QA")).toBeInTheDocument();
		expect(screen.getByText("Synced")).toBeInTheDocument();
		expect(screen.getByText("Pending")).toBeInTheDocument();
	});

	it("renders a superadmin row as system-controlled", () => {
		listState.data = {
			status: "success",
			data: {
				items: [
					baseItem({
						lmsRole: "superadmin",
						inherited: true,
						epmrSubroles: ["epmr_admin", "epmr_ratee", "epmr_rater", "epmr_qa"],
					}),
				],
				pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
			},
		};

		renderPage();

		expect(screen.getByText("Superadmin")).toBeInTheDocument();
		expect(screen.getByText("System controlled")).toBeInTheDocument();
		expect(screen.getByText("Admin")).toBeInTheDocument();
	});

	it("renders blocked employees without effective access", () => {
		listState.data = {
			status: "success",
			data: {
				items: [
					baseItem({
						employeeId: "cmpxwdead00blocked00emp0",
						employeeName: "Blocked Employee",
						eligible: false,
						employmentStatus: "TERMINATED",
						lmsRole: null,
						epmrSubroles: [],
					}),
				],
				pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
			},
		};

		renderPage();

		expect(screen.getAllByText("No access").length).toBeGreaterThan(0);
		expect(screen.getAllByText((_, el) => el?.textContent === "terminated").length).toBeGreaterThan(0);
	});

	it("opens the Manage Access drawer for the selected employee", () => {
		listState.data = {
			status: "success",
			data: {
				items: [baseItem({})],
				pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
			},
		};

		renderPage("/admin/configuration/applications?action=manage&id=cmpxw28pk009z7zws7k4rmizt");

		const dialog = screen.getByRole("dialog", { name: "Manage Access" });
		expect(dialog).toHaveAttribute("data-employee-id", "cmpxw28pk009z7zws7k4rmizt");
	});

	it("shows the empty state when no employees match", () => {
		listState.data = {
			status: "success",
			data: {
				items: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
			},
		};

		renderPage();

		expect(screen.getByText("No employees with application access")).toBeInTheDocument();
		expect(screen.getByText("Try adjusting your search or filters.")).toBeInTheDocument();
	});

	it("shows a friendly error state with retry when the API fails", () => {
		listState.isError = true;
		listState.error = { message: "Request failed" };

		renderPage();

		expect(screen.getByText("Unable to load application access")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
	});

	it("filters the current page by provisioning status", () => {
		listState.data = {
			status: "success",
			data: {
				items: [
					baseItem({}),
					baseItem({
						employeeId: "cmpxwadb50x6v7zws7j7i7e3k",
						employeeName: "Jane Smith",
						provisioningStatus: "PENDING",
					}),
					baseItem({
						employeeId: "cmpxwblocked000000000000",
						employeeName: "Blocked Employee",
						eligible: false,
						employmentStatus: "TERMINATED",
						epmrSubroles: [],
						lmsRole: null,
					}),
				],
				pagination: { total: 3, page: 1, limit: 10, totalPages: 1 },
			},
		};

		renderPage("/admin/configuration/applications?status=SYNCED");

		const renderedIds = lastDataTableProps.data.map((item: any) => item.employeeId);
		expect(renderedIds).toEqual(["cmpxw28pk009z7zws7k4rmizt"]);
	});
});
