// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { EmploymentCompensationForm } from "./EmploymentCompensationForm";

const mockData = vi.hoisted(() => ({
	departments: [] as any[],
	sections: [] as any[],
	positions: [] as any[],
	levels: [] as any[],
}));

globalThis.ResizeObserver =
	globalThis.ResizeObserver ||
	class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn();

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartment: (id: string) => ({
		data:
			mockData.departments.find(
				(department) => String(department._id || department.id) === String(id),
			) || null,
	}),
	useDepartments: () => ({ data: { departments: mockData.departments } }),
}));

vi.mock("~/lib/hooks/useSections", () => ({
	useSections: () => ({ data: { sections: mockData.sections } }),
}));

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: () => ({ data: { positions: mockData.positions } }),
}));

vi.mock("~/lib/hooks/useLevels", () => ({
	useLevel: (id: string) => ({
		data: mockData.levels.find((level) => String(level._id || level.id) === String(id)) || null,
	}),
	useLevels: () => ({ data: { levels: mockData.levels } }),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployee: () => ({ data: null }),
	useEmployees: () => ({ data: { employees: [] } }),
}));

vi.mock("~/lib/hooks/useAgencies", () => ({
	useAgencies: () => ({ data: { agencies: [] } }),
}));

vi.mock("~/lib/hooks/useSchedules", () => ({
	useScheduleTemplates: () => ({ data: { scheduleTemplates: [] } }),
	useShiftTypes: () => ({ data: { shiftTypes: [] } }),
}));

const longShiftCode = "WS_0600_1400_BR_1115_1145_BNPI_DIRECT_LONG_CODE_THAT_SHOULD_NOT_OVERFLOW";
const longShiftName =
	"BNPI Mon-Sat 06:00 to 14:00 Long Schedule Name That Should Stay Inside The Day Card";

const Harness = ({ defaultEmployee = {} }: { defaultEmployee?: Record<string, unknown> }) => {
	const form = useForm<any>({
		defaultValues: {
			employee: {
				...defaultEmployee,
				employmentStatus: "ACTIVE",
				employmentType: "REGULAR",
				workLocation: "ONSITE",
				workforceSource: "DIRECT",
				activeSchedule: {
					scheduleTemplateId: "",
					cycleDays: 7,
					graceLateMinutes: 0,
					graceEarlyOutMinutes: 0,
					pattern: Array.from({ length: 7 }).map((_, index) => ({
						day: index + 1,
						shiftTypeId: "",
						shiftSnapshot: {
							name: longShiftName,
							code: longShiftCode,
							isOff: false,
							timeSlots: [
								{
									type: "work",
									label: "Work",
									startTime: "06:00",
									endTime: "14:00",
								},
							],
						},
					})),
				},
			},
		},
	});

	return <EmploymentCompensationForm form={form} />;
};

describe("EmploymentCompensationForm schedule card overflow", () => {
	it("constrains long shift names and codes inside weekly day cards", () => {
		mockData.departments = [];
		mockData.sections = [];
		mockData.positions = [];
		mockData.levels = [];

		render(
			<MemoryRouter>
				<Harness />
			</MemoryRouter>,
		);

		const name = screen.getAllByTitle(longShiftName)[0];
		const code = screen.getAllByTitle(longShiftCode)[0];
		const cardButton = code.closest("button");
		const dayCard = cardButton?.parentElement;

		expect(dayCard).toHaveClass("min-w-0");
		expect(dayCard).toHaveClass("overflow-hidden");
		expect(cardButton).toHaveClass("min-w-0");
		expect(cardButton).toHaveClass("overflow-hidden");
		expect(name).toHaveClass("truncate");
		expect(code).toHaveClass("truncate");
	}, 20_000);
});

describe("EmploymentCompensationForm position prefill", () => {
	it("keeps a saved position selected even when it does not match the selected department or section", async () => {
		mockData.departments = [{ id: "dept-production", name: "Production" }];
		mockData.sections = [
			{ id: "section-production-admin", name: "Production/Administration", departmentId: "dept-production" },
		];
		mockData.positions = [
			{
				id: "position-factory-manager",
				title: "Factory Manager",
				code: "23",
				sectionId: "section-production-admin",
			},
			{
				id: "position-deputy-general-manager",
				title: "Deputy General Manager",
				code: "19",
				sectionId: "section-management",
			},
		];
		mockData.levels = [{ id: "level-19", name: "Level 19" }];

		render(
			<MemoryRouter>
				<Harness
					defaultEmployee={{
						departmentId: "dept-production",
						sectionId: "section-production-admin",
						positionId: "position-deputy-general-manager",
						levelId: "level-19",
					}}
				/>
			</MemoryRouter>,
		);

		expect(await screen.findByText("Deputy General Manager (19)")).toBeInTheDocument();
		expect(screen.queryByText("Match department/section")).not.toBeInTheDocument();
	});

	it("shows all loaded positions in the position dropdown regardless of department or section", async () => {
		const user = userEvent.setup();
		mockData.departments = [{ id: "dept-production", name: "Production" }];
		mockData.sections = [
			{ id: "section-production-admin", name: "Production/Administration", departmentId: "dept-production" },
		];
		mockData.positions = [
			{
				id: "position-factory-manager",
				title: "Factory Manager",
				code: "23",
				sectionId: "section-production-admin",
			},
			{
				id: "position-deputy-general-manager",
				title: "Deputy General Manager",
				code: "19",
				sectionId: "section-management",
			},
		];
		mockData.levels = [];

		const { container } = render(
			<MemoryRouter>
				<Harness
					defaultEmployee={{
						departmentId: "dept-production",
						sectionId: "section-production-admin",
						positionId: "position-deputy-general-manager",
					}}
				/>
			</MemoryRouter>,
		);

		const positionButton = container.querySelector(
			'[data-field-path="employee.positionId"] button',
		);
		expect(positionButton).not.toBeNull();

		await user.click(positionButton as HTMLButtonElement);

		expect(await screen.findByText("Factory Manager (23)")).toBeInTheDocument();
		expect(screen.getAllByText("Deputy General Manager (19)").length).toBeGreaterThan(0);
	});
});
