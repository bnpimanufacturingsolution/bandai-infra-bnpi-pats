// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import WorkforceRecruitmentSettingsModule from "./WorkforceRecruitmentSettingsModule";

const useDepartmentsMock = vi.fn();
const usePositionsMock = vi.fn();
const useLevelsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useSettingsMock = vi.fn();
const useUpdateSettingsMock = vi.fn();
const useRequestContextMock = vi.fn();

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: (...args: unknown[]) => useDepartmentsMock(...args),
}));

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: (...args: unknown[]) => usePositionsMock(...args),
}));

vi.mock("~/lib/hooks/useLevels", () => ({
	useLevels: (...args: unknown[]) => useLevelsMock(...args),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: (...args: unknown[]) => useEmployeesMock(...args),
}));

vi.mock("~/lib/hooks/useWorkforceRecruitmentSettings", () => ({
	useWorkforceRecruitmentSettings: (...args: unknown[]) => useSettingsMock(...args),
	useUpdateWorkforceRecruitmentSettings: (...args: unknown[]) =>
		useUpdateSettingsMock(...args),
	useWorkforceRecruitmentRequestContext: (...args: unknown[]) =>
		useRequestContextMock(...args),
}));

beforeAll(() => {
	if (!window.PointerEvent) {
		vi.stubGlobal("PointerEvent", MouseEvent);
	}

	Object.defineProperties(HTMLElement.prototype, {
		hasPointerCapture: {
			configurable: true,
			value: () => false,
		},
		releasePointerCapture: {
			configurable: true,
			value: () => undefined,
		},
		scrollIntoView: {
			configurable: true,
			value: () => undefined,
		},
	});
});

const departments = [{ id: "department-manufacturing", name: "Manufacturing" }];
const levels = [
	{ id: "level-junior", name: "Junior", rank: 1 },
	{ id: "level-mid", name: "Mid", rank: 2 },
	{ id: "level-senior", name: "Senior", rank: 3 },
	{ id: "level-lead", name: "Lead", rank: 4 },
];
const positions = [
	{
		id: "position-operator",
		title: "Production Operator",
		sectionId: "section-assembly",
		section: {
			id: "section-assembly",
			name: "Assembly",
			departmentId: "department-manufacturing",
			department: { id: "department-manufacturing", name: "Manufacturing" },
		},
		levels: [{ id: "level-junior", name: "Junior", rank: 1 }],
	},
	{
		id: "position-floating",
		title: "Floating Technician",
		departmentId: "department-manufacturing",
		levels: [{ id: "level-mid", name: "Mid", rank: 2 }],
	},
];
const settings = {
	isEnabled: true,
	enforceDepartmentManagerScope: true,
	defaultWorkflowCode: "JOB-REQ",
	requestSubtype: "DEPARTMENT_JOB_REQUISITION" as const,
	autoCreateJobOnApproval: true,
	policies: [],
};

const mockReadyHooks = ({
	mockPositions = positions,
	mockLevels = levels,
}: {
	mockPositions?: any[];
	mockLevels?: any[];
} = {}) => {
	useDepartmentsMock.mockReturnValue({
		data: { departments },
		isLoading: false,
	});
	usePositionsMock.mockReturnValue({
		data: { positions: mockPositions },
		isLoading: false,
	});
	useLevelsMock.mockReturnValue({
		data: { levels: mockLevels },
		isLoading: false,
	});
	useEmployeesMock.mockReturnValue({
		data: { employees: [] },
		isLoading: false,
	});
	useSettingsMock.mockReturnValue({
		data: settings,
		isLoading: false,
	});
	useUpdateSettingsMock.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
	useRequestContextMock.mockReturnValue({
		data: { headcount: { currentHeadcount: 0, availableHeadcount: null } },
		isLoading: false,
	});
};

beforeEach(() => {
	vi.clearAllMocks();
	mockReadyHooks();
});

describe("WorkforceRecruitmentSettingsModule coverage terminology", () => {
	it("renders real sections as section accordions and missing-section rows in a separate block", async () => {
		render(<WorkforceRecruitmentSettingsModule showHeader={false} />);

		await waitFor(() => {
			expect(screen.getByText("Assembly")).toBeInTheDocument();
		});

		expect(screen.queryByText("Department scope")).not.toBeInTheDocument();
		expect(screen.queryByText("Unassigned section")).not.toBeInTheDocument();
		expect(screen.getAllByRole("columnheader", { name: "Level" }).length).toBeGreaterThan(0);
		expect(
			screen.queryByRole("columnheader", { name: "Target" }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Production Operator")).toBeInTheDocument();
		expect(screen.getByText("Floating Technician")).toBeInTheDocument();
		expect(screen.getByText("Positions without section")).toBeInTheDocument();
		expect(screen.getAllByText("1 positions / 1 levels").length).toBeGreaterThan(0);
	});

	it("requests and renders every linked level available to the HR job-create flow", async () => {
		mockReadyHooks({
			mockPositions: [
				{
					id: "position-operator",
					title: "Production Operator",
					sectionId: "section-assembly",
					section: {
						id: "section-assembly",
						name: "Assembly",
						departmentId: "department-manufacturing",
						department: {
							id: "department-manufacturing",
							name: "Manufacturing",
						},
					},
					levels: [
						{ id: "relation-3", levelId: "level-senior" },
						{ id: "relation-1", levelId: "level-junior" },
						{ id: "relation-4", levelId: "level-lead" },
						{ id: "relation-2", levelId: "level-mid" },
					],
				},
			],
		});

		render(<WorkforceRecruitmentSettingsModule showHeader={false} />);

		await waitFor(() => {
			expect(screen.getByText("Production Operator")).toBeInTheDocument();
		});

		expect(useLevelsMock).toHaveBeenCalledWith({ limit: 1000 });
		expect(usePositionsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.stringContaining("levels.levelId"),
			}),
		);
		expect(usePositionsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.stringContaining("levels.level.name"),
			}),
		);
		expect(screen.getByText("Junior")).toBeInTheDocument();
		expect(screen.getByText("Mid")).toBeInTheDocument();
		expect(screen.getByText("Senior")).toBeInTheDocument();
		expect(screen.getByText("Lead")).toBeInTheDocument();
		expect(screen.getByText("1 positions / 4 levels")).toBeInTheDocument();
	});
});
