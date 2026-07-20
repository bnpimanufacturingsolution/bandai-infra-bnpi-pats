// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { exportReport } from "~/lib/utils/report-export";
import { ManpowerDistributionTab } from "./ManpowerDistributionTab";

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
		"@tanstack/react-query",
	);
	return {
		...actual,
		useQuery: vi.fn(),
	};
});

vi.mock("~/lib/utils/report-export", async () => {
	const actual = await vi.importActual<typeof import("~/lib/utils/report-export")>(
		"~/lib/utils/report-export",
	);
	return {
		...actual,
		exportReport: vi.fn(() => Promise.resolve()),
	};
});

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

const makeEmployee = () => ({
	id: "employee-1",
	organizationId: "org-1",
	employeeId: "EMP-001",
	personId: "person-1",
	userId: "user-1",
	employmentHireDate: "2026-01-01",
	employmentStatus: "ACTIVE",
	employmentType: "REGULAR",
	departmentId: "dept-1",
	positionId: "position-operator",
	workLocation: "ONSITE",
	basicSalary: 0,
	currency: "PHP",
	payFrequency: "SEMI_MONTHLY",
	isDeleted: false,
	isTour: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	workforceSource: "DIRECT",
	department: {
		id: "dept-1",
		organizationId: "org-1",
		name: "Manufacturing",
		code: "MFG",
		managerId: "manager-1",
		isActive: true,
		isDefault: false,
		isDeleted: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	section: { id: "section-1", name: "Assembly", code: "ASSY", departmentId: "dept-1" },
	position: {
		id: "position-operator",
		organizationId: "org-1",
		title: "Operator",
		code: "OPR",
		departmentId: "dept-1",
		isActive: true,
		isDeleted: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
});

describe("ManpowerDistributionTab export", () => {
	it("includes databank sheets in the workforce export config", async () => {
		vi.mocked(useEmployees).mockReturnValue({
			data: { employees: [makeEmployee()] },
			isLoading: false,
			error: null,
		} as any);

		vi.mocked(useQuery).mockReturnValue({
			data: {
				directAgencySnapshot: {
					date: "2026-04-30",
					direct: 1,
					agency: 0,
					total: 1,
				},
			},
			isLoading: false,
			error: null,
		} as any);

		render(
			<MemoryRouter>
				<ManpowerDistributionTab />
			</MemoryRouter>,
		);

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /export/i }));
		await user.click(screen.getByRole("button", { name: /export xlsx/i }));

		await waitFor(() => {
			expect(exportReport).toHaveBeenCalledWith(
				expect.objectContaining({
					format: "xlsx",
					config: expect.objectContaining({
						xlsxSheets: expect.arrayContaining([
							expect.objectContaining({ name: "Position Summary" }),
							expect.objectContaining({ name: "Employment Type Summary" }),
						]),
					}),
				}),
			);
		});
	}, 15_000);

	it("includes the existing Gender Summary and Agency Summary sheets in the export", async () => {
		vi.mocked(useEmployees).mockReturnValue({
			data: { employees: [makeEmployee()] },
			isLoading: false,
			error: null,
		} as any);

		vi.mocked(useQuery).mockReturnValue({
			data: null,
			isLoading: false,
			error: null,
		} as any);

		render(
			<MemoryRouter>
				<ManpowerDistributionTab />
			</MemoryRouter>,
		);

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /export/i }));
		await user.click(screen.getByRole("button", { name: /export xlsx/i }));

		await waitFor(() => {
			expect(exportReport).toHaveBeenCalledWith(
				expect.objectContaining({
					config: expect.objectContaining({
						xlsxSheets: expect.arrayContaining([
							expect.objectContaining({ name: "Gender Summary" }),
							expect.objectContaining({ name: "Agency Summary" }),
							expect.objectContaining({ name: "Position Summary" }),
							expect.objectContaining({ name: "Employment Type Summary" }),
						]),
					}),
				}),
			);
		});
	}, 15_000);

	it("shows the Manpower Databank section heading in the rendered tab", async () => {
		vi.mocked(useEmployees).mockReturnValue({
			data: { employees: [makeEmployee()] },
			isLoading: false,
			error: null,
		} as any);

		vi.mocked(useQuery).mockReturnValue({
			data: null,
			isLoading: false,
			error: null,
		} as any);

		render(
			<MemoryRouter>
				<ManpowerDistributionTab />
			</MemoryRouter>,
		);

		expect(await screen.findByText("Manpower Databank")).toBeInTheDocument();
	}, 15_000);
});
