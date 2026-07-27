// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import EmployeeList from "./EmployeeList";
import { useEmployees } from "~/lib/hooks/useEmployees";

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, ...props }: any) => (
		<div data-testid="badge" {...props}>
			{children}
		</div>
	),
}));

vi.mock("~/components/ui/avatar", () => ({
	Avatar: ({ children, ...props }: any) => (
		<div data-testid="avatar-root" {...props}>
			{children}
		</div>
	),
	AvatarImage: ({ src, alt, ...props }: any) => (
		<img data-testid="avatar-image" src={src} alt={alt} {...props} />
	),
	AvatarFallback: ({ children, ...props }: any) => (
		<div data-testid="avatar-fallback" {...props}>
			{children}
		</div>
	),
}));

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			metadata: {
				employee: {
					id: "actor-1",
				},
			},
		},
	}),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: vi.fn((params?: any) => {
		if (String(params?.filter || "").includes("directReports:exists")) {
			return {
				data: {
					employees: [
						{
							id: "manager-1",
							employeeId: "MGR-001",
							departmentId: "dept-1",
							person: {
								personalInfo: { firstName: "Maria", lastName: "Santos" },
							},
						},
					],
					pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
				},
				isLoading: false,
				isFetching: false,
			};
		}

		const employees = params?.count
			? [
					{
						id: "employee-1",
						employeeId: "EMP-001",
						employmentStatus: "ACTIVE",
						employmentHireDate: "2026-01-15",
						employmentType: "REGULAR",
						workforceSource: "DIRECT",
						departmentId: "dept-1",
						positionId: "position-1",
						sectionId: "section-1",
						levelId: "level-1",
						department: { id: "dept-1", name: "Manufacturing" },
						position: { id: "position-1", title: "Operator" },
						section: { id: "section-1", name: "Assembly" },
						level: { id: "level-1", name: "Level 1" },
						user: {
							avatar: "https://example.test/avatar.png",
						},
						person: {
							personalInfo: { firstName: "Ana", lastName: "Reyes" },
							contactInfo: {
								email: "ana.reyes@example.test",
								phones: [
									{ countryCode: "+63", number: "9000000000", isPrimary: true },
								],
							},
						},
					},
					{
						id: "employee-2",
						employeeId: "EMP-002",
						employmentStatus: "ACTIVE",
						employmentHireDate: "2026-02-10",
						employmentType: "REGULAR",
						workforceSource: "DIRECT",
						departmentId: "dept-1",
						positionId: "position-1",
						sectionId: "section-1",
						levelId: "level-1",
						department: { id: "dept-1", name: "Manufacturing" },
						position: { id: "position-1", title: "Operator" },
						section: { id: "section-1", name: "Assembly" },
						level: { id: "level-1", name: "Level 1" },
						person: {
							personalInfo: { firstName: "Juan", lastName: "Dela Cruz" },
							contactInfo: {
								email: "juan.delacruz@example.test",
								phones: [
									{ countryCode: "+63", number: "9000000001", isPrimary: true },
								],
							},
						},
					},
				]
			: [];

		return {
			data: {
				employees,
				pagination: { total: employees.length, page: 1, limit: 10, totalPages: 1 },
			},
			isLoading: false,
			isFetching: false,
		};
	}),
	useEmployee: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: () => ({
		data: { departments: [{ id: "dept-1", name: "Production", code: "PROD" }] },
	}),
}));

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: () => ({ data: { positions: [] } }),
}));

vi.mock("~/lib/hooks/useLevels", () => ({
	useLevels: () => ({ data: { levels: [] } }),
}));

vi.mock("~/lib/hooks/useSections", () => ({
	useSections: () => ({ data: { sections: [] } }),
}));

vi.mock("~/lib/hooks/useAgencies", () => ({
	useAgencies: () => ({
		data: {
			agencies: [
				{ id: "agency-1", code: "AGY1", name: "Agency One", status: "ACTIVE" },
				{ id: "agency-2", code: "AGY2", name: "Agency Two", status: "ACTIVE" },
			],
		},
	}),
}));

vi.mock("~/lib/hooks/useTerminations", () => ({
	useCreateTermination: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useSubmitTermination: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("~/components/organisms/employee/EmployeeImportModal", () => ({
	EmployeeImportModal: () => null,
}));

beforeAll(() => {
	if (!HTMLElement.prototype.hasPointerCapture) {
		HTMLElement.prototype.hasPointerCapture = () => false;
	}
	if (!HTMLElement.prototype.setPointerCapture) {
		HTMLElement.prototype.setPointerCapture = () => undefined;
	}
	if (!HTMLElement.prototype.releasePointerCapture) {
		HTMLElement.prototype.releasePointerCapture = () => undefined;
	}
	if (!HTMLElement.prototype.scrollIntoView) {
		HTMLElement.prototype.scrollIntoView = () => undefined;
	}
});

const LocationProbe = () => {
	const location = useLocation();
	return (
		<>
			<output aria-label="location-pathname">{location.pathname}</output>
			<output aria-label="location-search">{location.search}</output>
		</>
	);
};

const renderEmployeeList = (initialEntry = "/hr/employees") =>
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter initialEntries={[initialEntry]}>
				<EmployeeList role="hr-user" hideAdd hideImport hideExport />
				<LocationProbe />
			</MemoryRouter>
		</QueryClientProvider>,
	);

const openAgencyFilter = async () => {
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: /filters/i }));
	const agencyTrigger = screen
		.getAllByRole("combobox")
		.find((element) => element.textContent?.includes("All Agency"));
	expect(agencyTrigger).toBeTruthy();
	await user.click(agencyTrigger!);
	return user;
};

describe("EmployeeList manpower databank deep links", () => {
	it("replays manpower databank deep links into the employee API filter contract", async () => {
		renderEmployeeList(
			"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-1&employmentType=REGULAR&workforceSource=AGENCY&agency=agency-1",
		);

		await waitFor(() => {
			const employeeListCalls = vi
				.mocked(useEmployees)
				.mock.calls.map(([params]) => params)
				.filter((params) => params?.count === true);

			expect(
				employeeListCalls.some(
					(params) =>
						String(params?.filter || "").includes("positionId:position-1") &&
						String(params?.filter || "").includes("employmentType:REGULAR") &&
						String(params?.filter || "").includes("workforceSource:AGENCY") &&
						String(params?.filter || "").includes("agencyId:agency-1"),
				),
			).toBe(true);
		});
	}, 15_000);
});

describe("EmployeeList agency advanced filter", () => {
	it("renders admin employment status as dot text while workforce remains a badge", async () => {
		renderEmployeeList("/admin/configuration/employees");

		const activeStatusElements = await screen.findAllByText("Active");
		const activeStatusText = activeStatusElements.find(
			(element) =>
				element.className.includes("inline-flex") &&
				element.className.includes("text-green-700"),
		);

		expect(activeStatusText).toBeTruthy();
		expect(activeStatusText).not.toHaveClass("status-badge");
		expect(activeStatusText?.closest("[data-testid='badge']")).toBeNull();
		expect(activeStatusText?.querySelector("[aria-hidden='true']")).toHaveClass("bg-green-500");
		expect(
			activeStatusElements.some((element) => element.closest("[data-testid='badge']")),
		).toBe(false);

		expect(
			screen
				.getAllByText("DIRECT")
				.some((element) => element.closest("[data-testid='badge']")),
		).toBe(true);

		// Name column shows employee avatar on admin configuration list
		expect(
			screen.getAllByTestId("avatar-image").map((node) => node.getAttribute("src")),
		).toContain("https://example.test/avatar.png");
	}, 15_000);

	it("navigates to admin-scoped employee profile when an admin employee row is clicked", async () => {
		renderEmployeeList("/admin/configuration/employees");

		const employeeNames = await screen.findAllByText("Ana Reyes");
		const row = employeeNames
			.map((node) => node.closest("tr"))
			.find((candidate): candidate is HTMLTableRowElement => candidate != null);
		expect(row).toBeTruthy();

		const user = userEvent.setup();
		await user.click(row!);

		await waitFor(() => {
			expect(screen.getByLabelText("location-pathname")).toHaveTextContent(
				"/admin/configuration/employees/employee-1",
			);
		});
		// Stay under admin layout path so the configuration sidebar does not switch.
		expect(screen.getByLabelText("location-pathname")).not.toHaveTextContent(
			"/employee/employee-1",
		);
	}, 15_000);

	it("renders hr employment status as dot text while workforce remains a badge", async () => {
		renderEmployeeList("/hr/employees");

		const activeStatusElements = await screen.findAllByText("Active");
		const activeStatusText = activeStatusElements.find(
			(element) =>
				element.className.includes("inline-flex") &&
				element.className.includes("text-green-700"),
		);

		expect(activeStatusText).toBeTruthy();
		expect(activeStatusText).not.toHaveClass("status-badge");
		expect(activeStatusText?.closest("[data-testid='badge']")).toBeNull();
		expect(activeStatusText?.querySelector("[aria-hidden='true']")).toHaveClass("bg-green-500");
		expect(
			activeStatusElements.some((element) => element.closest("[data-testid='badge']")),
		).toBe(false);

		expect(
			screen
				.getAllByText("DIRECT")
				.some((element) => element.closest("[data-testid='badge']")),
		).toBe(true);

		expect(
			screen.getAllByTestId("avatar-image").map((node) => node.getAttribute("src")),
		).toContain("https://example.test/avatar.png");
		// Every employee row has an avatar root (image or logo fallback)
		expect(screen.getAllByTestId("avatar-root").length).toBeGreaterThanOrEqual(2);
	}, 15_000);

	it("keeps department and manager filters inside the Filters popover", async () => {
		renderEmployeeList("/admin/configuration/employees");

		// Not on the main toolbar until Filters is opened
		expect(screen.queryByTestId("departmentId-toolbar-filter")).not.toBeInTheDocument();
		expect(screen.queryByTestId("managerId-toolbar-filter")).not.toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /filters/i }));

		expect(screen.getByTestId("departmentId-toolbar-filter")).toBeInTheDocument();
		expect(screen.getByTestId("managerId-toolbar-filter")).toBeInTheDocument();
	}, 15_000);

	it("passes department and manager selections through the employee API filter contract", async () => {
		renderEmployeeList("/admin/configuration/employees");

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /filters/i }));

		await user.click(screen.getByTestId("departmentId-toolbar-filter").querySelector("button")!);
		await user.click(screen.getByText("Production"));

		await waitFor(() => {
			expect(screen.getByLabelText("location-search")).toHaveTextContent(
				"departmentId=dept-1",
			);
		});

		await user.click(screen.getByTestId("managerId-toolbar-filter").querySelector("button")!);
		await user.click(screen.getByText("Maria Santos"));

		await waitFor(() => {
			expect(screen.getByLabelText("location-search")).toHaveTextContent(
				"managerId=manager-1",
			);
		});

		const employeeListCalls = vi
			.mocked(useEmployees)
			.mock.calls.map(([params]) => params)
			.filter((params) => params?.count === true);

		expect(
			employeeListCalls.some(
				(params) =>
					String(params?.filter || "").includes("departmentId:dept-1") &&
					String(params?.filter || "").includes("reportToId:manager-1"),
			),
		).toBe(true);
	}, 15_000);

	it("sets BNPI direct employees as workforceSource=DIRECT", async () => {
		renderEmployeeList();

		const user = await openAgencyFilter();
		await user.click(screen.getByText("BNPI / Direct"));

		await waitFor(() => {
			expect(screen.getByLabelText("location-search")).toHaveTextContent(
				"workforceSource=DIRECT",
			);
		});
		expect(screen.getByLabelText("location-search")).not.toHaveTextContent("agency=");
	}, 15_000);

	it("sets agency employees as workforceSource=AGENCY with agency id", async () => {
		renderEmployeeList();

		const user = await openAgencyFilter();
		await user.click(screen.getByText("AGY1 - Agency One"));

		await waitFor(() => {
			expect(screen.getByLabelText("location-search")).toHaveTextContent(
				"workforceSource=AGENCY",
			);
		});
		expect(screen.getByLabelText("location-search")).toHaveTextContent("agency=agency-1");
	}, 15_000);
});
