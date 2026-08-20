// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ScheduleTab } from "./schedule-tab";

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({ user: { role: "hris-hr-manager" } }),
}));

vi.mock("~/lib/hooks", () => ({
	useEmployeeSchedules: () => ({ data: { schedules: [] } }),
	useEmployeeScheduleCalendar: () => ({
		data: { days: [] },
		error: null,
		isLoading: false,
		isFetching: false,
	}),
	useScheduleOverrides: () => ({ data: { scheduleOverrides: [] } }),
	useCreateEmployeeSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const employee = {
	id: "emp-zen",
	employeeId: "00010",
	person: { personalInfo: { firstName: "Zen", lastName: "Andrei" } },
	embeddedSchedule: {
		cycleDays: 7,
		templateName: "Weekly hours",
		pattern: [],
	},
} as any;

describe("ScheduleTab change schedule", () => {
	it("shows Change schedule for HR on the work schedule tab", () => {
		render(
			<MemoryRouter>
				<ScheduleTab employee={employee} />
			</MemoryRouter>,
		);
		expect(screen.getByTestId("change-weekly-hours")).toHaveTextContent("Change schedule");
		expect(screen.getByRole("link", { name: /full editor/i })).toHaveAttribute(
			"href",
			"/hr/employees/emp-zen/edit",
		);
	});
});
